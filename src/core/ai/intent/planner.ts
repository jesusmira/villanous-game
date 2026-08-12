// ─── Planificador ──────────────────────────────────────────────────────────────────
// Orquesta el turno completo: elige la intención (mayor score() entre universales + propias
// del villano), mueve el peón con lectura del rival, y en la fase ACTIVATE busca la SECUENCIA de
// acciones (no una acción suelta) que mejor sirve a esa intención, con rollout de varias jugadas
// para no ser ciego a combos ("Vencer al bloqueante → jugar la carta que libera"). Registra todo
// en un TurnAudit.
import { ActionType, CardType, TurnPhase } from '../../types';
import type { CardInstId, GameState, LocationId, PlayerId } from '../../types';
import { getPlugin, getEffectDef } from '../../villains/registry';
import { EffectId } from '../../villains/effectIds';
import { getPlayer, getEffectiveStrength } from '../../engine/stateHelpers';
import { getAvailableSlotIndices, getActionAtSlot } from '../../engine/slotHelpers';
import { canVanquishFree } from '../../engine/RuleEngine';
import {
  movePawn, skipMove, endActivatePhase, drawCards, activateRaven, activateSherif,
} from '../../engine/GameEngine';
import {
  resolveCuervo, resolveDemosles, resolveTrampaMove, resolveTrampaVanquish, skipTrampa,
} from '../../engine/PendingStateResolver';
import { chooseDemoslesResolution } from '../../villains/hook/aiHelpers';
import type { OpponentProfile } from '../opponentModel';
import { buildAIContext } from './context';
import { universalIntentions } from './universalIntentions';
import { generateSlotCandidates, generatePayToDiscardCandidates, chooseCuervoAction } from './legalMoves';
import { scoreAction } from './actionScoring';
import { logTurnAudit } from './auditor';
import type { AuditedAction, IntentionDef, IntentionSummary, ScoredAction, ScoredIntention, TurnAudit } from './types';

/** Despoja la función `evaluate` antes de guardar en el TurnAudit (postMessage no clona funciones). */
function toSummary(i: ScoredIntention): IntentionSummary {
  return { id: i.id, name: i.name, score: i.score, polarity: i.polarity };
}

const ACTIVATE_ROLLOUT_DEPTH = 3;
const ACTIVATE_BREADTH = 6;
const MAX_ACTIVATE_ITERATIONS = 20;
const MOVE_BREADTH = 4;
/** Margen por debajo del cual se prefiere un destino que SÍ hace algo frente a uno que no hace
 *  nada, aunque puntúe un poco mejor — misma salvaguarda que el motor anterior (ver memoria
 *  project_ai_dest_noop_fix), reescalada a la magnitud de la puntuación por delta nueva. */
const NOOP_OVERRIDE_MARGIN = 50;
export let AI_DEBUG_TRACE = false; // interruptor temporal de depuración, activado por scripts de diagnóstico
export function setAIDebugTrace(v: boolean): void { AI_DEBUG_TRACE = v; }

export interface PlanRecord {
  actionsTaken: AuditedAction[];
  ignoredAlternatives: AuditedAction[];
  steps: GameState[];
}

// ─── Elección de intención ─────────────────────────────────────────────────────────

export function chooseIntention(
  state: GameState, playerId: PlayerId, profile?: OpponentProfile,
): { chosen: ScoredIntention; all: ScoredIntention[] } {
  const ctx = buildAIContext(state, playerId, profile);
  const defs: IntentionDef[] = [...universalIntentions, ...(ctx.plugin.intentions ?? [])];
  const all = defs.map(i => ({ ...i, score: i.evaluate(ctx) })).sort((a, b) => b.score - a.score);
  return { chosen: all[0], all };
}

/** Valoración rápida de un estado (sin acción de referencia) — solo para decisiones binarias
 *  puntuales (Cuervo/Sheriff/Trampa/Condiciones) que no pasan por el puntuador de acciones por
 *  delta. Exportada como quickStateValue para core/ai/conditionAI.ts. */
export function quickStateValue(state: GameState, playerId: PlayerId, chosen: IntentionDef, profile?: OpponentProfile): number {
  const ctx = buildAIContext(state, playerId, profile);
  return ctx.ownProgress * 8 + chosen.evaluate(ctx);
}
const quickValue = quickStateValue;

// ─── Pendientes propios (Démosles un susto, Trampa) ───────────────────────────────

function bestTrampaVanquish(
  state: GameState, playerId: PlayerId, chosen: IntentionDef, profile?: OpponentProfile,
): GameState {
  let best = skipTrampa(state);
  let bestVal = quickValue(best, playerId, chosen, profile);
  const player = getPlayer(state, playerId);
  for (const ls of Object.values(player.locationStates)) {
    for (const heroId of ls.heroCardInstIds) {
      const heroStr = getEffectiveStrength(state, heroId);
      const needsMultiple = (state.allCards[heroId]?.effectIds ?? [])
        .some(id => getEffectDef(id)?.requiresMultipleAlliesToVanquish);
      const allies = ls.villainCardInstIds
        .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
        .sort((a, b) => getEffectiveStrength(state, b) - getEffectiveStrength(state, a));
      const chosenAllies: CardInstId[] = [];
      let total = 0;
      for (const a of allies) {
        chosenAllies.push(a);
        total += getEffectiveStrength(state, a);
        if (total >= heroStr && (!needsMultiple || chosenAllies.length >= 2)) break;
      }
      if (total < heroStr) continue;
      if (!canVanquishFree(state, playerId, heroId, chosenAllies).valid) continue;
      const next = resolveTrampaVanquish(state, heroId, chosenAllies);
      const val = quickValue(next, playerId, chosen, profile);
      if (val > bestVal) { bestVal = val; best = next; }
    }
  }
  return best;
}

function resolveTrampaForAI(
  state: GameState, playerId: PlayerId, chosen: IntentionDef, profile?: OpponentProfile,
): GameState {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  let best = skipTrampa(state);
  let bestVal = quickValue(best, playerId, chosen, profile);
  for (const ls of Object.values(player.locationStates)) {
    for (const allyId of ls.villainCardInstIds) {
      const ally = state.allCards[allyId];
      if (ally?.cardType !== CardType.ALLY || ally.attachedToInstId) continue;
      for (const loc of plugin.locations) {
        if (loc.id === ally.locationId) continue;
        if (player.locationStates[loc.id]?.isLocked) continue;
        const moved = resolveTrampaMove(state, allyId, loc.id);
        if (moved === state) continue;
        const next = bestTrampaVanquish(moved, playerId, chosen, profile);
        const val = quickValue(next, playerId, chosen, profile);
        if (val > bestVal) { bestVal = val; best = next; }
      }
    }
  }
  return best;
}

function autoResolveOwnPendings(
  state: GameState, playerId: PlayerId, chosen: IntentionDef, profile?: OpponentProfile,
): GameState {
  let s = state;
  if (s.pendingDemosles?.playerId === playerId) {
    const { discardIds, orderedKeepIds } = chooseDemoslesResolution(s, s.pendingDemosles);
    s = resolveDemosles(s, discardIds, orderedKeepIds);
  }
  if (s.trampaActive === playerId) s = resolveTrampaForAI(s, playerId, chosen, profile);
  if (s.trampaVanquish === playerId) s = bestTrampaVanquish(s, playerId, chosen, profile);
  return s;
}

// ─── Habilidades previas al movimiento (Cuervo, Sheriff) ──────────────────────────

function maybeUseRaven(
  state: GameState, playerId: PlayerId, chosen: IntentionDef, profile: OpponentProfile | undefined, record: PlanRecord,
): GameState {
  let s = state;
  if (s.turnPhase !== TurnPhase.MOVE) return s;
  const player = getPlayer(s, playerId);
  if (player.ravenUsedThisTurn) return s;
  const ravenId = Object.values(s.allCards).find(
    c => c.ownerId === playerId && c.effectIds.includes(EffectId.RAVEN_ACTIVATE) && c.locationId,
  )?.instId;
  if (!ravenId) return s;

  const plugin = getPlugin(player.villainId);
  const openLocs = plugin.locations.filter(l => !player.locationStates[l.id]?.isLocked);
  let bestVal = quickValue(s, playerId, chosen, profile);
  let bestDest: LocationId | undefined;
  for (const loc of openLocs) {
    const afterRaven = activateRaven(s, playerId, ravenId, loc.id);
    let resolved = afterRaven;
    if (resolved.pendingCuervo) {
      const { action, params } = chooseCuervoAction(resolved);
      resolved = resolveCuervo(resolved, action, params);
    }
    const val = quickValue(resolved, playerId, chosen, profile);
    if (val > bestVal) { bestVal = val; bestDest = loc.id; }
  }
  if (bestDest) {
    s = activateRaven(s, playerId, ravenId, bestDest);
    if (s.pendingCuervo) {
      const { action, params } = chooseCuervoAction(s);
      s = resolveCuervo(s, action, params);
    }
    record.steps.push(s);
  }
  return s;
}

function maybeUseSherif(
  state: GameState, playerId: PlayerId, chosen: IntentionDef, profile: OpponentProfile | undefined, record: PlanRecord,
): GameState {
  let s = state;
  if (s.turnPhase !== TurnPhase.MOVE) return s;
  const player = getPlayer(s, playerId);
  if (player.sherifUsedThisTurn) return s;
  const sherifId = Object.values(s.allCards).find(
    c => c.ownerId === playerId && c.effectIds.includes(EffectId.JHON_SHERIF) && c.locationId,
  )?.instId;
  if (!sherifId) return s;

  const plugin = getPlugin(player.villainId);
  const curLoc = s.allCards[sherifId]?.locationId;
  const openLocs = plugin.locations.filter(l => !player.locationStates[l.id]?.isLocked && l.id !== curLoc);
  const heroLocs = openLocs.filter(l => (player.locationStates[l.id]?.heroCardInstIds.length ?? 0) > 0);

  let bestDest: LocationId | undefined;
  if (heroLocs.length > 0) {
    // Cualquiera de estas da +1 Poder garantizado (regla determinista, no una preferencia).
    let bestVal = -Infinity;
    for (const loc of heroLocs) {
      const val = quickValue(activateSherif(s, playerId, sherifId, loc.id), playerId, chosen, profile);
      if (val > bestVal) { bestVal = val; bestDest = loc.id; }
    }
  } else {
    let bestVal = quickValue(s, playerId, chosen, profile);
    for (const loc of openLocs) {
      const val = quickValue(activateSherif(s, playerId, sherifId, loc.id), playerId, chosen, profile);
      if (val > bestVal) { bestVal = val; bestDest = loc.id; }
    }
  }
  if (bestDest) {
    s = activateSherif(s, playerId, sherifId, bestDest);
    record.steps.push(s);
  }
  return s;
}

// ─── Fase ACTIVATE: rollout de secuencias ──────────────────────────────────────────

function generateAllScoredCandidates(
  state: GameState, playerId: PlayerId, chosen: IntentionDef, profile: OpponentProfile | undefined,
): ScoredAction[] {
  const ctx = buildAIContext(state, playerId, profile);
  const player = getPlayer(state, playerId);
  const available = getAvailableSlotIndices(state, playerId, player.pawnLocationId);
  const out: ScoredAction[] = [];
  for (const slotIdx of available) {
    const slot = getActionAtSlot(state, playerId, slotIdx);
    if (!slot) continue;
    for (const c of generateSlotCandidates(state, playerId, slotIdx, slot.type)) {
      out.push(scoreAction(ctx, c, chosen, playerId, profile));
    }
  }
  for (const c of generatePayToDiscardCandidates(state, playerId)) {
    out.push(scoreAction(ctx, c, chosen, playerId, profile));
  }
  out.sort((a, b) => b.breakdown.total - a.breakdown.total);
  return out;
}

/**
 * Búsqueda recursiva de la mejor SECUENCIA de acciones (no una suelta): cada candidata se valora
 * por su propio delta MÁS el mejor continuación alcanzable después de tomarla — así un Vencer que
 * "cuesta" puntos por sí solo pero abre jugar la carta que remata sí se reconoce como la mejor
 * jugada. Empate se acepta solo para Destino (nunca cuesta Poder; un jugador real se compromete
 * antes de ver qué sale, así que no se descarta por "no compensar" mirando el resultado).
 */
function bestActivateRollout(
  state: GameState, playerId: PlayerId, chosen: IntentionDef, profile: OpponentProfile | undefined, depth: number,
): { next: ScoredAction | null; val: number } {
  if (depth === 0 || state.turnPhase !== TurnPhase.ACTIVATE || state.winner) return { next: null, val: 0 };
  const all = generateAllScoredCandidates(state, playerId, chosen, profile);
  if (all.length === 0) return { next: null, val: 0 };

  let best: ScoredAction | null = null;
  let bestVal = 0; // "no hacer nada" vale 0 por construcción (puntuación por delta)
  for (const c of all.slice(0, ACTIVATE_BREADTH)) {
    const resolved = autoResolveOwnPendings(c.resultState, playerId, chosen, profile);
    const { val: continuation } = bestActivateRollout(resolved, playerId, chosen, profile, depth - 1);
    const total = c.breakdown.total + continuation;
    const isFate = c.kind === ActionType.FATE;
    const beats = isFate ? total > bestVal - 1e-9 : total > bestVal + 1e-9;
    if (beats) { bestVal = total; best = c; }
  }
  return { next: best, val: bestVal };
}

/** Ejecuta la fase ACTIVATE completa como secuencia; si se pasa `record`, audita cada paso. */
function runActivateSequence(
  state: GameState, playerId: PlayerId, chosen: IntentionDef, profile: OpponentProfile | undefined,
  record?: PlanRecord,
): { finalState: GameState; scoreSum: number } {
  let s = autoResolveOwnPendings(state, playerId, chosen, profile);
  let scoreSum = 0;
  let iterations = 0;
  while (s.turnPhase === TurnPhase.ACTIVATE && !s.winner && iterations++ < MAX_ACTIVATE_ITERATIONS) {
    const immediate = record ? generateAllScoredCandidates(s, playerId, chosen, profile) : null;
    if (record && AI_DEBUG_TRACE) {
      const pl = getPlayer(s, playerId);
      const avail = getAvailableSlotIndices(s, playerId, pl.pawnLocationId);
      console.error(`[TRACE] pawn=${pl.pawnLocationId} avail=${JSON.stringify(avail)} immediate=${immediate!.length} top=${immediate!.slice(0,3).map(c=>`${c.label}:${c.breakdown.total.toFixed(1)}`).join(',')}`);
    }
    const { next } = bestActivateRollout(s, playerId, chosen, profile, ACTIVATE_ROLLOUT_DEPTH);
    if (!next) break;
    s = autoResolveOwnPendings(next.resultState, playerId, chosen, profile);
    scoreSum += next.breakdown.total;
    if (record) {
      record.actionsTaken.push({ label: next.label, total: next.breakdown.total });
      for (const alt of (immediate ?? []).slice(0, 4)) {
        if (alt.label !== next.label) record.ignoredAlternatives.push({ label: alt.label, total: alt.breakdown.total });
      }
      record.steps.push(s);
    }
  }
  return { finalState: s, scoreSum };
}

// ─── Fase MOVE: destino con lectura del rival ──────────────────────────────────────

function simulateTurnAtDest(
  state: GameState, playerId: PlayerId, dest: LocationId, chosen: IntentionDef, profile: OpponentProfile | undefined,
): { finalState: GameState; scoreSum: number } {
  const moved = movePawn(state, playerId, dest);
  const { finalState, scoreSum } = runActivateSequence(moved, playerId, chosen, profile);
  let s = finalState;
  if (s.turnPhase === TurnPhase.ACTIVATE) s = endActivatePhase(s);
  if (s.turnPhase === TurnPhase.DRAW) s = drawCards(s, playerId);
  return { finalState: s, scoreSum };
}

/** Amenaza del rival tras nuestro turno: su propio mejor turno posible desde su posición actual
 *  (lectura de 1 turno de profundidad — qué tan bien queda plantado el rival, no una predicción
 *  de a dónde se moverá él). */
function estimateOpponentThreat(state: GameState, opponentId: PlayerId, profile: OpponentProfile | undefined): number {
  if (state.winner) return 0;
  const { chosen } = chooseIntention(state, opponentId, profile);
  const { scoreSum } = runActivateSequence(state, opponentId, chosen, profile);
  return scoreSum;
}

function pickMoveDestination(
  state: GameState, playerId: PlayerId, chosen: IntentionDef, profile: OpponentProfile | undefined,
): LocationId {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const dests = plugin.locations.filter(l => l.id !== player.pawnLocationId && !player.locationStates[l.id]?.isLocked);
  if (dests.length === 0) return player.pawnLocationId;

  // Pre-ordenar por una pasada rápida (rollout depth 1) para priorizar los candidatos más
  // prometedores antes de gastar la simulación completa en todos.
  const hinted = dests
    .map(d => {
      const moved = movePawn(state, playerId, d.id);
      const { val } = bestActivateRollout(moved, playerId, chosen, profile, 1);
      return { id: d.id, hint: val };
    })
    .sort((a, b) => b.hint - a.hint)
    .slice(0, MOVE_BREADTH);

  const opponent = state.players.find(p => p.id !== playerId);
  const evaluated = hinted.map(({ id }) => {
    const { finalState, scoreSum } = simulateTurnAtDest(state, playerId, id, chosen, profile);
    const threat = opponent ? estimateOpponentThreat(finalState, opponent.id, profile) : 0;
    return { destId: id, val: scoreSum - threat * 0.4, didSomething: finalState.usedActionSlotIndices.length > 0 };
  });

  let best = evaluated.slice().sort((a, b) => b.val - a.val)[0];
  if (!best.didSomething) {
    const alt = evaluated.filter(e => e.didSomething).sort((a, b) => b.val - a.val)[0];
    if (alt && alt.val > best.val - NOOP_OVERRIDE_MARGIN) best = alt;
  }
  return best.destId;
}

// ─── Orquestación del turno completo ───────────────────────────────────────────────

export function planTurn(
  state: GameState, playerId: PlayerId, profile?: OpponentProfile,
): { finalState: GameState; steps: GameState[]; audit: TurnAudit } {
  let s = state;
  const record: PlanRecord = { actionsTaken: [], ignoredAlternatives: [], steps: [] };
  const ruleErrors: string[] = [];
  const roundNumber = s.roundNumber;
  const villainId = getPlayer(s, playerId).villainId;

  const { chosen, all } = chooseIntention(s, playerId, profile);

  s = maybeUseRaven(s, playerId, chosen, profile, record);
  s = maybeUseSherif(s, playerId, chosen, profile, record);

  if (s.turnPhase === TurnPhase.MOVE) {
    const player = getPlayer(s, playerId);
    if (player.skipNextMove) {
      // "Desaparecer": opcional, no obligación de quedarse (ver ActionPanel.tsx del jugador
      // humano) — se compara quedarse vs la mejor alternativa de moverse.
      const stay = runActivateSequence(skipMove(s, playerId), playerId, chosen, profile);
      const dest = pickMoveDestination(s, playerId, chosen, profile);
      const moved = runActivateSequence(movePawn(s, playerId, dest), playerId, chosen, profile);
      s = moved.scoreSum > stay.scoreSum ? movePawn(s, playerId, dest) : skipMove(s, playerId);
    } else {
      const plugin = getPlugin(player.villainId);
      const dests = plugin.locations.filter(loc => loc.id !== player.pawnLocationId && !player.locationStates[loc.id]?.isLocked);
      if (dests.length > 0) {
        s = movePawn(s, playerId, pickMoveDestination(s, playerId, chosen, profile));
      }
    }
    record.steps.push(s);
  }

  let turnScoreOptimal = 0;
  let turnScoreAchieved = 0;

  if (s.turnPhase === TurnPhase.ACTIVATE) {
    const { val: projected } = bestActivateRollout(s, playerId, chosen, profile, ACTIVATE_ROLLOUT_DEPTH);
    turnScoreOptimal = projected;
    const result = runActivateSequence(s, playerId, chosen, profile, record);
    s = result.finalState;
    turnScoreAchieved = result.scoreSum;
    if (s.turnPhase === TurnPhase.ACTIVATE) s = endActivatePhase(s);
  }

  if (s.turnPhase === TurnPhase.DRAW) { s = drawCards(s, playerId); record.steps.push(s); }

  const audit: TurnAudit = {
    playerId,
    villainId,
    roundNumber,
    intentionScores: all.map(toSummary),
    chosenIntention: toSummary(chosen),
    actionsTaken: record.actionsTaken,
    ignoredAlternatives: record.ignoredAlternatives,
    ruleErrors,
    turnScoreAchieved,
    turnScoreOptimal: Math.max(turnScoreOptimal, turnScoreAchieved),
  };
  logTurnAudit(audit);

  return { finalState: s, steps: record.steps, audit };
}

// Exportados para runAIStep.ts (resolución de pendientes entre turnos, misma firma que antes).
export { resolveTrampaForAI as resolveTrampaForAIWithIntention, bestTrampaVanquish as bestTrampaVanquishWithIntention };

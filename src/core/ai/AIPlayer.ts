import { ActionType, CardType, TurnPhase } from '../types';
import type { GameState, CardInstId, LocationId, PlayerId, ActivateCardCtx } from '../types';
import { getPlugin, getEffectDef } from '../villains/registry';
import { EffectId, CardDefId } from '../villains/effectIds';
import { HookLocationId } from '../villains/hook/cards';
import { heroHasBurla, chooseDemoslesResolution } from '../villains/hook/aiHelpers';
import { getPlayer, getEffectiveStrength, computeKingdomCostMod } from '../engine/stateHelpers';
import { getAvailableSlotIndices, getActionAtSlot } from '../engine/slotHelpers';
import {
  canPlayCard, canVanquish, canVanquishFree, canMoveItemAlly,
  canMoveHero, canFate, canActivateCard, canDiscard, canPayToDiscardItem,
} from '../engine/RuleEngine';
import {
  movePawn, skipMove, gainPower, playCard, vanquish, moveItemAlly,
  moveHero, startFate, resolveFate, activateCard, discardFromHand,
  endActivatePhase, drawCards, activateRaven, payToDiscardItem,
} from '../engine/GameEngine';
import {
  resolveCuervo, resolveDemosles,
  resolveTrampaMove, resolveTrampaVanquish, skipTrampa,
} from '../engine/PendingStateResolver';
import type { CuervoResolutionParams } from '../engine/PendingStateResolver';
import { scoreLocation, pickBestPlayTarget, locHasCurse } from './scoring';
import { evaluateState, getDeadHandCards } from './evaluate';
import { buildPlayCtx } from './contextBuilder';
import { pickFavoredDestination } from './opponentModel';
import type { OpponentProfile } from './opponentModel';

// ─── AI TURN EXECUTION ────────────────────────────────────────────────────────

export function runAITurn(state: GameState, profile?: OpponentProfile): GameState[] {
  const steps: GameState[] = [];
  let s = state;
  const playerId = s.players[s.currentPlayerIndex].id;

  // RAVEN — Maléfica puede mover el Cuervo ANTES de mover el peón (una vez por turno).
  if (s.turnPhase === TurnPhase.MOVE) {
    const player0 = getPlayer(s, playerId);
    if (!player0.ravenUsedThisTurn) {
      const ravenId = Object.values(s.allCards).find(
        c => c.ownerId === playerId && c.effectIds.includes(EffectId.RAVEN_ACTIVATE) && c.locationId,
      )?.instId;
      if (ravenId) {
        const plugin0 = getPlugin(player0.villainId);
        const openLocs = plugin0.locations.filter(l => !player0.locationStates[l.id]?.isLocked);
        let bestRavenDest: LocationId | undefined;
        let bestRavenVal = evaluateState(s, playerId, profile); // solo mover si mejora
        for (const loc of openLocs) {
          const afterRaven = activateRaven(s, playerId, ravenId, loc.id);
          // Auto-resolver el pendingCuervo para ver el efecto completo.
          const resolved = afterRaven.pendingCuervo
            ? (() => { const { action, params } = chooseCuervoAction(afterRaven); return resolveCuervo(afterRaven, action, params); })()
            : afterRaven;
          const val = evaluateState(playOutActivate(movePawn(resolved, playerId, player0.pawnLocationId === loc.id ? openLocs.find(l => l.id !== player0.pawnLocationId)?.id ?? loc.id : player0.pawnLocationId), playerId, undefined, 1, profile), playerId, profile);
          if (val > bestRavenVal) { bestRavenVal = val; bestRavenDest = loc.id; }
        }
        if (bestRavenDest) {
          s = activateRaven(s, playerId, ravenId, bestRavenDest);
          if (s.pendingCuervo) {
            const { action, params } = chooseCuervoAction(s);
            s = resolveCuervo(s, action, params);
          }
          steps.push(s);
        }
      }
    }
  }

  // MOVE phase — lookahead profundidad-2: simula el TURNO COMPLETO en cada destino
  // y se mueve al que deja el mejor estado final (piensa qué podrá hacer allí).
  if (s.turnPhase === TurnPhase.MOVE) {
    const player = getPlayer(s, playerId);
    if (player.skipNextMove) {
      s = skipMove(s, playerId);
    } else {
      const plugin = getPlugin(player.villainId);
      const dests = plugin.locations
        .filter(loc => loc.id !== player.pawnLocationId && !player.locationStates[loc.id]?.isLocked);

      if (dests.length > 0) {
        s = movePawn(s, playerId, minimaxBestDest(s, playerId, profile));
      }
    }
    steps.push(s);
  }

  if (s.turnPhase !== TurnPhase.ACTIVATE) {
    if (s.turnPhase === TurnPhase.DRAW) { s = drawCards(s, playerId); steps.push(s); }
    return steps;
  }

  // ACTIVATE phase (real) — con rollout profundo: ve combos de varias acciones
  // (p. ej. Vencer al bloqueante → jugar la Maldición en la ubicación liberada).
  s = playOutActivate(s, playerId, steps, ROLLOUT_DEPTH, profile);

  // DRAW phase
  if (s.turnPhase === TurnPhase.ACTIVATE) s = endActivatePhase(s);
  if (s.turnPhase === TurnPhase.DRAW) { s = drawCards(s, playerId); steps.push(s); }

  return steps;
}

// FASE 3: profundidad del rollout en la fase ACTIVATE del turno real. Cada acción se
// valora por el MEJOR final de turno alcanzable después de tomarla, no por su efecto
// inmediato — sin esto, un Vencer que "pierde" bonos de preparación pero habilita jugar
// la Maldición ganadora en la siguiente acción se rechazaba siempre.
const ROLLOUT_DEPTH = 3;

// FASE 5: profundidad del rollout usada al EVALUAR CANDIDATOS DE DESTINO (dentro de
// simulateTurnAtDest, llamado desde el minimax de movimiento). Antes se usaba profundidad 1
// (deep=false) ahí, así que un combo de 2 acciones (jugar Aliado → Vencer al héroe) nunca se
// veía al decidir A DÓNDE moverse: la primera acción del combo, jugar el Aliado, casi siempre
// puntúa peor que no hacer nada si se mira aislada (paga su coste sin poder rematar el Vencer
// en la misma acción), así que la ubicación con el héroe nunca ganaba la comparación de destino
// aunque el turno real (con ROLLOUT_DEPTH=3) sí hubiera sabido resolver el combo una vez allí.
// Se usa 2 en vez de ROLLOUT_DEPTH (3) para no multiplicar demasiado el coste: esta profundidad
// se paga en CADA candidato de CADA nodo del minimax a 2 plies (varias veces por decisión).
const DEST_ROLLOUT_DEPTH = 2;

/**
 * Valor de `s` mirando hasta `depth` acciones hacia delante dentro del mismo turno.
 * Devuelve la mejor primera acción (o null si quedarse quieto es lo mejor) y su valor.
 */
/**
 * Cartas propias con `payToDiscardCost` (p. ej. Buen Disfraz) que se pueden descartar pagando
 * su coste — no consumen casilla de acción, así que se prueban aparte de `available`. Sin esto
 * la IA nunca aprovecha el combo "pagar para quitar el disfraz → Vencer al héroe" y se queda
 * con héroes bloqueados para siempre (ver [[project-ai-gradient-trap]]).
 */
function tryPayToDiscardCandidates(s: GameState, playerId: PlayerId): GameState[] {
  const player = getPlayer(s, playerId);
  const payable = [...player.handInstIds, ...Object.values(player.locationStates).flatMap(ls => ls.villainCardInstIds)]
    .filter(id => s.allCards[id]?.effectIds.some(eid => getEffectDef(eid)?.payToDiscardCost));
  return payable
    .filter(id => canPayToDiscardItem(s, playerId, id).valid)
    .map(id => payToDiscardItem(s, playerId, id));
}

function bestActionByRollout(
  s: GameState, playerId: PlayerId, depth: number, profile?: OpponentProfile,
): { next: GameState | null; val: number } {
  const stopVal = evaluateState(s, playerId, profile);
  if (depth === 0 || s.turnPhase !== TurnPhase.ACTIVATE || s.winner) return { next: null, val: stopVal };
  const player = getPlayer(s, playerId);
  const available = getAvailableSlotIndices(s, playerId, player.pawnLocationId);
  const payCandidates = tryPayToDiscardCandidates(s, playerId);
  if (available.length === 0 && payCandidates.length === 0) return { next: null, val: stopVal };

  let best: GameState | null = null;
  let bestVal = stopVal;
  for (const slotIdx of available) {
    const slot = getActionAtSlot(s, playerId, slotIdx);
    if (!slot) continue;
    const next = tryActionForSlot(s, playerId, slotIdx, slot);
    if (!next) continue;
    const { val } = bestActionByRollout(next, playerId, depth - 1, profile);
    if (val > bestVal + 1e-9) { bestVal = val; best = next; }
  }
  for (const next of payCandidates) {
    const { val } = bestActionByRollout(next, playerId, depth - 1, profile);
    if (val > bestVal + 1e-9) { bestVal = val; best = next; }
  }
  return { next: best, val: bestVal };
}

// ─── ACTIVATE play-out: aplica la mejor acción hasta agotar ──────────────────────
// Si `steps` se pasa, registra cada estado intermedio (para la animación de la IA).
// `depth` controla cuántas acciones adelante ve bestActionByRollout en cada paso: 1 (voraz)
// para los "hints" de pre-ordenación de destinos, DEST_ROLLOUT_DEPTH al evaluar candidatos de
// destino de verdad (simulateTurnAtDest) y ROLLOUT_DEPTH en el turno REAL.
function playOutActivate(
  state: GameState, playerId: PlayerId, steps?: GameState[], depth = 1, profile?: OpponentProfile,
): GameState {
  let s = state;
  const MAX_ITERATIONS = 20;
  let iterations = 0;
  while (s.turnPhase === TurnPhase.ACTIVATE && iterations++ < MAX_ITERATIONS) {
    const { next } = bestActionByRollout(s, playerId, depth, profile);
    // El rollout ya contempla "no hacer nada" como opción: si nada supera quedarse
    // quieto (con margen 1e-9), devuelve null y el turno de acciones termina.
    if (!next) break;
    s = next;
    if (steps) steps.push(s);
  }
  return s;
}

// ─── Candidate action producers (puros: devuelven el estado resultante o null) ───

function tryActionForSlot(
  s: GameState, playerId: PlayerId, slotIdx: number, slot: { type: ActionType; value?: number },
): GameState | null {
  switch (slot.type) {
    case ActionType.GAIN_POWER:     return gainPower(s, playerId, slotIdx);
    case ActionType.PLAY_CARD:      return tryPlayCard(s, playerId, slotIdx);
    case ActionType.VANQUISH:       return tryVanquish(s, playerId, slotIdx);
    case ActionType.MOVE_ITEM_ALLY: return tryMoveItemAlly(s, playerId, slotIdx);
    case ActionType.MOVE_HERO:      return tryMoveHero(s, playerId, slotIdx);
    case ActionType.FATE:           return tryFate(s, playerId, slotIdx);
    case ActionType.ACTIVATE_CARD:  return tryActivateCard(s, playerId, slotIdx);
    case ActionType.DISCARD:        return tryDiscard(s, playerId, slotIdx);
    default:                        return null;
  }
}

/**
 * Resuelve estados pendientes que una jugada de la propia IA acaba de crear (p. ej. Démosles
 * un susto → pendingDemosles, Trampa → mover Aliado + Vencer gratuito). Sin esto, la
 * simulación evaluaba el estado SIN resolver: solo veía el coste pagado y ningún beneficio,
 * así que esas cartas no se jugaban jamás.
 */
function autoResolveOwnPendings(s: GameState, playerId: PlayerId): GameState {
  if (s.pendingDemosles?.playerId === playerId) {
    const { discardIds, orderedKeepIds } = chooseDemoslesResolution(s, s.pendingDemosles);
    s = resolveDemosles(s, discardIds, orderedKeepIds);
  }
  if (s.trampaActive === playerId) s = resolveTrampaForAI(s, playerId);
  if (s.trampaVanquish === playerId) s = bestTrampaVanquish(s, playerId);
  return s;
}

/**
 * Trampa (fase 2) para la IA: mejor Vencer gratuito posible con aliados mínimos, o
 * renunciar si ninguno mejora el estado.
 */
export function bestTrampaVanquish(state: GameState, playerId: PlayerId): GameState {
  let best = skipTrampa(state);
  let bestVal = evaluateState(best, playerId);
  const player = getPlayer(state, playerId);
  for (const ls of Object.values(player.locationStates)) {
    for (const heroId of ls.heroCardInstIds) {
      const heroStr = getEffectiveStrength(state, heroId);
      const needsMultiple = (state.allCards[heroId]?.effectIds ?? [])
        .some(id => getEffectDef(id)?.requiresMultipleAlliesToVanquish);
      const allies = ls.villainCardInstIds
        .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
        .sort((a, b) => getEffectiveStrength(state, b) - getEffectiveStrength(state, a));
      const chosen: CardInstId[] = [];
      let total = 0;
      for (const a of allies) {
        chosen.push(a);
        total += getEffectiveStrength(state, a);
        if (total >= heroStr && (!needsMultiple || chosen.length >= 2)) break;
      }
      if (total < heroStr) continue;
      if (!canVanquishFree(state, playerId, heroId, chosen).valid) continue;
      const next = resolveTrampaVanquish(state, heroId, chosen);
      const val = evaluateState(next, playerId);
      if (val > bestVal) { bestVal = val; best = next; }
    }
  }
  return best;
}

/**
 * Trampa (fase 1) para la IA: prueba cada Aliado × ubicación, encadena el mejor Vencer
 * gratuito tras el movimiento y se queda con la mejor combinación (o renuncia).
 */
export function resolveTrampaForAI(state: GameState, playerId: PlayerId): GameState {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  let best = skipTrampa(state);
  let bestVal = evaluateState(best, playerId);
  for (const ls of Object.values(player.locationStates)) {
    for (const allyId of ls.villainCardInstIds) {
      const ally = state.allCards[allyId];
      if (ally?.cardType !== CardType.ALLY || ally.attachedToInstId) continue;
      for (const loc of plugin.locations) {
        if (loc.id === ally.locationId) continue;
        if (player.locationStates[loc.id]?.isLocked) continue;
        const moved = resolveTrampaMove(state, allyId, loc.id);
        if (moved === state) continue;
        const next = bestTrampaVanquish(moved, playerId);
        const val = evaluateState(next, playerId);
        if (val > bestVal) { bestVal = val; best = next; }
      }
    }
  }
  return best;
}

/** Elige, entre las cartas asequibles de la mano, la jugada que deja el mejor estado. */
function tryPlayCard(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  const player = getPlayer(s, playerId);
  let best: GameState | null = null;
  let bestVal = -Infinity;
  for (const id of player.handInstIds) {
    const card = s.allCards[id];
    if (!card) continue;
    const targetLoc = pickBestPlayTarget(s, player, id);
    if (!canPlayCard(s, playerId, id, slotIdx, targetLoc).valid) continue;
    const ctx = buildPlayCtx(s, playerId, id, targetLoc);
    const next = autoResolveOwnPendings(playCard(s, playerId, id, slotIdx, targetLoc, ctx), playerId);
    const val = evaluateState(next, playerId);
    if (val > bestVal) { bestVal = val; best = next; }
  }
  return best;
}

/** Vence un héroe (prioriza Burla → Peter Pan en Jolly Roger → resto) con los aliados mínimos suficientes. */
function tryVanquish(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  const player = getPlayer(s, playerId);
  const plugin = getPlugin(player.villainId);
  const heroEntries = Object.entries(player.locationStates).flatMap(([, ls]) => ls.heroCardInstIds);

  // Burla heroes must be defeated first — they go at the front of the ordered list
  const burlaHeroes = heroEntries.filter(id => heroHasBurla(s, id));

  const ppAtJollyId = player.locationStates[HookLocationId.JOLLY_ROGER]?.heroCardInstIds.find(
    id => s.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN,
  );
  // Héroes que bloquean jugar Maldiciones (p. ej. Primavera) van antes que cualquier otro:
  // vencerlos desbloquea la victoria, así que importa más que su fuerza relativa. Sin esto,
  // un héroe débil pero irrelevante (p. ej. Fauna) se intenta primero solo por ser más barato,
  // y la IA nunca llega a intentar al bloqueante real.
  const curseBlockerIds = heroEntries.filter(id =>
    !heroHasBurla(s, id)
    && (s.allCards[id]?.effectIds ?? []).some(eid => getEffectDef(eid)?.blocksCursePlay),
  );
  // Wendy first among others (removing her strips the +1 aura from all other heroes).
  // Peter Pan se excluye SIEMPRE que no esté en el Jolly Roger: vencerlo en otra ubicación
  // no cuenta para el objetivo de Garfio y lo devuelve al descarte de Destino (desastre).
  const others = heroEntries.filter(
    id => !heroHasBurla(s, id)
      && s.allCards[id]?.defId !== CardDefId.HOOK_PETER_PAN
      && !curseBlockerIds.includes(id),
  );
  const feasible = (heroId: CardInstId) => {
    const heroLoc = s.allCards[heroId]?.locationId;
    if (!heroLoc) return false;
    const allyStr = (player.locationStates[heroLoc]?.villainCardInstIds ?? [])
      .filter(aid => s.allCards[aid]?.cardType === CardType.ALLY)
      .reduce((sum, aid) => sum + getEffectiveStrength(s, aid), 0);
    return allyStr >= getEffectiveStrength(s, heroId);
  };
  // Coste de slots bloqueados por ubicación: 1+ héroe siempre bloquea los 2 primeros slots.
  const slotDmgForHero = (heroId: CardInstId): number => {
    const heroLoc = s.allCards[heroId]?.locationId;
    if (!heroLoc) return 0;
    const locDef = plugin.locations.find(l => l.id === heroLoc);
    if (!locDef) return 0;
    const blocked = Math.min(2, locDef.actions.length);
    let dmg = 0;
    for (let i = 0; i < blocked; i++) {
      switch (locDef.actions[i].type) {
        case ActionType.PLAY_CARD:      dmg += 9; break;
        case ActionType.VANQUISH:       dmg += 8; break;
        case ActionType.GAIN_POWER:     dmg += 5; break;
        case ActionType.MOVE_HERO:      dmg += 5; break;
        case ActionType.FATE:           dmg += 4; break;
        case ActionType.MOVE_ITEM_ALLY: dmg += 4; break;
        case ActionType.DISCARD:        dmg += 2; break;
        default:                        dmg += 3; break;
      }
    }
    return dmg;
  };
  others.sort((a, b) => {
    const aIsWendy = s.allCards[a]?.defId === CardDefId.HOOK_WENDY ? -1 : 0;
    const bIsWendy = s.allCards[b]?.defId === CardDefId.HOOK_WENDY ? -1 : 0;
    if (aIsWendy !== bIsWendy) return aIsWendy - bIsWendy;
    const af = feasible(a) ? 0 : 1;
    const bf = feasible(b) ? 0 : 1;
    if (af !== bf) return af - bf;
    const dmgDiff = slotDmgForHero(b) - slotDmgForHero(a);
    if (dmgDiff !== 0) return dmgDiff;
    return getEffectiveStrength(s, a) - getEffectiveStrength(s, b);
  });
  const ordered = [
    ...burlaHeroes,
    ...(ppAtJollyId ? [ppAtJollyId] : []),
    ...curseBlockerIds,
    ...others,
  ];

  for (const heroId of ordered) {
    const heroLoc = s.allCards[heroId]?.locationId;
    if (!heroLoc) continue;
    const hero = s.allCards[heroId];
    const heroLocDef = plugin.locations.find(l => l.id === heroLoc);
    const sameLocAllies = (player.locationStates[heroLoc]?.villainCardInstIds ?? []).filter(
      id => s.allCards[id]?.cardType === CardType.ALLY,
    );
    const adjAllies: CardInstId[] = (heroLocDef?.adjacentIds ?? []).flatMap(adjId => {
      const adjLs = player.locationStates[adjId];
      return (adjLs?.villainCardInstIds ?? []).filter(id => {
        const a = s.allCards[id];
        return a?.cardType === CardType.ALLY && a.effectIds.includes(EffectId.PELOTON_ADJ_VANQUISH);
      });
    });
    const cand = [...sameLocAllies, ...adjAllies];
    if (cand.length === 0) continue;
    const heroStr = getEffectiveStrength(s, heroId);
    const needsMultiple = hero?.effectIds.some(id => getEffectDef(id)?.requiresMultipleAlliesToVanquish) ?? false;
    const sorted = [...cand].sort((a, b) => getEffectiveStrength(s, b) - getEffectiveStrength(s, a));
    let total = 0;
    const chosen: CardInstId[] = [];
    for (const ally of sorted) {
      chosen.push(ally);
      total += getEffectiveStrength(s, ally);
      if (total >= heroStr && (!needsMultiple || chosen.length >= 2)) break;
    }
    if (total >= heroStr && canVanquish(s, playerId, heroId, chosen, slotIdx).valid) {
      return vanquish(s, playerId, heroId, chosen, slotIdx);
    }
  }
  return null;
}

/** Mueve un Objeto/Aliado: evalúa todas las combinaciones (carta × destino) y elige la mejor. */
function tryMoveItemAlly(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  const player = getPlayer(s, playerId);
  const plugin = getPlugin(player.villainId);
  const currentVal = evaluateState(s, playerId);
  let best: GameState | null = null;
  let bestVal = currentVal; // solo mover si mejora el estado

  for (const [locId, ls] of Object.entries(player.locationStates)) {
    const curLocDef = plugin.locations.find(l => l.id === locId);
    if (!curLocDef) continue;
    for (const cardId of ls.villainCardInstIds) {
      const c = s.allCards[cardId];
      if (c?.cardType !== CardType.ITEM && c?.cardType !== CardType.ALLY) continue;
      for (const adjId of curLocDef.adjacentIds) {
        if (!canMoveItemAlly(s, playerId, cardId, adjId, slotIdx).valid) continue;
        const next = moveItemAlly(s, playerId, cardId, adjId, slotIdx);
        const val = evaluateState(next, playerId);
        if (val > bestVal) { bestVal = val; best = next; }
      }
    }
  }
  return best;
}

/** Garfio: mueve héroes con Burla (prerrequisito) y Peter Pan (solo vencible en JR) hacia posición óptima. */
function tryMoveHero(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  const player = getPlayer(s, playerId);
  if (player.villainId !== 'hook') return null;
  const plugin = getPlugin(player.villainId);

  // Prioridad: Burla (hay que vencerlos primero) → Peter Pan (solo vencible en JR)
  const candidateHeroIds: CardInstId[] = [];
  for (const [, ls] of Object.entries(player.locationStates)) {
    candidateHeroIds.push(...ls.heroCardInstIds.filter(id => heroHasBurla(s, id)));
  }
  for (const [locId, ls] of Object.entries(player.locationStates)) {
    if (locId === HookLocationId.JOLLY_ROGER) continue;
    const ppId = ls.heroCardInstIds.find(id => s.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN && !heroHasBurla(s, id));
    if (ppId) candidateHeroIds.push(ppId);
  }

  for (const heroId of candidateHeroIds) {
    const heroLoc = s.allCards[heroId]?.locationId;
    if (!heroLoc || heroLoc === HookLocationId.JOLLY_ROGER) continue;
    const isPeterPan = s.allCards[heroId]?.defId === CardDefId.HOOK_PETER_PAN;
    if (!isPeterPan) {
      const heroStr = getEffectiveStrength(s, heroId);
      const coLocAllies = (player.locationStates[heroLoc]?.villainCardInstIds ?? []).filter(
        id => s.allCards[id]?.cardType === CardType.ALLY,
      );
      const coLocStr = coLocAllies.reduce((sum, id) => sum + getEffectiveStrength(s, id), 0);
      const needsMultiple = (s.allCards[heroId]?.effectIds ?? []).some(
        id => getEffectDef(id)?.requiresMultipleAlliesToVanquish,
      );
      if (coLocStr >= heroStr && (!needsMultiple || coLocAllies.length >= 2)) continue;
      const hasAllyInHand = player.handInstIds.some(id => s.allCards[id]?.cardType === CardType.ALLY);
      if (hasAllyInHand) continue;
    }

    const curLocDef = plugin.locations.find(l => l.id === heroLoc);
    if (!curLocDef) continue;
    const dest = curLocDef.adjacentIds.find(a => a === HookLocationId.JOLLY_ROGER) ?? curLocDef.adjacentIds[0];
    if (dest && canMoveHero(s, playerId, heroId, dest, slotIdx).valid) {
      return moveHero(s, playerId, heroId, dest, slotIdx);
    }
  }
  return null;
}

/** Acción Destino contra el rival: elige una carta revelada y la resuelve. */
function tryFate(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  if (!canFate(s, playerId, slotIdx).valid) return null;
  const oppIdx = (s.currentPlayerIndex + 1) % s.players.length;
  const st = startFate(s, playerId, oppIdx, slotIdx);
  if (!st.pendingFate) return st;

  const { revealedInstIds, targetPlayerIndex } = st.pendingFate;
  const oppPlayer = st.players[targetPlayerIndex];
  const oppPlugin = getPlugin(oppPlayer.villainId);

  const validFateLocs = oppPlugin.locations.filter(l => !oppPlayer.locationStates[l.id]?.isLocked);
  const fallbackLoc = validFateLocs[0] ?? oppPlugin.locations[0];

  // Evaluar TODAS las cartas reveladas × TODAS las ubicaciones; escoger el mejor resultado.
  let bestResult: GameState | null = null;
  let bestVal = -Infinity;

  for (const cardId of revealedInstIds) {
    const card = st.allCards[cardId];
    if (!card) continue;

    if (card.cardType === CardType.HERO) {
      for (const locDef of validFateLocs) {
        const result = resolveFate(st, cardId, locDef.id, {});
        // Resolución rechazada (p. ej. Lady Kluck → La Prisión): pendingFate sigue activo.
        if (result.pendingFate) continue;
        const val = evaluateState(result, playerId);
        if (val > bestVal) { bestVal = val; bestResult = result; }
      }
    } else if (card.cardType === CardType.ITEM) {
      // Objetos de Destino (p. ej. Espada de la Verdad) se unen a un Héroe: probar TODOS los
      // héroes del reino rival como objetivo. Sin objetivo el efecto descarta el Objeto sin
      // hacer nada, así que jugarlo "suelto" solo se contempla si el rival no tiene héroes.
      const heroTargets = validFateLocs.flatMap(locDef =>
        (oppPlayer.locationStates[locDef.id]?.heroCardInstIds ?? [])
          .map(heroId => ({ locId: locDef.id, heroId })),
      );
      if (heroTargets.length > 0) {
        for (const { locId, heroId } of heroTargets) {
          const result = resolveFate(st, cardId, locId, { targetCardInstId: heroId });
          const val = evaluateState(result, playerId);
          if (val > bestVal) { bestVal = val; bestResult = result; }
        }
      } else {
        const result = resolveFate(st, cardId, fallbackLoc.id, {});
        const val = evaluateState(result, playerId);
        if (val > bestVal) { bestVal = val; bestResult = result; }
      }
    } else {
      // Efecto/condición: solo necesita una ubicación de referencia.
      const result = resolveFate(st, cardId, fallbackLoc.id, {});
      const val = evaluateState(result, playerId);
      if (val > bestVal) { bestVal = val; bestResult = result; }
    }
  }

  return bestResult ?? resolveFate(st, revealedInstIds[0] ?? '', fallbackLoc.id, {});
}

/** Activa una carta (El Cuervo se mueve libremente y resuelve su acción en destino). */
function tryActivateCard(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  const player = getPlayer(s, playerId);
  const plugin = getPlugin(player.villainId);
  for (const [, ls] of Object.entries(player.locationStates)) {
    for (const cardId of ls.villainCardInstIds) {
      if (!canActivateCard(s, playerId, cardId, slotIdx).valid) continue;
      const card = s.allCards[cardId];
      const ctx: ActivateCardCtx = {};

      if (card.effectIds.includes(EffectId.RAVEN_ACTIVATE)) {
        // El Cuervo se mueve LIBREMENTE (moverlo no quita maldiciones).
        const openLocs = plugin.locations.filter(l => !player.locationStates[l.id]?.isLocked);
        let target: LocationId | undefined;
        if (player.villainId === 'maleficent' && player.handInstIds.some(id => s.allCards[id]?.cardType === CardType.CURSE)) {
          const cover = openLocs.find(l => {
            const ls2 = player.locationStates[l.id];
            const hasPlay = l.actions.some(a => a.type === ActionType.PLAY_CARD);
            const blocked = ls2.heroCardInstIds.some(hid =>
              s.allCards[hid]?.effectIds.some(eid => getEffectDef(eid)?.blocksCursePlay),
            );
            return hasPlay && !locHasCurse(s, ls2) && !blocked;
          });
          if (cover) target = cover.id;
        }
        if (!target) {
          const ranked = openLocs
            .map(l => ({ id: l.id, sc: scoreLocation(s, player, l.id) }))
            .sort((a, b) => b.sc - a.sc);
          target = ranked[0]?.id ?? card.locationId;
        }
        ctx.targetLocationId = target;
      }

      let next = activateCard(s, playerId, cardId, slotIdx, ctx);
      // Resuelve la acción del Cuervo en su destino para que el estado refleje su efecto.
      if (next.pendingCuervo) {
        const { action, params } = chooseCuervoAction(next);
        next = resolveCuervo(next, action, params);
      }
      return next;
    }
  }
  return null;
}

/** Descarta cuando es beneficioso: cartas muertas SIEMPRE (ciclar el mazo), nunca objetos. */
function tryDiscard(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  const player = getPlayer(s, playerId);
  if (player.handInstIds.length === 0 || !canDiscard(s, playerId, slotIdx).valid) return null;
  // Fix I: nunca descartar objetos
  const discardable = player.handInstIds.filter(
    id => s.allCards[id]?.cardType !== CardType.ITEM,
  );
  if (discardable.length === 0) return null;

  // FASE 2: las cartas muertas (plugin + duplicados de condición) se descartan siempre
  // que haya casilla DISCARD — ciclarlas es la única forma de convertirlas en cartas útiles.
  const dead = getDeadHandCards(s, playerId).filter(id => discardable.includes(id));

  // Fix J: para el resto, solo descartar si mejora genuinamente el estado o la mano es enorme.
  const handTooBig = player.handInstIds.length > 5;
  const currentVal = evaluateState(s, playerId);
  const withDeltas = discardable
    .filter(id => !dead.includes(id))
    .map(id => ({
      id,
      delta: evaluateState(discardFromHand(s, playerId, [id], slotIdx), playerId) - currentVal,
    }));
  // Si hay empate, condiciones > efectos > aliados (las condiciones raramente se necesitan).
  withDeltas.sort((a, b) => {
    if (Math.abs(b.delta - a.delta) > 0.01) return b.delta - a.delta;
    const typeOrder: Record<string, number> = { [CardType.CONDITION]: 0, [CardType.EFFECT]: 1, [CardType.ALLY]: 2 };
    const ta = typeOrder[s.allCards[a.id]?.cardType ?? ''] ?? 3;
    const tb = typeOrder[s.allCards[b.id]?.cardType ?? ''] ?? 3;
    return ta - tb;
  });
  const beneficial = withDeltas.filter(d => d.delta > 0).map(d => d.id);

  // Descartar muertas + beneficiosas a la vez (el juego permite cualquier cantidad).
  const toDiscard = [...dead, ...beneficial];
  if (toDiscard.length === 0) {
    // Mano atascada sin carta claramente mala: soltar la peor para ciclar.
    if (!handTooBig || withDeltas.length === 0) return null;
    toDiscard.push(withDeltas[0].id);
  }
  return discardFromHand(s, playerId, toDiscard, slotIdx);
}

// ─── CUERVO (El Cuervo) auto-resolution for the AI ───────────────────────────────
// Antes el Cuervo siempre ganaba poder. Ahora, para Maléfica, intenta cubrir la
// ubicación donde está con una Maldición de la mano (su condición de victoria).
export function chooseCuervoAction(state: GameState): {
  action: ActionType;
  params: CuervoResolutionParams;
} {
  const pc = state.pendingCuervo;
  if (!pc) return { action: ActionType.GAIN_POWER, params: {} };
  const player = getPlayer(state, pc.playerId);
  const ls = player.locationStates[pc.locationId];
  const locDef = getPlugin(player.villainId).locations.find(l => l.id === pc.locationId);
  const hasPlayCardAction = locDef?.actions.some(a => a.type === ActionType.PLAY_CARD) ?? false;

  if (player.villainId === 'maleficent' && ls && hasPlayCardAction && !locHasCurse(state, ls)) {
    const blockedByHero = ls.heroCardInstIds.some(hid =>
      state.allCards[hid]?.effectIds.some(eid => getEffectDef(eid)?.blocksCursePlay),
    );
    if (!blockedByHero) {
      const curseId = player.handInstIds.find(id => {
        const c = state.allCards[id];
        if (c?.cardType !== CardType.CURSE) return false;
        const cost = Math.max(0, c.baseCost + c.costModifier + computeKingdomCostMod(state, player.id, c, pc.locationId));
        return player.power >= cost;
      });
      if (curseId) {
        return { action: ActionType.PLAY_CARD, params: { cardInstId: curseId, targetLocationId: pc.locationId } };
      }
    }
  }

  return { action: ActionType.GAIN_POWER, params: {} };
}

// ─── MINIMAX profundidad-2 + poda alpha-beta ─────────────────────────────────
// Cada nodo del árbol representa un turno completo (MOVE → ACTIVATE → DRAW).
// Profundidad-2 = mi turno + respuesta del rival (~9-16 simulaciones por decisión).

/**
 * Simula un turno completo en `dest`: MOVE → ACTIVATE → DRAW.
 * FASE 5: usa DEST_ROLLOUT_DEPTH (no 1-ply) para que un destino con héroe puntúe bien cuando
 * el combo "jugar Aliado → Vencer" es alcanzable en ese mismo turno — con 1-ply la primera
 * acción del combo (jugar el Aliado) casi siempre parece peor que no hacer nada por sí sola,
 * así que el destino nunca ganaba la comparación aunque el turno real sí resolviera el combo.
 */
function simulateTurnAtDest(state: GameState, playerId: PlayerId, dest: LocationId, profile?: OpponentProfile): GameState {
  let s = movePawn(state, playerId, dest);
  s = playOutActivate(s, playerId, undefined, DEST_ROLLOUT_DEPTH, profile);
  if (s.turnPhase === TurnPhase.ACTIVATE) s = endActivatePhase(s);
  if (s.turnPhase === TurnPhase.DRAW) s = drawCards(s, playerId);
  return s;
}

/**
 * Devuelve el mejor destino para `playerId` con minimax profundidad-2 y poda alpha-beta.
 * El rival responde eligiendo el destino que maximiza su propio evaluador (minimiza el nuestro).
 */
function minimaxBestDest(state: GameState, playerId: PlayerId, profile?: OpponentProfile): LocationId {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const dests = plugin.locations.filter(
    l => l.id !== player.pawnLocationId && !player.locationStates[l.id]?.isLocked,
  );
  if (dests.length === 0) return player.pawnLocationId;

  // Pre-ordenar por evaluación 1-ply (mejor primero) para maximizar la poda alpha.
  // FASE 2: Limitar breadth a top-4 candidatos para evitar exploración explosiva.
  const candidates = dests
    .map(d => {
      const hint = evaluateState(playOutActivate(movePawn(state, playerId, d.id), playerId, undefined, 1, profile), playerId, profile);
      return { id: d.id, hint };
    })
    .sort((a, b) => b.hint - a.hint)
    .slice(0, 4);  // FASE 2: Solo considerar top-4 destinos

  let bestDest = candidates[0].id;
  let alpha = -Infinity;

  for (const { id: dest } of candidates) {
    const afterMyTurn = simulateTurnAtDest(state, playerId, dest, profile);
    const val = afterMyTurn.winner
      ? evaluateState(afterMyTurn, playerId, profile)
      : minimaxOppResponse(afterMyTurn, playerId, alpha, 1, profile);  // FASE 2: Pasar profundidad

    if (val > alpha) { alpha = val; bestDest = dest; }
  }
  return bestDest;
}

/**
 * FASE 2: Nodo MAX recursivo - la IA (originalPlayerId) elige el destino que MAXIMIZA su evaluación.
 * Se alterna entre nodos MAX (nuestra respuesta) y MIN (respuesta del rival).
 */
function minimaxOurResponse(
  state: GameState,
  playerId: PlayerId,
  beta: number,
  depth: number,
  profile?: OpponentProfile,
): number {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);

  // Límite de profundidad
  const MAX_DEPTH = 2;
  if (depth >= MAX_DEPTH) {
    return evaluateState(state, playerId, profile);
  }

  const dests = plugin.locations.filter(
    l => l.id !== player.pawnLocationId && !player.locationStates[l.id]?.isLocked,
  );
  if (dests.length === 0) return evaluateState(state, playerId, profile);

  // FASE 2: Limitar breadth a top-3
  const candidates = dests
    .map(d => {
      const hint = evaluateState(playOutActivate(movePawn(state, playerId, d.id), playerId, undefined, 1, profile), playerId, profile);
      return { id: d.id, hint };
    })
    .sort((a, b) => b.hint - a.hint)
    .slice(0, 3);

  let maxVal = -Infinity;
  let alpha = -Infinity;

  for (const { id: dest } of candidates) {
    const afterMyTurn = simulateTurnAtDest(state, playerId, dest, profile);
    let val: number;

    if (afterMyTurn.winner) {
      val = evaluateState(afterMyTurn, playerId, profile);
    } else if (depth + 1 < MAX_DEPTH) {
      // Llamar al MIN node (rival)
      val = minimaxOppResponse(afterMyTurn, playerId, alpha, depth + 1, profile);
    } else {
      val = evaluateState(afterMyTurn, playerId, profile);
    }

    if (val > maxVal) maxVal = val;
    if (maxVal >= beta) break; // poda: el padre (MIN) ya tiene algo peor
    if (maxVal > alpha) alpha = maxVal;
  }
  return maxVal;
}

/**
 * Nodo rival: el rival elige el destino que MINIMIZA la evaluación de `originalPlayerId`.
 * Aplica poda alpha: si el rival ya encontró una respuesta tan mala para nosotros que la
 * rama padre no la elegiría, se corta.
 * FASE 2: Parámetro `depth` para limitar profundidad de búsqueda (max 2-3 turnos).
 */
function minimaxOppResponse(
  state: GameState,
  originalPlayerId: PlayerId,
  alpha: number,
  depth: number = 0,
  profile?: OpponentProfile,
): number {
  const opp = state.players[state.currentPlayerIndex];
  const oppPlugin = getPlugin(opp.villainId);

  // FASE 2: Limite de profundidad - evitar búsqueda infinita
  const MAX_DEPTH = 2;  // Máximo 2 niveles adicionales (rival + nuestra respuesta)
  if (depth >= MAX_DEPTH) {
    // Llegamos al límite de profundidad - evaluar el estado actual
    return evaluateState(state, originalPlayerId, profile);
  }

  if (opp.skipNextMove) {
    let s = skipMove(state, opp.id);
    s = playOutActivate(s, opp.id, undefined, DEST_ROLLOUT_DEPTH, profile);
    if (s.turnPhase === TurnPhase.ACTIVATE) s = endActivatePhase(s);
    if (s.turnPhase === TurnPhase.DRAW) s = drawCards(s, opp.id);
    return evaluateState(s, originalPlayerId, profile);
  }

  const dests = oppPlugin.locations.filter(
    l => l.id !== opp.pawnLocationId && !opp.locationStates[l.id]?.isLocked,
  );
  if (dests.length === 0) return evaluateState(state, originalPlayerId, profile);

  // Pre-ordenar ascendente (peor para nosotros primero) para alcanzar el beta-cutoff cuanto antes.
  const candidates = dests
    .map(d => {
      const hint = evaluateState(playOutActivate(movePawn(state, opp.id, d.id), opp.id, undefined, 1, profile), originalPlayerId, profile);
      return { id: d.id, hint };
    })
    .sort((a, b) => a.hint - b.hint);

  // FASE 2: Limitar breadth del rival a top-3 opciones (ascendente: peor para nosotros primero)
  let oppCandidates = candidates.slice(0, 3);

  // Modelo del rival: si el humano tiene un destino claramente favorito con este villano
  // y no entró en el top-3 "peor para nosotros", lo añadimos igualmente — el minimax no
  // puede ignorar lo que el rival REALMENTE tiende a hacer solo porque no es, según nuestra
  // heurística, su jugada teóricamente óptima. Amplía la búsqueda, nunca la sustituye
  // (así seguimos preparados también para el peor caso adversarial).
  if (!opp.isAI) {
    const favored = pickFavoredDestination(profile, opp.villainId, dests.map(d => d.id));
    if (favored && !oppCandidates.some(c => c.id === favored)) {
      const hint = candidates.find(c => c.id === favored)?.hint ?? 0;
      oppCandidates = [...oppCandidates, { id: favored, hint }];
    }
  }

  let minVal = Infinity;
  let beta = Infinity;

  for (const { id: dest } of oppCandidates) {
    const afterOppTurn = simulateTurnAtDest(state, opp.id, dest, profile);

    // FASE 2: Si el rival ganó, evaluar. Sino, simular nuestra respuesta recursivamente.
    let val: number;
    if (afterOppTurn.winner) {
      val = evaluateState(afterOppTurn, originalPlayerId, profile);
    } else if (depth + 1 < MAX_DEPTH) {
      // Llamar recursivamente para que la IA (originalPlayerId) responda en profundidad
      val = minimaxOurResponse(afterOppTurn, originalPlayerId, beta, depth + 1, profile);
    } else {
      val = evaluateState(afterOppTurn, originalPlayerId, profile);
    }

    if (val < minVal) minVal = val;
    if (minVal <= alpha) break; // poda: el padre (MAX) ya tiene algo mejor
    if (minVal < beta) beta = minVal; // actualizar beta para el siguiente nodo
  }
  return minVal;
}

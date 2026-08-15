// ─── Enumeradores de jugadas LEGALES ──────────────────────────────────────────────
// Combinatoria de reglas: qué candidatos son legales para una ranura dada. NO decide cuál es
// mejor — eso es responsabilidad de actionScoring.ts + planner.ts. Cada función devuelve TODOS
// los candidatos razonables (no solo uno), para que el planificador pueda comparar alternativas
// reales y el auditor pueda registrar qué se descartó.
import { ActionType, CardType } from '../../types';
import type { ActivateCardCtx, CardInstId, GameState, LocationId, PlayerId } from '../../types';
import { getPlugin, getEffectDef } from '../../villains/registry';
import { EffectId, CardDefId } from '../../villains/effectIds';
import { HookLocationId } from '../../villains/hook/cards';
import { getPlayer, getEffectiveStrength, computeKingdomCostMod } from '../../engine/stateHelpers';
import { getCoveredSlotIndices } from '../../engine/slotHelpers';
import {
  canPlayCard, canVanquish, canMoveItemAlly, canMoveHero, canFate, canActivateCard,
  canDiscard, canPayToDiscardItem,
} from '../../engine/RuleEngine';
import {
  gainPower, playCard, vanquish, moveItemAlly, moveHero, startFate, resolveFate,
  activateCard, discardFromHand, payToDiscardItem,
} from '../../engine/GameEngine';
import { resolveCuervo } from '../../engine/PendingStateResolver';
import type { CuervoResolutionParams } from '../../engine/PendingStateResolver';
import { buildPlayCtx } from '../contextBuilder';
import { getDeadHandCards } from './context';
import type { ActionCandidate } from './types';

function locHasCurse(state: GameState, playerId: PlayerId, locId: LocationId): boolean {
  const ls = getPlayer(state, playerId).locationStates[locId];
  return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
}

// ─── GAIN_POWER ────────────────────────────────────────────────────────────────

function genGainPower(state: GameState, playerId: PlayerId, slotIdx: number): ActionCandidate[] {
  return [{
    kind: ActionType.GAIN_POWER,
    slotIdx,
    label: 'Ganar Poder',
    resultState: gainPower(state, playerId, slotIdx),
    isRepositioning: false,
  }];
}

// ─── PLAY_CARD ─────────────────────────────────────────────────────────────────
// A diferencia del motor anterior (que elegía UNA ubicación por heurística antes de puntuar),
// aquí se enumeran TODAS las ubicaciones legales por carta — el planificador decide cuál sirve
// mejor a la intención del turno.

function genPlayCard(state: GameState, playerId: PlayerId, slotIdx: number): ActionCandidate[] {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const out: ActionCandidate[] = [];
  for (const cardId of player.handInstIds) {
    const card = state.allCards[cardId];
    if (!card) continue;
    for (const loc of plugin.locations) {
      if (!canPlayCard(state, playerId, cardId, slotIdx, loc.id).valid) continue;
      const ctx = buildPlayCtx(state, playerId, cardId, loc.id);
      const resultState = playCard(state, playerId, cardId, slotIdx, loc.id, ctx);
      out.push({
        kind: ActionType.PLAY_CARD,
        slotIdx,
        label: `Jugar ${card.name} en ${loc.name}`,
        resultState,
        isRepositioning: false,
        cardInstId: cardId,
      });
    }
  }
  return out;
}

// ─── VANQUISH ──────────────────────────────────────────────────────────────────
// Un candidato por héroe elegible (con la selección mínima de aliados que alcanza su Fuerza),
// re-validado con canVanquish — las reglas del motor (Burla primero, etc.) ya filtran lo ilegal.
// Peter Pan se excluye fuera del Jolly Roger: vencerlo ahí no cuenta para el objetivo y lo saca
// PERMANENTEMENTE del reino (autosabotaje irreversible, no una preferencia de la IA).

function genVanquish(state: GameState, playerId: PlayerId, slotIdx: number): ActionCandidate[] {
  const player = getPlayer(state, playerId);
  const out: ActionCandidate[] = [];
  const heroEntries = Object.entries(player.locationStates).flatMap(
    ([locId, ls]) => ls.heroCardInstIds.map(heroId => ({ locId, heroId })),
  );

  for (const { locId, heroId } of heroEntries) {
    const hero = state.allCards[heroId];
    if (!hero) continue;
    if (hero.defId === CardDefId.HOOK_PETER_PAN && locId !== HookLocationId.JOLLY_ROGER) continue;

    const heroLocDef = getPlugin(player.villainId).locations.find(l => l.id === locId);
    const sameLocAllies = (player.locationStates[locId]?.villainCardInstIds ?? []).filter(
      id => state.allCards[id]?.cardType === CardType.ALLY,
    );
    const adjAllies: CardInstId[] = (heroLocDef?.adjacentIds ?? []).flatMap(adjId =>
      (player.locationStates[adjId]?.villainCardInstIds ?? []).filter(id => {
        const a = state.allCards[id];
        return a?.cardType === CardType.ALLY && a.effectIds.includes(EffectId.PELOTON_ADJ_VANQUISH);
      }),
    );
    const candidates = [...sameLocAllies, ...adjAllies];
    if (candidates.length === 0) continue;

    const heroStr = getEffectiveStrength(state, heroId);
    const needsMultiple = hero.effectIds.some(id => getEffectDef(id)?.requiresMultipleAlliesToVanquish);
    const sorted = [...candidates].sort((a, b) => getEffectiveStrength(state, b) - getEffectiveStrength(state, a));
    let total = 0;
    const chosen: CardInstId[] = [];
    for (const allyId of sorted) {
      chosen.push(allyId);
      total += getEffectiveStrength(state, allyId);
      if (total >= heroStr && (!needsMultiple || chosen.length >= 2)) break;
    }
    if (total < heroStr) continue;
    if (!canVanquish(state, playerId, heroId, chosen, slotIdx).valid) continue;

    out.push({
      kind: ActionType.VANQUISH,
      slotIdx,
      label: `Vencer a ${hero.name}`,
      resultState: vanquish(state, playerId, heroId, chosen, slotIdx),
      isRepositioning: false,
    });
  }
  return out;
}

// ─── MOVE_ITEM_ALLY ────────────────────────────────────────────────────────────

function genMoveItemAlly(state: GameState, playerId: PlayerId, slotIdx: number): ActionCandidate[] {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const out: ActionCandidate[] = [];
  for (const [locId, ls] of Object.entries(player.locationStates)) {
    const curLocDef = plugin.locations.find(l => l.id === locId);
    if (!curLocDef) continue;
    for (const cardId of ls.villainCardInstIds) {
      const c = state.allCards[cardId];
      if (c?.cardType !== CardType.ITEM && c?.cardType !== CardType.ALLY) continue;
      for (const adjId of curLocDef.adjacentIds) {
        if (!canMoveItemAlly(state, playerId, cardId, adjId, slotIdx).valid) continue;
        const destName = plugin.locations.find(l => l.id === adjId)?.name ?? adjId;
        out.push({
          kind: ActionType.MOVE_ITEM_ALLY,
          slotIdx,
          label: `Mover ${c.name} a ${destName}`,
          resultState: moveItemAlly(state, playerId, cardId, adjId, slotIdx),
          isRepositioning: true,
        });
      }
    }
  }
  return out;
}

// ─── MOVE_HERO ─────────────────────────────────────────────────────────────────
// Genérico (no exclusivo de Garfio): cualquier héroe del propio reino puede reposicionarse a una
// ubicación adyacente si el motor lo permite (canMoveHero ya aplica cannotEnterLocationId, etc.)

function genMoveHero(state: GameState, playerId: PlayerId, slotIdx: number): ActionCandidate[] {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const out: ActionCandidate[] = [];
  for (const [locId, ls] of Object.entries(player.locationStates)) {
    const curLocDef = plugin.locations.find(l => l.id === locId);
    if (!curLocDef) continue;
    for (const heroId of ls.heroCardInstIds) {
      const hero = state.allCards[heroId];
      for (const adjId of curLocDef.adjacentIds) {
        if (!canMoveHero(state, playerId, heroId, adjId, slotIdx).valid) continue;
        const destName = plugin.locations.find(l => l.id === adjId)?.name ?? adjId;
        out.push({
          kind: ActionType.MOVE_HERO,
          slotIdx,
          label: `Mover a ${hero?.name} a ${destName}`,
          resultState: moveHero(state, playerId, heroId, adjId, slotIdx),
          isRepositioning: true,
        });
      }
    }
  }
  return out;
}

// ─── FATE ──────────────────────────────────────────────────────────────────────
// startFate revela cartas reales del mazo de Destino del rival (no es enumerable de antemano).
// Se activa una vez y, sobre lo revelado, se enumeran todas las resoluciones legales.

function genFate(state: GameState, playerId: PlayerId, slotIdx: number): ActionCandidate[] {
  if (!canFate(state, playerId, slotIdx).valid) return [];
  const oppIdx = (state.currentPlayerIndex + 1) % state.players.length;
  const st = startFate(state, playerId, oppIdx, slotIdx);
  if (!st.pendingFate) return [{ kind: ActionType.FATE, slotIdx, label: 'Destino', resultState: st, isRepositioning: false }];

  const { revealedInstIds, targetPlayerIndex } = st.pendingFate;
  const oppPlayer = st.players[targetPlayerIndex];
  const oppPlugin = getPlugin(oppPlayer.villainId);
  const validFateLocs = oppPlugin.locations.filter(l => !oppPlayer.locationStates[l.id]?.isLocked);
  const fallbackLoc = validFateLocs[0] ?? oppPlugin.locations[0];

  const out: ActionCandidate[] = [];
  for (const cardId of revealedInstIds) {
    const card = st.allCards[cardId];
    if (!card) continue;

    if (card.cardType === CardType.HERO) {
      for (const locDef of validFateLocs) {
        const result = resolveFate(st, cardId, locDef.id, {});
        if (result.pendingFate) continue; // resolución rechazada por el motor (p. ej. Lady Kluck)
        out.push({
          kind: ActionType.FATE, slotIdx, label: `Destino: ${card.name} → ${locDef.name}`,
          resultState: result, isRepositioning: false,
        });
      }
    } else if (card.cardType === CardType.ITEM) {
      const heroTargets = validFateLocs.flatMap(locDef =>
        (oppPlayer.locationStates[locDef.id]?.heroCardInstIds ?? [])
          .map(heroId => ({ locId: locDef.id, heroId })),
      );
      if (heroTargets.length > 0) {
        for (const { locId, heroId } of heroTargets) {
          const result = resolveFate(st, cardId, locId, { targetCardInstId: heroId });
          out.push({
            kind: ActionType.FATE, slotIdx,
            label: `Destino: ${card.name} → ${st.allCards[heroId]?.name}`,
            resultState: result, isRepositioning: false,
          });
        }
      } else {
        out.push({
          kind: ActionType.FATE, slotIdx, label: `Destino: ${card.name} (sin objetivo)`,
          resultState: resolveFate(st, cardId, fallbackLoc.id, {}), isRepositioning: false,
        });
      }
    } else {
      out.push({
        kind: ActionType.FATE, slotIdx, label: `Destino: ${card.name}`,
        resultState: resolveFate(st, cardId, fallbackLoc.id, {}), isRepositioning: false,
      });
    }
  }
  if (out.length === 0) {
    out.push({
      kind: ActionType.FATE, slotIdx, label: 'Destino',
      resultState: resolveFate(st, revealedInstIds[0] ?? '', fallbackLoc.id, {}), isRepositioning: false,
    });
  }
  return out;
}

// ─── ACTIVATE_CARD (p. ej. El Cuervo) ─────────────────────────────────────────
// Un candidato por ubicación destino; el pendiente que genera (pendingCuervo) se resuelve con la
// mejor sub-acción legal disponible ahí (mecánica de reglas: qué ranura queda libre en destino).

/** Decide cómo resolver la acción del Cuervo en su destino (mecánica de reglas: qué ranura
 *  queda libre ahí), sin aplicar el cambio — el llamador ejecuta resolveCuervo(). */
export function chooseCuervoAction(state: GameState): { action: ActionType; params: CuervoResolutionParams } {
  const pc = state.pendingCuervo;
  if (!pc) return { action: ActionType.GAIN_POWER, params: {} };
  const player = getPlayer(state, pc.playerId);
  const ls = player.locationStates[pc.locationId];
  const locDef = getPlugin(player.villainId).locations.find(l => l.id === pc.locationId);
  const coveredSlots = getCoveredSlotIndices(state, pc.playerId, pc.locationId);
  const isSlotAvailable = (type: ActionType) =>
    (locDef?.actions ?? []).some((a, idx) => a.type === type && !coveredSlots.includes(idx));

  if (player.villainId === 'maleficent' && ls && isSlotAvailable(ActionType.PLAY_CARD) && !locHasCurse(state, pc.playerId, pc.locationId)) {
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

  if (isSlotAvailable(ActionType.GAIN_POWER)) return { action: ActionType.GAIN_POWER, params: {} };

  const firstAvailable = (locDef?.actions ?? []).find((a, idx) =>
    a.type !== ActionType.FATE && a.type !== ActionType.ACTIVATE_CARD && !coveredSlots.includes(idx),
  );
  if (firstAvailable?.type === ActionType.DISCARD && player.handInstIds.length > 0) {
    return { action: ActionType.DISCARD, params: { cardInstIds: [player.handInstIds[0]] } };
  }
  return { action: ActionType.GAIN_POWER, params: { amountOverride: 0 } };
}

function resolvePendingCuervoAt(state: GameState): GameState {
  if (!state.pendingCuervo) return state;
  const { action, params } = chooseCuervoAction(state);
  return resolveCuervo(state, action, params);
}

function genActivateCard(state: GameState, playerId: PlayerId, slotIdx: number): ActionCandidate[] {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const out: ActionCandidate[] = [];
  for (const ls of Object.values(player.locationStates)) {
    for (const cardId of ls.villainCardInstIds) {
      if (!canActivateCard(state, playerId, cardId, slotIdx).valid) continue;
      const card = state.allCards[cardId];
      if (card.effectIds.includes(EffectId.RAVEN_ACTIVATE)) {
        const openLocs = plugin.locations.filter(l => !player.locationStates[l.id]?.isLocked);
        for (const loc of openLocs) {
          const ctx: ActivateCardCtx = { targetLocationId: loc.id };
          let next = activateCard(state, playerId, cardId, slotIdx, ctx);
          if (next.pendingCuervo) next = resolvePendingCuervoAt(next);
          out.push({
            kind: ActionType.ACTIVATE_CARD, slotIdx, label: `Activar ${card.name} → ${loc.name}`,
            resultState: next, isRepositioning: false,
          });
        }
      } else {
        let next = activateCard(state, playerId, cardId, slotIdx, {});
        if (next.pendingCuervo) next = resolvePendingCuervoAt(next);
        out.push({
          kind: ActionType.ACTIVATE_CARD, slotIdx, label: `Activar ${card.name}`,
          resultState: next, isRepositioning: false,
        });
      }
    }
  }
  return out;
}

// ─── DISCARD ───────────────────────────────────────────────────────────────────
// Candidatos acotados: solo cartas muertas, o muertas + una carta adicional (una por cada
// candidata individual) — evita la explosión combinatoria de 2^mano sin perder la comparación
// real "¿merece la pena ciclar esta carta además de las muertas?" que hace el planificador.

function genDiscard(state: GameState, playerId: PlayerId, slotIdx: number): ActionCandidate[] {
  const player = getPlayer(state, playerId);
  if (player.handInstIds.length === 0 || !canDiscard(state, playerId, slotIdx).valid) return [];
  const discardable = player.handInstIds.filter(id => state.allCards[id]?.cardType !== CardType.ITEM);
  if (discardable.length === 0) return [];

  const dead = getDeadHandCards(state, playerId).filter(id => discardable.includes(id));
  const out: ActionCandidate[] = [];

  if (dead.length > 0) {
    out.push({
      kind: ActionType.DISCARD, slotIdx, label: `Descartar mano muerta (${dead.length})`,
      resultState: discardFromHand(state, playerId, dead, slotIdx), isRepositioning: false,
    });
  }
  for (const id of discardable) {
    if (dead.includes(id)) continue;
    const toDiscard = [...dead, id];
    out.push({
      kind: ActionType.DISCARD, slotIdx, label: `Descartar ${state.allCards[id]?.name}`,
      resultState: discardFromHand(state, playerId, toDiscard, slotIdx), isRepositioning: false,
    });
  }
  return out;
}

// ─── PAY_TO_DISCARD (p. ej. Buen Disfraz) ─────────────────────────────────────
// No consume ranura de acción — se prueba aparte, en cualquier fase ACTIVATE.

function genPayToDiscard(state: GameState, playerId: PlayerId): ActionCandidate[] {
  const player = getPlayer(state, playerId);
  const payable = [...player.handInstIds, ...Object.values(player.locationStates).flatMap(ls => ls.villainCardInstIds)]
    .filter(id => state.allCards[id]?.effectIds.some(eid => getEffectDef(eid)?.payToDiscardCost));
  return payable
    .filter(id => canPayToDiscardItem(state, playerId, id).valid)
    .map(id => ({
      kind: 'PAY_TO_DISCARD' as const,
      label: `Pagar para descartar ${state.allCards[id]?.name}`,
      resultState: payToDiscardItem(state, playerId, id),
      isRepositioning: false,
    }));
}

/** Todos los candidatos legales para una ranura de acción dada. */
export function generateSlotCandidates(
  state: GameState, playerId: PlayerId, slotIdx: number, slotType: ActionType,
): ActionCandidate[] {
  switch (slotType) {
    case ActionType.GAIN_POWER:     return genGainPower(state, playerId, slotIdx);
    case ActionType.PLAY_CARD:      return genPlayCard(state, playerId, slotIdx);
    case ActionType.VANQUISH:       return genVanquish(state, playerId, slotIdx);
    case ActionType.MOVE_ITEM_ALLY: return genMoveItemAlly(state, playerId, slotIdx);
    case ActionType.MOVE_HERO:      return genMoveHero(state, playerId, slotIdx);
    case ActionType.FATE:           return genFate(state, playerId, slotIdx);
    case ActionType.ACTIVATE_CARD:  return genActivateCard(state, playerId, slotIdx);
    case ActionType.DISCARD:        return genDiscard(state, playerId, slotIdx);
    default:                        return [];
  }
}

/** Candidatos fuera de ranura (pagar para descartar). */
export function generatePayToDiscardCandidates(state: GameState, playerId: PlayerId): ActionCandidate[] {
  return genPayToDiscard(state, playerId);
}

export { resolvePendingCuervoAt };

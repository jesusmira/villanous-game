import { CardType } from '../types';
import type { GameState, CardInstId, LocationId, ConditionCtx } from '../types';
import {
  getPlayer, updatePlayer, updateLocationState, updateCard, addLog, checkWin,
  discardCardFromKingdom, moveAttachedItems, applyMenguarToggle,
} from './stateHelpers';
import { getPlugin } from '../villains/registry';
import { canVanquishFree } from './RuleEngine';
import { vanquishFree } from './actions/play';

export { resolveCuervo } from '../villains/maleficent/resolvers';
export type { CuervoResolutionParams } from '../villains/maleficent/resolvers';
export { resolveDemosles } from '../villains/hook/resolvers';

// ─── Trampa (Príncipe Juan): mover un Aliado a cualquier ubicación + Vencer gratuito ──

/** Fase 1 de Trampa: mueve el Aliado elegido y deja pendiente el Vencer gratuito. */
export function resolveTrampaMove(
  state: GameState,
  allyInstId: CardInstId,
  targetLocationId: LocationId,
): GameState {
  if (!state.trampaActive) return state;
  const playerId = state.trampaActive;
  const ally = state.allCards[allyInstId];
  if (!ally || ally.ownerId !== playerId || ally.cardType !== CardType.ALLY) return state;
  const srcLocId = ally.locationId;
  if (!srcLocId) return state;
  const player = getPlayer(state, playerId);
  if (player.locationStates[targetLocationId]?.isLocked) return state;

  let s = updateLocationState(state, playerId, srcLocId, {
    villainCardInstIds: player.locationStates[srcLocId].villainCardInstIds.filter(id => id !== allyInstId),
  });
  const dest = getPlayer(s, playerId).locationStates[targetLocationId];
  s = updateLocationState(s, playerId, targetLocationId, {
    villainCardInstIds: [...dest.villainCardInstIds, allyInstId],
  });
  s = updateCard(s, allyInstId, { locationId: targetLocationId });
  // Los Objetos adjuntos (Arco, Flecha Dorada) viajan con el Aliado.
  s = moveAttachedItems(s, allyInstId, targetLocationId);
  s = { ...s, trampaActive: undefined, trampaVanquish: playerId };
  return addLog(s, `Trampa: ${ally.name} movido/a a ${targetLocationId}. Puedes llevar a cabo un Vencer.`);
}

/** Fase 2 de Trampa: el Vencer gratuito (no consume casilla de acción). */
export function resolveTrampaVanquish(
  state: GameState,
  heroInstId: CardInstId,
  allyInstIds: CardInstId[],
): GameState {
  if (!state.trampaVanquish) return state;
  const playerId = state.trampaVanquish;
  if (!canVanquishFree(state, playerId, heroInstId, allyInstIds).valid) return state;
  let s: GameState = { ...state, trampaVanquish: undefined };
  s = vanquishFree(s, playerId, heroInstId, allyInstIds);
  return s;
}

/** Renuncia a lo que quede de Trampa (no mover / no vencer). */
export function skipTrampa(state: GameState): GameState {
  if (!state.trampaActive && !state.trampaVanquish) return state;
  const s: GameState = { ...state, trampaActive: undefined, trampaVanquish: undefined };
  return addLog(s, 'Trampa: sin acción de Vencer.');
}

// ─── Reina de Corazones: selección de hasta N cartas (Postigo / Menguar) ──────────────

/**
 * Por orden de la Reina / Gato Risón: alterna el estado de Postigo de hasta `max` cartas
 * propias elegidas (dirección fijada por `pendingWicketPick.kind`). Ignora ids fuera de
 * `eligibleInstIds` o que excedan `max`.
 */
export function resolveWicketPick(state: GameState, selectedInstIds: CardInstId[]): GameState {
  const pending = state.pendingWicketPick;
  if (!pending) return state;
  const valid = selectedInstIds.filter(id => pending.eligibleInstIds.includes(id)).slice(0, pending.max);

  let s: GameState = { ...state, pendingWicketPick: undefined };
  for (const id of valid) {
    s = updateCard(s, id, { isWicket: pending.kind === 'TO_WICKET' });
  }
  if (valid.length === 0) return addLog(s, 'Ningún Soldado Naipe convertido.');
  const verb = pending.kind === 'TO_WICKET' ? 'convertidos en Postigo' : 'convertidos en Soldado Naipe';
  return addLog(s, `${valid.length} carta(s) ${verb}.`);
}

/** Furia: Mengua hasta `max` Héroes rivales elegidos entre `eligibleHeroInstIds`. */
export function resolveShrinkPick(state: GameState, selectedHeroInstIds: CardInstId[]): GameState {
  const pending = state.pendingShrinkPick;
  if (!pending) return state;
  const valid = selectedHeroInstIds.filter(id => pending.eligibleHeroInstIds.includes(id)).slice(0, pending.max);

  let s: GameState = { ...state, pendingShrinkPick: undefined };
  for (const id of valid) {
    s = applyMenguarToggle(s, pending.actingPlayerId, id);
  }
  if (valid.length === 0) return addLog(s, 'Furia: ningún Héroe menguado.');
  return addLog(s, `Furia: ${valid.length} Héroe(s) menguado(s).`);
}

/** Menguar/Furia: fija cuál de las casillas normalmente tapadas sigue tapada — resuelve el
 *  primero de la cola; si quedan más Héroes por decidir, el pending sigue vivo con el resto. */
export function resolveShrinkSlotChoice(state: GameState, slotIndex: number): GameState {
  const pending = state.pendingShrinkSlotChoice;
  if (!pending || pending.queue.length === 0) return state;
  const [current, ...rest] = pending.queue;
  let s: GameState = {
    ...state,
    pendingShrinkSlotChoice: rest.length > 0 ? { ...pending, queue: rest } : undefined,
  };
  if (!current.eligibleSlotIndices.includes(slotIndex)) return addLog(s, 'Menguar: casilla inválida.');
  s = updateCard(s, current.heroInstId, { shrunkKeptSlotIndex: slotIndex });
  const heroName = s.allCards[current.heroInstId]?.name ?? 'Héroe';
  return addLog(s, `Menguar: ${heroName} deja tapada esa casilla.`);
}

/** Efectúa el tiro: el jugador ya vio las 5 cartas reveladas — solo cierra la vista, el
 *  resultado (ganar/descartar) ya se había aplicado al jugar la carta. */
export function resolveShotReveal(state: GameState): GameState {
  if (!state.pendingShotReveal) return state;
  return { ...state, pendingShotReveal: undefined };
}

/** Agrandar: fija a qué ubicación adyacente y casilla también tapará el Héroe agrandado. */
export function resolveEnlargeTarget(
  state: GameState,
  locationId: LocationId,
  slotIndex: number,
): GameState {
  const pending = state.pendingEnlargeTarget;
  if (!pending) return state;
  const valid = pending.eligible.some(e => e.locationId === locationId && e.slotIndex === slotIndex);
  let s: GameState = { ...state, pendingEnlargeTarget: undefined };
  if (!valid) return addLog(s, 'Agrandar: destino inválido.');
  s = updateCard(s, pending.heroInstId, {
    isEnlarged: true, enlargedTargetLocationId: locationId, enlargedTargetSlotIndex: slotIndex,
  });
  const heroName = s.allCards[pending.heroInstId]?.name ?? 'Héroe';
  return addLog(s, `Agrandar: ${heroName} también tapa una casilla en ${locationId}.`);
}

export function resolveJaqueca(state: GameState, itemInstId: CardInstId): GameState {
  if (!state.pendingJaqueca) return state;
  const item = state.allCards[itemInstId];
  let s: GameState = { ...state, pendingJaqueca: undefined };
  s = discardCardFromKingdom(s, itemInstId);
  return addLog(s, `Gran Jaqueca descarta ${item?.name ?? 'Objeto'}.`);
}

export function resolveCondition(
  state: GameState,
  condInstId: CardInstId | null,
  ctx: ConditionCtx = {},
): GameState {
  if (!state.pendingCondition) return state;
  const { reactingPlayerId } = state.pendingCondition;
  let s: GameState = { ...state, pendingCondition: undefined };

  if (condInstId === null) {
    return addLog(s, 'Condición ignorada.');
  }

  const condCard = s.allCards[condInstId];
  if (!condCard) return s;

  s = updatePlayer(s, reactingPlayerId, {
    handInstIds: getPlayer(s, reactingPlayerId).handInstIds.filter(id => id !== condInstId),
    villainDiscardInstIds: [...getPlayer(s, reactingPlayerId).villainDiscardInstIds, condInstId],
  });
  s = addLog(s, `${getPlayer(s, reactingPlayerId).name} juega ${condCard.name}.`);

  const plugin = getPlugin(getPlayer(s, reactingPlayerId).villainId);
  const handlerId = condCard.effectIds.find(id => id in (plugin.conditionHandlers ?? {}));
  if (handlerId && plugin.conditionHandlers) {
    s = plugin.conditionHandlers[handlerId](s, reactingPlayerId, ctx);
  }

  return checkWin(s);
}

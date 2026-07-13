import { CardType } from '../types';
import type { GameState, CardInstId, LocationId, ConditionCtx } from '../types';
import {
  getPlayer, updatePlayer, updateLocationState, updateCard, addLog, checkWin,
  discardCardFromKingdom, moveAttachedItems,
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

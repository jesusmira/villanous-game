import type { GameState, CardInstId, ConditionCtx } from '../types';
import { getPlayer, updatePlayer, addLog, checkWin, discardCardFromKingdom } from './stateHelpers';
import { getPlugin } from '../villains/registry';

export { resolveCuervo } from '../villains/maleficent/resolvers';
export type { CuervoResolutionParams } from '../villains/maleficent/resolvers';
export { resolveDemosles } from '../villains/hook/resolvers';

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

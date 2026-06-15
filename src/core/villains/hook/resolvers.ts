import type { GameState, CardInstId } from '../../types';
import { getPlayer, updatePlayer, addLog } from '../../engine/stateHelpers';

export function resolveDemosles(
  state: GameState,
  discardIds: CardInstId[],
  orderedKeepIds: CardInstId[],
): GameState {
  if (!state.pendingDemosles) return state;
  const { playerId } = state.pendingDemosles;
  let s: GameState = { ...state, pendingDemosles: undefined };
  if (discardIds.length > 0) {
    s = updatePlayer(s, playerId, {
      fateDiscardInstIds: [...getPlayer(s, playerId).fateDiscardInstIds, ...discardIds],
    });
  }
  if (orderedKeepIds.length > 0) {
    s = updatePlayer(s, playerId, {
      fateDeckInstIds: [...orderedKeepIds, ...getPlayer(s, playerId).fateDeckInstIds],
    });
  }
  return addLog(s, `Démosles un susto: ${discardIds.length} descartada(s), ${orderedKeepIds.length} devuelta(s).`);
}

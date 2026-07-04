import type { GameState, CardInstId, PlayerId, ConditionCtx } from '../../types';
import { CardType } from '../../types';
import { getPlayer, updatePlayer, updateLocationState, updateCard, addLog } from '../../engine/stateHelpers';
import { runEffects } from '../../engine/EffectEngine';

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

function handlePerspicaz(s: GameState, reactingPlayerId: PlayerId, ctx: ConditionCtx): GameState {
  if (ctx.allyInstId && ctx.targetLocationId) {
    const ally = s.allCards[ctx.allyInstId];
    if (ally && ally.cardType === CardType.ALLY) {
      s = updatePlayer(s, reactingPlayerId, {
        handInstIds: getPlayer(s, reactingPlayerId).handInstIds.filter(id => id !== ctx.allyInstId),
      });
      const locState = getPlayer(s, reactingPlayerId).locationStates[ctx.targetLocationId];
      s = updateLocationState(s, reactingPlayerId, ctx.targetLocationId, {
        villainCardInstIds: [...locState.villainCardInstIds, ctx.allyInstId],
      });
      s = updateCard(s, ctx.allyInstId, { locationId: ctx.targetLocationId });
      s = runEffects(s, ctx.allyInstId, 'ON_PLAY', {
        actingPlayerId: reactingPlayerId,
        cardInstId: ctx.allyInstId,
        targetLocationId: ctx.targetLocationId,
      });
      s = addLog(s, `Perspicaz: ${ally.name} jugado gratis en ${ctx.targetLocationId}.`);
      const locAfter = getPlayer(s, reactingPlayerId).locationStates[ctx.targetLocationId];
      for (const cId of [...locAfter.villainCardInstIds]) {
        if (cId === ctx.allyInstId) continue;
        s = runEffects(s, cId, 'ON_ALLY_PLACED', {
          actingPlayerId: reactingPlayerId, cardInstId: cId,
          targetCardInstId: ctx.allyInstId, targetLocationId: ctx.targetLocationId,
        });
      }
    }
  }
  return s;
}

export const conditionHandlers: Record<string, (s: GameState, reactingPlayerId: PlayerId, ctx: ConditionCtx) => GameState> = {
  hook_perspicaz_cond: handlePerspicaz,
};

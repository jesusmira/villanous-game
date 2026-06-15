import { CardType } from '../../types';
import type { GameState, PlayerId, ConditionTriggerType } from '../../types';
import { getPlayer } from '../stateHelpers';
import { getEffectDef } from '../../villains/registry';
import { runEffects } from '../EffectEngine';

export function checkConditions(
  state: GameState,
  trigger: ConditionTriggerType,
  actingPlayerId: PlayerId,
): GameState {
  if (state.pendingCondition) return state;
  const reactingPlayer = state.players.find(p => p.id !== actingPlayerId);
  if (!reactingPlayer) return state;
  const eligible = reactingPlayer.handInstIds.filter(id => {
    const card = state.allCards[id];
    if (!card || card.cardType !== CardType.CONDITION) return false;
    return card.effectIds.some(effId => getEffectDef(effId)?.conditionTrigger === trigger);
  });
  if (eligible.length === 0) return state;
  return {
    ...state,
    pendingCondition: {
      reactingPlayerId: reactingPlayer.id,
      triggerType: trigger,
      eligibleCardInstIds: eligible,
    },
  };
}

// Detects if any effect (e.g. Rey Estéfano) moved a pawn and fires ON_PAWN_ARRIVES.
export function firePawnArrivalIfMoved(stateBefore: GameState, stateAfter: GameState): GameState {
  let s = stateAfter;
  for (const prevPlayer of stateBefore.players) {
    const newPawn = getPlayer(s, prevPlayer.id).pawnLocationId;
    if (newPawn !== prevPlayer.pawnLocationId) {
      const newLocState = getPlayer(s, prevPlayer.id).locationStates[newPawn];
      for (const cId of [
        ...(newLocState?.villainCardInstIds ?? []),
        ...(newLocState?.heroCardInstIds ?? []),
      ]) {
        s = runEffects(s, cId, 'ON_PAWN_ARRIVES', {
          actingPlayerId: prevPlayer.id, cardInstId: cId, targetLocationId: newPawn,
        });
      }
    }
  }
  return s;
}

import { CardType } from '../../types';
import type { GameState, PlayerId, ConditionTriggerType, CardInstId, LocationId } from '../../types';
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

/**
 * Un Héroe acaba de ser derrotado en `heroLocId` del Reino de `playerId`: dispara ON_VANQUISH en las
 * cartas de Villano de esa ubicación (p. ej. la Rueca de Maléfica). La carta dice "si un Héroe es
 * derrotado en esta ubicación", da igual cómo: por eso lo llaman la acción Vencer y también los
 * efectos que derrotan Héroes (Forma de Dragón, Malicia…), no solo executeVanquish.
 * `heroStrength` es la Fuerza en el momento de la derrota (calculada ANTES de descartarlo).
 */
export function fireHeroDefeated(
  state: GameState,
  playerId: PlayerId,
  heroInstId: CardInstId,
  heroLocId: LocationId,
  heroStrength: number,
): GameState {
  let s = state;
  for (const cId of [...(getPlayer(s, playerId).locationStates[heroLocId]?.villainCardInstIds ?? [])]) {
    s = runEffects(s, cId, 'ON_VANQUISH', {
      actingPlayerId: playerId, cardInstId: cId, targetCardInstId: heroInstId, targetLocationId: heroLocId,
      defeatedHeroStrength: heroStrength,
    });
  }
  return s;
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

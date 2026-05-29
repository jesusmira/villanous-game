import type { VillainPlugin, GameState, PlayerId } from '../../types';
import { getPlayer } from '../../engine/stateHelpers';
import { CardDefId } from '../effectIds';
import { effects } from './effects';
import { locations, villainCardDefs, fateCardDefs, HookObjectiveStep, HookLocationId } from './cards';

function checkWinCondition(state: GameState, playerId: PlayerId): boolean {
  const player = getPlayer(state, playerId);
  return (
    player.completedObjectiveSteps.includes(HookObjectiveStep.PETER_PAN_DEFEATED) &&
    player.completedObjectiveSteps.includes(HookObjectiveStep.HANGMAN_UNLOCKED)
  );
}

function getWinProgress(state: GameState, player: ReturnType<typeof getPlayer>): string {
  const steps = player.completedObjectiveSteps;
  const ppInKingdom = Object.values(player.locationStates).some(ls =>
    ls.heroCardInstIds.some(id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN),
  );
  return [
    steps.includes(HookObjectiveStep.HANGMAN_UNLOCKED)   ? '✅ Árbol desbloqueado'    : '❌ Árbol bloqueado',
    ppInKingdom                                           ? '✅ Peter Pan en el Reino' : '❌ Peter Pan no encontrado',
    steps.includes(HookObjectiveStep.PETER_PAN_DEFEATED)  ? '✅ Peter Pan derrotado'   : '❌ Peter Pan no derrotado',
  ].join(' | ');
}

export const hookPlugin: VillainPlugin = {
  id: 'hook',
  name: 'Capitán Garfio',
  color: '#8b1a1a',
  description: 'Encuentra a Peter Pan, desbloquea el Árbol del Ahorcado y derrótalo en el Jolly Roger.',
  locations,
  villainCardDefs,
  fateCardDefs,
  effects,
  startingPower: 0,
  startingLocationId: HookLocationId.JOLLY_ROGER,
  handSize: 4,
  checkWinCondition,
  getWinProgress,
};

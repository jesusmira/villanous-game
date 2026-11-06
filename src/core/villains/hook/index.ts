import type { VillainPlugin, GameState, PlayerId, CardInstId, LocationId } from '../../types';
import { getPlayer, updatePlayer } from '../../engine/stateHelpers';
import { CardDefId } from '../effectIds';
import { effects } from './effects';
import { locations, villainCardDefs, fateCardDefs, HookObjectiveStep, HookLocationId } from './cards';
import { intentions, deadCards, structuralThreats, aiWeights } from './intentions';
import { conditionHandlers } from './resolvers';

function onVanquish(state: GameState, playerId: PlayerId, heroInstId: CardInstId, heroLocId: LocationId): GameState {
  const hero = state.allCards[heroInstId];
  const steps = getPlayer(state, playerId).completedObjectiveSteps;

  if (hero?.defId === CardDefId.HOOK_TIC_TAC && !steps.includes(HookObjectiveStep.TIC_TAC_DEFEATED)) {
    state = updatePlayer(state, playerId, {
      completedObjectiveSteps: [...steps, HookObjectiveStep.TIC_TAC_DEFEATED],
    });
  }

  if (hero?.defId === CardDefId.HOOK_PETER_PAN && heroLocId === HookLocationId.JOLLY_ROGER) {
    const updatedSteps = getPlayer(state, playerId).completedObjectiveSteps;
    state = updatePlayer(state, playerId, {
      completedObjectiveSteps: [...updatedSteps, HookObjectiveStep.PETER_PAN_DEFEATED],
    });
  }

  return state;
}

function checkWinCondition(state: GameState, playerId: PlayerId): boolean {
  const player = getPlayer(state, playerId);

  // Única condición: Peter Pan derrotado en Jolly Roger
  return player.completedObjectiveSteps.includes(HookObjectiveStep.PETER_PAN_DEFEATED);
}

function getWinProgress(_state: GameState, player: ReturnType<typeof getPlayer>): string {
  // Solo la condición de victoria real; los pasos intermedios (Árbol, Peter Pan en el Reino)
  // se ven ya en el tablero y ocupaban demasiado sitio en la placa.
  return player.completedObjectiveSteps.includes(HookObjectiveStep.PETER_PAN_DEFEATED)
    ? '✅ Peter Pan derrotado'
    : '❌ Peter Pan no derrotado';
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
  onVanquish,
  conditionHandlers,
  intentions,
  deadCards,
  structuralThreats,
  aiWeights,
};

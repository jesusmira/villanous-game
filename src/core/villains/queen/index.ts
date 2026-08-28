import type { VillainPlugin, GameState, PlayerId, PlayerState } from '../../types';
import { getPlayer } from '../../engine/stateHelpers';
import { effects, QUEEN_SHOT_SUCCESSFUL_STEP } from './effects';
import { locations, villainCardDefs, fateCardDefs, QueenLocationId } from './cards';
import { conditionHandlers, onHeroDiscarded } from './resolvers';
import { intentions, deadCards, structuralThreats, aiWeights } from './intentions';

/** Nº de ubicaciones del Reino que ya tienen al menos un Postigo. */
export function countLocationsWithWicket(player: PlayerState, allCards: GameState['allCards']): number {
  return Object.values(player.locationStates).filter(ls =>
    ls.villainCardInstIds.some(id => allCards[id]?.isWicket),
  ).length;
}

// ── Win condition ─────────────────────────────────────────────────────────────
// La Reina de Corazones NO lleva asterisco en el resumen de objetivos del reglamento
// (a diferencia de Maléfica/Príncipe Juan) → gana en cuanto "Efectúa el tiro" tiene éxito,
// sin esperar al inicio de su turno (mismo patrón que Garfio).
function checkWinCondition(state: GameState, playerId: PlayerId): boolean {
  return getPlayer(state, playerId).completedObjectiveSteps.includes(QUEEN_SHOT_SUCCESSFUL_STEP);
}

function getWinProgress(state: GameState, player: PlayerState): string {
  const covered = countLocationsWithWicket(player, state.allCards);
  return `${covered}/4 ubicaciones con Postigo 🏰`;
}

// ── Plugin export ─────────────────────────────────────────────────────────────
export const queenPlugin: VillainPlugin = {
  id: 'queen',
  name: 'Reina de Corazones',
  color: '#b3123f',
  description: 'Convierte Soldados Naipe en Postigos hasta tener uno en cada ubicación de tu Reino y juega "Efectúa el tiro".',
  startingPower: 0,
  startingLocationId: QueenLocationId.PATIO,
  handSize: 4,

  locations,
  villainCardDefs,
  fateCardDefs,
  effects,

  checkWinCondition,
  getWinProgress,

  conditionHandlers,
  onHeroDiscarded,
  intentions,
  deadCards,
  structuralThreats,
  aiWeights,
};

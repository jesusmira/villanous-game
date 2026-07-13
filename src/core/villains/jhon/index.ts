import { TurnPhase } from '../../types';
import type { VillainPlugin, GameState, PlayerId, PlayerState } from '../../types';
import { getPlayer } from '../../engine/stateHelpers';
import { effects } from './effects';
import { locations, villainCardDefs, fateCardDefs, JhonLocationId } from './cards';
import { conditionHandlers, onVanquish, onHeroDiscarded } from './resolvers';
import { scoreState, deadHandCards } from './ai';

// ── Win condition ─────────────────────────────────────────────────────────────
function checkWinCondition(state: GameState, playerId: PlayerId): boolean {
  if (state.turnPhase !== TurnPhase.MOVE) return false;
  if (state.players[state.currentPlayerIndex].id !== playerId) return false;
  return getPlayer(state, playerId).power >= 20;
}

function getWinProgress(_state: GameState, player: PlayerState): string {
  return `${player.power}/20 ⚡`;
}

// ── Plugin export ─────────────────────────────────────────────────────────────
export const jhonPlugin: VillainPlugin = {
  id: 'jhon',
  name: 'Príncipe Juan',
  color: '#e8c84a',
  description: 'Empieza tu turno con al menos 20 Monedas de Poder.',
  startingPower: 0,
  startingLocationId: JhonLocationId.BOSQUE,
  handSize: 4,

  locations,
  villainCardDefs,
  fateCardDefs,
  effects,

  checkWinCondition,
  getWinProgress,
  onVanquish,
  onHeroDiscarded,

  conditionHandlers,
  aiHeuristics: { scoreState, deadHandCards },
};

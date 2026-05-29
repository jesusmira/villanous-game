import { CardType } from '../../types';
import type { VillainPlugin, GameState, PlayerId } from '../../types';
import { getPlayer } from '../../engine/stateHelpers';
import { effects } from './effects';
import { locations, villainCardDefs, fateCardDefs } from './cards';

function checkWinCondition(state: GameState, playerId: PlayerId): boolean {
  const player = getPlayer(state, playerId);
  for (const locId of Object.keys(player.locationStates)) {
    const locState = player.locationStates[locId];
    const hasCurse = locState.villainCardInstIds.some(
      id => state.allCards[id]?.cardType === CardType.CURSE,
    );
    if (!hasCurse) return false;
  }
  return true;
}

function getWinProgress(state: GameState, player: ReturnType<typeof getPlayer>): string {
  const withCurse = locations.filter(l => {
    const ls = player.locationStates[l.id];
    return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
  }).length;
  return `Maldiciones: ${withCurse}/${locations.length}`;
}

export const maleficentPlugin: VillainPlugin = {
  id: 'maleficent',
  name: 'Maléfica',
  color: '#4a0080',
  description: 'Cubre cada ubicación de tu Reino con al menos una Maldición.',
  locations,
  villainCardDefs,
  fateCardDefs,
  effects,
  startingPower: 0,
  startingLocationId: 'montanas',
  handSize: 4,
  checkWinCondition,
  getWinProgress,
};

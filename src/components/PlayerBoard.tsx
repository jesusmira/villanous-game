import type { GameState, PlayerState, CardInstId, CardInst } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getCoveredSlotIndices, getAvailableSlotIndices } from '../core/engine/stateHelpers';
import { LocationTile } from './LocationTile';

interface Props {
  state: GameState;
  player: PlayerState;
  isActive: boolean;
  onCardClick: (id: CardInstId) => void;
  onDetailClick?: (card: CardInst) => void;
  selectedCardId: CardInstId | null;
}

export function PlayerBoard({ state, player, isActive, onCardClick, onDetailClick, selectedCardId }: Props) {
  const plugin = getPlugin(player.villainId);
  const progressLabel = plugin.getWinProgress(state, player);

  return (
    <div
      className={`player-board ${isActive ? 'player-board-active' : ''}`}
      style={{ '--villain-color': plugin.color }}
    >
      <div className="board-header">
        <div className="board-villain-name" style={{ color: plugin.color }}>{plugin.name}</div>
        <div className="board-player-name">{player.name}</div>
        <div className="board-stats">
          <span className="stat">💰 {player.power}</span>
          <span className="stat">🃏 Mano: {player.handInstIds.length}</span>
          <span className="stat">📚 Mazo: {player.villainDeckInstIds.length}</span>
          <span className="stat">🎯 Destino: {player.fateDeckInstIds.length}</span>
        </div>
        {progressLabel && <div className="board-progress">{progressLabel}</div>}
      </div>

      <div className="locations-row">
        {plugin.locations.map(locDef => {
          const locState = player.locationStates[locDef.id];
          const covered   = getCoveredSlotIndices(state, player.id, locDef.id);
          const available = isActive ? getAvailableSlotIndices(state, player.id, locDef.id) : [];
          return (
            <LocationTile
              key={locDef.id}
              locDef={locDef}
              locState={locState}
              state={state}
              isCurrentPawn={player.pawnLocationId === locDef.id}
              coveredSlotIndices={covered}
              availableSlotIndices={available}
              selectedCardId={selectedCardId}
              onCardClick={onCardClick}
              onDetailClick={onDetailClick}
            />
          );
        })}
      </div>
    </div>
  );
}

import type { GameState, PlayerState, CardInstId } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getCoveredSlotIndices, getAvailableSlotIndices } from '../core/engine/stateHelpers';
import { LocationTile } from './LocationTile';

interface Props {
  state: GameState;
  player: PlayerState;
  isActive: boolean;
  onCardClick: (id: CardInstId) => void;
  onSlotClick: (slotIndex: number) => void;
  selectedCardId: CardInstId | null;
}

export function PlayerBoard({ state, player, isActive, onCardClick, onSlotClick, selectedCardId }: Props) {
  const plugin = getPlugin(player.villainId);

  // Deck/hand counts
  const deckCount = player.villainDeckInstIds.length;
  const fateCount = player.fateDeckInstIds.length;
  const handCount = player.handInstIds.length;

  // Win progress for Maleficent: count locations with curses
  let progressLabel = '';
  if (player.villainId === 'maleficent') {
    const withCurse = plugin.locations.filter(l => {
      const ls = player.locationStates[l.id];
      return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === 'CURSE');
    }).length;
    progressLabel = `Maldiciones: ${withCurse}/${plugin.locations.length}`;
  } else if (player.villainId === 'hook') {
    const steps = player.completedObjectiveSteps;
    const parts = [
      steps.includes('HANGMAN_UNLOCKED') ? '✅ Árbol desbloqueado' : '❌ Árbol bloqueado',
      (() => {
        const ppInKingdom = Object.values(player.locationStates).some(ls =>
          ls.heroCardInstIds.some(id => state.allCards[id]?.defId === 'hook_fate_peter_pan'),
        );
        return ppInKingdom ? '✅ Peter Pan en el Reino' : '❌ Peter Pan no encontrado';
      })(),
      steps.includes('PETER_PAN_DEFEATED_AT_JOLLYROGER') ? '✅ Peter Pan derrotado' : '❌ Peter Pan no derrotado',
    ];
    progressLabel = parts.join(' | ');
  }

  return (
    <div
      className={`player-board ${isActive ? 'player-board-active' : ''}`}
      style={{ '--villain-color': plugin.color } as React.CSSProperties}
    >
      <div className="board-header">
        <div className="board-villain-name" style={{ color: plugin.color }}>
          {plugin.name}
        </div>
        <div className="board-player-name">{player.name}</div>
        <div className="board-stats">
          <span className="stat">💰 {player.power}</span>
          <span className="stat">🃏 Mano: {handCount}</span>
          <span className="stat">📚 Mazo: {deckCount}</span>
          <span className="stat">🎯 Destino: {fateCount}</span>
        </div>
        {progressLabel && (
          <div className="board-progress">{progressLabel}</div>
        )}
      </div>

      <div className="locations-row">
        {plugin.locations.map(locDef => {
          const locState = player.locationStates[locDef.id];
          const covered = getCoveredSlotIndices(state, player.id, locDef.id);
          const available = isActive
            ? getAvailableSlotIndices(state, player.id, locDef.id)
            : [];

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
              onSlotClick={onSlotClick}
              onCardClick={onCardClick}
            />
          );
        })}
      </div>
    </div>
  );
}

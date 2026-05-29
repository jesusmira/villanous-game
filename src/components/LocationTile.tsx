import { CardDeck } from '../core/types';
import type { LocationDef, LocationState, GameState, CardInstId } from '../core/types';
import { CardComponent } from './CardComponent';

const ACTION_ICONS: Record<string, string> = {
  GAIN_POWER: '💰',
  PLAY_CARD: '🃏',
  MOVE_ITEM_ALLY: '↔️',
  MOVE_HERO: '🔀',
  VANQUISH: '⚔️',
  ACTIVATE_CARD: '✨',
  FATE: '🎯',
  DISCARD: '🗑️',
};

const ACTION_LABELS: Record<string, string> = {
  GAIN_POWER: 'Ganar Poder',
  PLAY_CARD: 'Jugar Carta',
  MOVE_ITEM_ALLY: 'Mover Obj/Ali',
  MOVE_HERO: 'Mover Héroe',
  VANQUISH: 'Vencer',
  ACTIVATE_CARD: 'Activar',
  FATE: 'Destino',
  DISCARD: 'Descartar',
};

interface Props {
  locDef: LocationDef;
  locState: LocationState;
  state: GameState;
  isCurrentPawn: boolean;
  coveredSlotIndices: number[];
  availableSlotIndices: number[];
  selectedCardId: CardInstId | null;
  onSlotClick: (slotIndex: number) => void;
  onCardClick: (cardInstId: CardInstId) => void;
}

export function LocationTile({
  locDef, locState, state, isCurrentPawn,
  coveredSlotIndices, availableSlotIndices, selectedCardId,
  onSlotClick, onCardClick,
}: Props) {
  const allFromVillainSlot = locState.villainCardInstIds.map(id => state.allCards[id]).filter(Boolean);
  // Fate-deck items (e.g. Polvo de Hada, Burla) live in villainCardInstIds but render with heroes
  const fateItemCards = allFromVillainSlot.filter(c => c.deck === CardDeck.FATE);
  const allVillainCards = allFromVillainSlot.filter(c => c.deck !== CardDeck.FATE);
  const allHeroCards = locState.heroCardInstIds.map(id => state.allCards[id]).filter(Boolean);

  return (
    <div className={`location-tile ${isCurrentPawn ? 'location-pawn' : ''} ${locState.isLocked ? 'location-locked' : ''}`}>
      {/* Hero row (top) — heroes + fate items */}
      <div className="location-heroes">
        {allHeroCards.map(card => (
          <CardComponent
            key={card.instId}
            card={card}
            state={state}
            small
            selected={selectedCardId === card.instId}
            onClick={() => onCardClick(card.instId)}
          />
        ))}
        {fateItemCards.map(card => (
          <CardComponent
            key={card.instId}
            card={card}
            state={state}
            small
            selected={selectedCardId === card.instId}
            onClick={() => onCardClick(card.instId)}
          />
        ))}
        {locState.isLocked && <div className="lock-badge">🔒</div>}
      </div>

      {/* Action slots */}
      <div className="location-name">{locDef.name}</div>
      {isCurrentPawn && <div className="pawn-marker">🔮</div>}

      <div className="location-actions">
        {locDef.actions.map((slot, idx) => {
          const covered = coveredSlotIndices.includes(idx);
          const available = availableSlotIndices.includes(idx);
          return (
            <button
              key={idx}
              className={`action-slot ${covered ? 'action-covered' : ''} ${available ? 'action-available' : ''}`}
              disabled={covered || !available}
              onClick={() => onSlotClick(idx)}
              title={covered ? 'Tapado por un Héroe' : (ACTION_LABELS[slot.type] ?? slot.type)}
            >
              <span className="action-slot-icon">{ACTION_ICONS[slot.type] ?? '?'}</span>
              {slot.value !== undefined && <span className="action-value">+{slot.value}</span>}
              <span className="action-slot-label">{ACTION_LABELS[slot.type] ?? slot.type}</span>
            </button>
          );
        })}
      </div>

      {/* Villain cards row (bottom) */}
      <div className="location-villain-cards">
        {allVillainCards.map(card => (
          <CardComponent
            key={card.instId}
            card={card}
            state={state}
            small
            selected={selectedCardId === card.instId}
            onClick={() => onCardClick(card.instId)}
          />
        ))}
      </div>
    </div>
  );
}

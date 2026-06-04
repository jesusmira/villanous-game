import type React from 'react';
import type { CardInst, GameState } from '../core/types';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { getCardDef } from '../core/villains/registry';

interface Props {
  card: CardInst;
  state: GameState;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

const CARD_GRADIENTS: Record<string, string> = {
  ALLY:      'linear-gradient(160deg, #1a3320 0%, #0f1a12 100%)',
  ITEM:      'linear-gradient(160deg, #1a2b3a 0%, #0f1520 100%)',
  EFFECT:    'linear-gradient(160deg, #2a1a35 0%, #15101f 100%)',
  CURSE:     'linear-gradient(160deg, #1a1025 0%, #0e0c18 100%)',
  HERO:      'linear-gradient(160deg, #3a2010 0%, #1f1008 100%)',
  CONDITION: 'linear-gradient(160deg, #2a2a10 0%, #181808 100%)',
};

const TYPE_LABELS_ES: Record<string, string> = {
  ALLY:      'Aliado',
  ITEM:      'Objeto',
  EFFECT:    'Efecto',
  CURSE:     'Maldición',
  HERO:      'Héroe',
  CONDITION: 'Condición',
};

export function CardComponent({ card, state, selected, onClick, small: _small, draggable: isDraggable, onDragStart, onDragEnd }: Props) {
  const effectiveStr  = card.baseStrength !== undefined ? getEffectiveStrength(state, card.instId) : undefined;
  const effectiveCost = Math.max(0, card.baseCost + card.costModifier);
  const desc          = getCardDef(card.defId)?.description ?? '';
  const isHero        = card.cardType === 'HERO';

  return (
    <div
      className={`villainous-card ${isHero ? 'hero-card' : ''} ${onClick ? 'cursor-pointer hover:scale-110 hover:-translate-y-1' : ''} ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{
        outline: selected ? '2px solid #e9c349' : undefined,
        outlineOffset: selected ? '2px' : undefined,
        boxShadow: selected
          ? '0 0 12px rgba(233,195,73,0.45), 0 10px 20px rgba(0,0,0,0.5)'
          : undefined,
      }}
      onClick={onClick}
      title={card.name}
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="card-inner-frame" />

      {/* Cost bubble */}
      <div className="card-cost-bubble">{effectiveCost}</div>

      {/* Background gradient (no artwork) */}
      <div
        className="card-bg"
        style={{ background: CARD_GRADIENTS[card.cardType] ?? 'linear-gradient(160deg, #2a2a3a 0%, #1a1a1a 100%)' }}
      />

      {/* Info box */}
      <div className="card-info-box">
        <span className="card-name-label">{card.name}</span>
        <span className="card-type-label">{TYPE_LABELS_ES[card.cardType] ?? card.cardType}</span>
        {desc && <p className="card-ability-text line-clamp-2">{desc}</p>}
      </div>

      {/* Strength badge */}
      {effectiveStr !== undefined && (
        <div className="card-strength-badge">{effectiveStr}</div>
      )}

    </div>
  );
}

import type React from 'react';
import type { CardInst, GameState } from '../core/types';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { Image } from './Image';
import { assetUrl } from '../lib/assets';

interface Props {
  card: CardInst;
  state: GameState;
  selected?: boolean;
  onClick?: () => void;
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


export function CardComponent({ card, state, selected, onClick, draggable: isDraggable, onDragStart, onDragEnd }: Props) {
  const effectiveStr = card.baseStrength !== undefined ? getEffectiveStrength(state, card.instId) : undefined;
  const baseStr      = card.baseStrength ?? 0;
  const hasBonus     = effectiveStr !== undefined && effectiveStr !== baseStr;
  const isHero       = card.cardType === 'HERO';

  const imageUrl = card.imageFile
    ? assetUrl(`cards/${card.villainId}/${card.imageFile}.webp`)
    : null;

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
      {/* Gradient fallback */}
      <div
        className="card-bg"
        style={{ background: CARD_GRADIENTS[card.cardType] ?? 'linear-gradient(160deg, #2a2a3a 0%, #1a1a1a 100%)' }}
      />
      {/* Card artwork — React-controlled, resets on src change */}
      {imageUrl && <Image src={imageUrl} className="card-art" />}

      {/* Strength badge — solo si tiene bonificadores */}
      {hasBonus && (
        <div className="card-strength-badge">{effectiveStr}</div>
      )}

      {/* Stored power badge (Little John) */}
      {(card.storedPower ?? 0) > 0 && (
        <div className="card-stored-power-badge">{card.storedPower}</div>
      )}

    </div>
  );
}

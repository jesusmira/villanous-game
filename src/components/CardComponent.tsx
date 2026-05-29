import { useState } from 'react';
import type { CardInst, GameState } from '../core/types';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { getCardDef } from '../core/villains/registry';
import { CardDetailModal } from './CardDetailModal';

interface Props {
  card: CardInst;
  state: GameState;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  ALLY: '#2a5c2a',
  ITEM: '#2a3d5c',
  EFFECT: '#5c2a5c',
  CURSE: '#1a1a3a',
  HERO: '#5c3a00',
  CONDITION: '#3a3a00',
};

export function CardComponent({ card, state, selected, onClick, small }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const effectiveStr = card.baseStrength !== undefined
    ? getEffectiveStrength(state, card.instId)
    : undefined;
  const effectiveCost = Math.max(0, card.baseCost + card.costModifier);
  const desc = getCardDef(card.defId)?.description ?? '';

  return (
    <>
      <div
        className={`card ${small ? 'card-small' : ''} ${selected ? 'card-selected' : ''} ${onClick ? 'card-clickable' : ''}`}
        style={{ '--card-color': TYPE_COLORS[card.cardType] ?? '#333' } as React.CSSProperties}
        onClick={onClick}
        title={card.name}
      >
        <div className="card-header">
          <span className="card-cost">{effectiveCost}</span>
          <span className="card-type">{card.cardType}</span>
        </div>
        <div className="card-name">{card.name}</div>
        {!small && desc && (
          <div className="card-desc">{desc}</div>
        )}
        {effectiveStr !== undefined && (
          <div className="card-strength">{effectiveStr}</div>
        )}
        <button
          className="card-info-btn"
          onClick={e => { e.stopPropagation(); setShowDetail(true); }}
          title="Ver detalles"
        >?</button>
      </div>
      {showDetail && (
        <CardDetailModal card={card} state={state} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}

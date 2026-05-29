import type { CardInst, GameState } from '../core/types';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { getCardDef } from '../core/villains/registry';

const TYPE_LABELS: Record<string, string> = {
  ALLY: 'Aliado',
  ITEM: 'Objeto',
  EFFECT: 'Efecto',
  CONDITION: 'Condición',
  HERO: 'Héroe',
  CURSE: 'Maldición',
};

interface Props {
  card: CardInst;
  state: GameState;
  onClose: () => void;
}

export function CardDetailModal({ card, state, onClose }: Props) {
  const desc = getCardDef(card.defId)?.description ?? '';
  const effectiveCost = Math.max(0, card.baseCost + card.costModifier);
  const effectiveStr = card.baseStrength !== undefined
    ? getEffectiveStrength(state, card.instId)
    : undefined;
  const typeLabel = TYPE_LABELS[card.cardType] ?? card.cardType;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="cdm-header">
          <span className="cdm-type-badge">{typeLabel}</span>
          <button className="cdm-close" onClick={onClose}>×</button>
        </div>
        <div className="cdm-name">{card.name}</div>
        <div className="cdm-stats">
          <div className="cdm-stat">
            <span className="cdm-stat-label">Coste</span>
            <span className="cdm-stat-value">{effectiveCost}</span>
          </div>
          {effectiveStr !== undefined && (
            <div className="cdm-stat">
              <span className="cdm-stat-label">Fuerza</span>
              <span className="cdm-stat-value">{effectiveStr}</span>
            </div>
          )}
        </div>
        {desc && <p className="cdm-desc">{desc}</p>}
      </div>
    </div>
  );
}

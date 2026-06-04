import type { CardInst, GameState } from '../core/types';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { getCardDef } from '../core/villains/registry';
import { X } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  ALLY: 'Aliado', ITEM: 'Objeto', EFFECT: 'Efecto',
  CONDITION: 'Condición', HERO: 'Héroe', CURSE: 'Maldición',
};

const TYPE_COLORS: Record<string, string> = {
  ALLY: '#4ade80', ITEM: '#60a5fa', EFFECT: '#c084fc',
  CURSE: '#a78bfa', HERO: '#f87171', CONDITION: '#facc15',
};

interface Props { card: CardInst; state: GameState; onClose: () => void }

export function CardDetailModal({ card, state, onClose }: Props) {
  const desc           = getCardDef(card.defId)?.description ?? '';
  const effectiveCost  = Math.max(0, card.baseCost + card.costModifier);
  const effectiveStr   = card.baseStrength !== undefined ? getEffectiveStrength(state, card.instId) : undefined;
  const typeLabel      = TYPE_LABELS[card.cardType] ?? card.cardType;
  const typeColor      = TYPE_COLORS[card.cardType] ?? '#d3bcf9';

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-100 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-container border border-primary/40 rounded-xl p-5 w-80 max-w-[92vw] flex flex-col gap-4 shadow-[0_0_40px_rgba(211,188,249,0.3)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span
            className="font-stats text-[11px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded"
            style={{ background: `${typeColor}20`, color: typeColor, border: `1px solid ${typeColor}40` }}
          >
            {typeLabel}
          </span>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Card name */}
        <h3 className="font-serif text-xl font-bold text-on-surface leading-tight">{card.name}</h3>

        {/* Stats */}
        <div className="flex gap-3">
          <div className="bg-surface-container-high border border-outline-variant/30 rounded-lg px-4 py-2.5 flex flex-col items-center gap-0.5">
            <span className="font-stats text-[9px] text-on-surface-variant uppercase tracking-wider">Coste</span>
            <span className="font-stats text-xl font-bold text-tertiary">{effectiveCost}</span>
          </div>
          {effectiveStr !== undefined && (
            <div className="bg-surface-container-high border border-error/30 rounded-lg px-4 py-2.5 flex flex-col items-center gap-0.5">
              <span className="font-stats text-[9px] text-on-surface-variant uppercase tracking-wider">Fuerza</span>
              <span className="font-stats text-xl font-bold text-error">{effectiveStr}</span>
            </div>
          )}
        </div>

        {/* Description */}
        {desc && (
          <p className="font-sans text-sm text-on-surface leading-relaxed border-t border-outline-variant/30 pt-3">
            {desc}
          </p>
        )}
      </div>
    </div>
  );
}

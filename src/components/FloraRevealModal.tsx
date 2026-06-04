import { X } from 'lucide-react';
import type { GameState, PlayerState } from '../core/types';
import { CardComponent } from './CardComponent';

interface Props {
  state: GameState;
  victim: PlayerState;
  onClose: () => void;
}

export function FloraRevealModal({ state, victim, onClose }: Props) {
  const handCards = victim.handInstIds.map(id => state.allCards[id]).filter(Boolean);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface-container-highest border border-error/30 rounded-2xl shadow-2xl flex flex-col w-full max-w-2xl max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <div>
            <h2 className="font-serif text-base text-on-surface">Mano de {victim.name}</h2>
            <p className="font-stats text-[9px] uppercase tracking-widest text-error/70 mt-0.5">
              Flora revelada · {handCards.length} carta{handCards.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant/50 hover:text-on-surface transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cards */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {handCards.length === 0 ? (
            <p className="text-xs text-on-surface-variant/60 italic text-center py-8">La mano está vacía.</p>
          ) : (
            <div className="flex flex-wrap justify-center gap-4">
              {handCards.map(card => (
                <CardComponent key={card.instId} card={card} state={state} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

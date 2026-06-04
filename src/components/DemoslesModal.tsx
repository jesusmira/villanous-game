import { useState } from 'react';
import type { GameState, CardInstId } from '../core/types';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';

interface Props { state: GameState }

export function DemoslesModal({ state }: Props) {
  const doResolveDemosles = useGameStore(s => s.doResolveDemosles);
  const { pendingDemosles } = state;

  const [toDiscard, setToDiscard] = useState<Set<CardInstId>>(new Set());
  const [topCardId, setTopCardId] = useState<CardInstId | null>(null);

  if (!pendingDemosles) return null;

  const { topCardIds } = pendingDemosles;
  const cards      = topCardIds.map(id => state.allCards[id]).filter(Boolean);
  const keepIds    = topCardIds.filter(id => !toDiscard.has(id));
  const needsOrder = keepIds.length === 2;
  const canConfirm = !needsOrder || topCardId !== null;

  function toggleDiscard(id: CardInstId) {
    setToDiscard(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
    setTopCardId(null);
  }

  function confirm() {
    const orderedKeep = needsOrder && topCardId
      ? [topCardId, ...keepIds.filter(id => id !== topCardId)]
      : keepIds;
    doResolveDemosles([...toDiscard], orderedKeep);
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-surface-container-highest border border-error/30 rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto flex flex-col gap-5 p-5">

        {/* Header */}
        <div>
          <h2 className="font-serif text-base text-error">Démosles un Susto</h2>
          <p className="text-[11px] text-on-surface-variant/60 mt-0.5 leading-snug">
            Elige qué descartar. Si guardas las dos, selecciona cuál va primera.
          </p>
        </div>

        {/* Cards */}
        <div className="flex justify-center gap-6">
          {cards.map(card => {
            const discarded  = toDiscard.has(card.instId);
            const isTop      = topCardId === card.instId;
            const isKept     = !discarded;
            return (
              <div key={card.instId} className="flex flex-col items-center gap-3">

                {/* Card visual */}
                <div
                  onClick={() => toggleDiscard(card.instId)}
                  className={`cursor-pointer transition-all duration-200 rounded-xl select-none ${
                    discarded ? 'opacity-30 scale-95 grayscale' : 'hover:scale-105'
                  } ${isTop ? 'ring-2 ring-tertiary' : ''}`}
                >
                  <CardComponent card={card} state={state} selected={isTop} />
                </div>

                {/* Action buttons below the card */}
                <div className="flex flex-col items-center gap-1.5">
                  {/* Toggle discard */}
                  <button
                    onClick={() => toggleDiscard(card.instId)}
                    className={`px-3 py-1 rounded-lg border font-stats text-[10px] uppercase tracking-wider transition-all ${
                      discarded
                        ? 'border-error/60 bg-error/15 text-error hover:bg-error/25'
                        : 'border-outline-variant/40 text-on-surface-variant/60 hover:border-error/50 hover:text-error/70'
                    }`}
                  >
                    {discarded ? '✕ Descartar' : '✓ Guardar'}
                  </button>

                  {/* "Poner primero" — solo si hay 2 cartas guardadas */}
                  {needsOrder && isKept && (
                    <button
                      onClick={() => setTopCardId(isTop ? null : card.instId)}
                      className={`px-3 py-1 rounded-lg border font-stats text-[10px] uppercase tracking-wider transition-all ${
                        isTop
                          ? 'border-tertiary bg-tertiary/15 text-tertiary'
                          : 'border-outline-variant/40 text-on-surface-variant/50 hover:border-tertiary/50 hover:text-tertiary/70'
                      }`}
                    >
                      {isTop ? '★ Primera' : '↑ Poner primera'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Status + confirm */}
        <div className="flex items-center justify-between border-t border-outline-variant/15 pt-3">
          <span className="font-stats text-[10px] text-on-surface-variant/50">
            {toDiscard.size > 0 ? `${toDiscard.size} descartada(s)` : 'Ninguna descartada'}
            {keepIds.length > 0 && ` · ${keepIds.length} al mazo`}
          </span>
          <button
            disabled={!canConfirm}
            onClick={confirm}
            className="px-4 py-1.5 rounded-xl border border-primary/50 bg-primary-container text-primary font-stats text-xs uppercase tracking-wider hover:bg-primary/20 transition-all disabled:opacity-35 disabled:cursor-not-allowed"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { GameState, CardInstId } from '../core/types';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';
import { ModalStage } from './shared/ModalStage';

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
    <ModalStage
      passThrough
      tone="fate"
      eyebrow="Démosles un Susto"
      title="Mira las dos cartas de Destino"
      subtitle="Descarta las que quieras. Si guardas las dos, elige cuál queda arriba."
      actions={<>
        <span className="modal-stage-label">
          {toDiscard.size > 0 ? `${toDiscard.size} descartada(s)` : 'Ninguna descartada'}
          {keepIds.length > 0 && ` · ${keepIds.length} al mazo`}
        </span>
        <button disabled={!canConfirm} onClick={confirm} className="btn btn--primary">Confirmar</button>
      </>}
    >
      <div className="flex flex-wrap justify-center gap-6 sm:gap-10">
        {cards.map(card => {
          const discarded = toDiscard.has(card.instId);
          const isTop     = topCardId === card.instId;
          const isKept    = !discarded;
          return (
            <div key={card.instId} className="flex flex-col items-center gap-3">
              <button
                onClick={() => toggleDiscard(card.instId)}
                className={`stage-pick ${isTop ? 'is-chosen' : ''} ${discarded ? 'opacity-35 grayscale' : ''}`}
              >
                <CardComponent card={card} state={state} selected={isTop} sizeClassName="card-size-stage" />
              </button>
              <div className="flex flex-col items-center gap-1.5">
                <button
                  onClick={() => toggleDiscard(card.instId)}
                  className={`chip ${discarded ? 'is-danger-chosen' : ''}`}
                >
                  {discarded ? '✕ Descartar' : '✓ Guardar'}
                </button>
                {needsOrder && isKept && (
                  <button
                    onClick={() => setTopCardId(isTop ? null : card.instId)}
                    className={`chip ${isTop ? 'is-chosen' : ''}`}
                  >
                    {isTop ? '★ Primera' : '↑ Poner primera'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ModalStage>
  );
}

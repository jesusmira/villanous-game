import { useState } from 'react';
import type { GameState, CardInstId } from '../core/types';
import { useGameStore } from '../state/gameStore';

interface Props { state: GameState }

export function DemoslesModal({ state }: Props) {
  const store = useGameStore();
  const { pendingDemosles } = state;

  const [toDiscard, setToDiscard] = useState<Set<CardInstId>>(new Set());
  const [topCardId, setTopCardId] = useState<CardInstId | null>(null);

  if (!pendingDemosles) return null;

  const { topCardIds } = pendingDemosles;
  const cards = topCardIds.map(id => state.allCards[id]).filter(Boolean);

  const keepIds = topCardIds.filter(id => !toDiscard.has(id));
  const needsOrder = keepIds.length === 2;

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
    store.doResolveDemosles([...toDiscard], orderedKeep);
  }

  const canConfirm = !needsOrder || topCardId !== null;

  return (
    <div className="modal-overlay">
      <div className="modal demosles-modal">
        <h2>Démosles un Susto</h2>
        <p>Has revelado las cartas superiores de tu mazo de Destino. Elige cuáles descartar; el resto vuelve encima del mazo.</p>

        <div className="demosles-cards">
          {cards.map(card => (
            <div
              key={card.instId}
              className={`demosles-card ${toDiscard.has(card.instId) ? 'marked-discard' : ''}`}
            >
              <div className="demosles-card-info">
                <div className="fate-card-name">{card.name}</div>
                <div className="fate-card-type">{card.cardType}</div>
                {card.baseStrength !== undefined && (
                  <div className="fate-card-strength">Fuerza: {card.baseStrength}</div>
                )}
              </div>
              <button
                className={`discard-toggle-btn ${toDiscard.has(card.instId) ? 'active' : ''}`}
                onClick={() => toggleDiscard(card.instId)}
              >
                {toDiscard.has(card.instId) ? 'Descartar ✓' : 'Conservar'}
              </button>
            </div>
          ))}
        </div>

        {needsOrder && (
          <div className="demosles-order">
            <p>¿Cuál va encima del mazo?</p>
            <div className="loc-select-list">
              {keepIds.map(id => {
                const c = state.allCards[id];
                return (
                  <button
                    key={id}
                    className={`loc-select-btn ${topCardId === id ? 'selected' : ''}`}
                    onClick={() => setTopCardId(id)}
                  >
                    {c?.name ?? id}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="modal-footer" style={{ gap: 8 }}>
          <span className="demosles-summary">
            {toDiscard.size > 0 ? `${toDiscard.size} carta(s) se descartarán` : 'Ninguna descartada'}
            {keepIds.length > 0 ? ` · ${keepIds.length} vuelve(n) al mazo` : ''}
          </span>
          <button
            className="action-btn primary"
            disabled={!canConfirm}
            onClick={confirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

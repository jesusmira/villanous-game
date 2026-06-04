import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { GameState } from '../core/types';

interface Props {
  state: GameState;
  onClose: () => void;
}

export function HistoryModal({ state, onClose }: Props) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest entry on open and when log grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [state.log.length]);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-container-highest/95 backdrop-blur-xl border border-outline-variant/30 rounded-2xl shadow-2xl flex flex-col w-full max-w-md max-h-[70vh] pointer-events-auto overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header — sin borde inferior, integrado */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <div className="flex items-baseline gap-2">
            <h2 className="font-serif text-base text-on-surface">Histórico</h2>
            <span className="font-stats text-[10px] text-on-surface-variant/50 uppercase tracking-wider">
              T{state.roundNumber} · {currentPlayer.name}
            </span>
          </div>
          <button onClick={onClose} className="text-on-surface-variant/50 hover:text-on-surface transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable log — últimas jugadas abajo, scroll arriba para ver las antiguas */}
        <div className="history-scroll flex-1 overflow-y-auto px-5 pb-4 pt-1">
          {state.log.length === 0 ? (
            <p className="text-xs text-on-surface-variant/40 italic">Sin movimientos aún</p>
          ) : (
            <div className="flex flex-col gap-1">
              {state.log.map((entry, i) => {
                const isLast = i === state.log.length - 1;
                return (
                  <div
                    key={i}
                    className={`text-[11px] leading-relaxed ${
                      isLast
                        ? 'text-on-surface font-medium'
                        : 'text-on-surface/50'
                    }`}
                  >
                    <span className="text-outline-variant/30 mr-1.5 select-none">›</span>
                    {entry}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import type { GameState } from '../core/types';
import { ModalStage } from './shared/ModalStage';

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
    <ModalStage
      onDismiss={onClose}
      eyebrow={`Ronda ${state.roundNumber} · turno de ${currentPlayer.name}`}
      title="Histórico"
      widthClass="max-w-lg"
      actions={<button onClick={onClose} className="stage-btn stage-btn--secondary">Cerrar</button>}
    >
      {/* Últimas jugadas abajo; desplazar hacia arriba para ver las antiguas. */}
      <div className="history-scroll history-sheet w-full overflow-y-auto">
        {state.log.length === 0 ? (
          <p className="modal-stage-note">Sin movimientos aún</p>
        ) : (
          <div className="flex flex-col gap-1">
            {state.log.map((entry, i) => {
              const isLast = i === state.log.length - 1;
              const isTurn = entry.startsWith('---');
              return (
                <div
                  key={i}
                  className={isTurn
                    ? 'history-turn'
                    : `font-narrative text-[15px] leading-snug ${isLast ? 'text-[#f6dd94]' : 'text-[#efe6d2]/70'}`}
                >
                  {isTurn ? entry.replace(/-/g, '').trim() : <><span className="text-gold/40 mr-1.5 select-none">›</span>{entry}</>}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </ModalStage>
  );
}

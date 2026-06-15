import type { GameState } from '../core/types';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';

interface Props { state: GameState }

export function JaquecaModal({ state }: Props) {
  const doResolveJaqueca = useGameStore(s => s.doResolveJaqueca);
  const { pendingJaqueca } = state;

  if (!pendingJaqueca) return null;

  const { itemInstIds } = pendingJaqueca;
  const items = itemInstIds.map(id => state.allCards[id]).filter(Boolean);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-container-highest/95 border border-error/30 rounded-2xl shadow-2xl flex flex-col gap-5 p-6 w-full max-w-xl">
        <div>
          <h2 className="font-serif text-base text-on-surface">Gran Jaqueca</h2>
          <p className="text-[11px] text-on-surface-variant/70 mt-1 leading-snug">
            Elige qué Objeto descartar del Reino de Garfio:
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-6">
          {items.map(card => (
            <button
              key={card.instId}
              onClick={() => doResolveJaqueca(card.instId)}
              className="flex flex-col items-center gap-2 group focus:outline-none"
              title={`Descartar ${card.name}`}
            >
              <div className="aurora-card-preview-wrap ring-2 ring-transparent group-hover:ring-error/60 group-focus:ring-error rounded-[9px] transition-all">
                <div className="aurora-card-preview">
                  <CardComponent card={card} state={state} />
                </div>
              </div>
              <span className="font-stats text-[9px] uppercase tracking-widest text-error/70 group-hover:text-error transition-colors">
                Descartar
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

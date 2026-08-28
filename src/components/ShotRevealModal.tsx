import type { GameState } from '../core/types';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';

interface Props { state: GameState }

export function ShotRevealModal({ state }: Props) {
  const doResolveShotReveal = useGameStore(s => s.doResolveShotReveal);
  const { pendingShotReveal } = state;

  if (!pendingShotReveal) return null;
  const { revealedInstIds, totalCost, wicketStrength, won } = pendingShotReveal;
  const cards = revealedInstIds.map(id => state.allCards[id]).filter(Boolean);

  return (
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4 pointer-events-none">
      <div className={`bg-surface-container-highest/95 border rounded-2xl shadow-2xl flex flex-col gap-5 p-6 w-full max-w-2xl pointer-events-auto ${
        won ? 'border-secondary-container/50' : 'border-error/40'
      }`}>
        <div>
          <h2 className="font-serif text-base text-on-surface">Efectúa el tiro</h2>
          <p className={`font-stats text-[11px] uppercase tracking-widest mt-1 ${won ? 'text-secondary-container' : 'text-error'}`}>
            {won ? '¡Tiro conseguido! — Victoria' : 'El tiro falla — cartas descartadas'}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {cards.map(card => (
            <CardComponent key={card.instId} card={card} state={state} />
          ))}
        </div>

        <div className="flex items-center justify-center gap-6 text-[11px] font-stats uppercase tracking-widest">
          <span className="text-on-surface-variant">
            Precio total: <span className={won ? 'text-secondary-container' : 'text-error'}>{totalCost}</span>
          </span>
          <span className="text-on-surface-variant/50">vs</span>
          <span className="text-on-surface-variant">
            Fuerza de Postigos: <span className="text-primary">{wicketStrength}</span>
          </span>
        </div>

        <button
          onClick={() => doResolveShotReveal()}
          className="self-center px-6 py-2.5 rounded-xl border-2 border-primary bg-primary/20 hover:bg-primary/30 text-primary font-serif text-sm font-bold uppercase tracking-wider transition-all active:scale-95"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

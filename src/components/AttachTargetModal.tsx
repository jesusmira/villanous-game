import type { CardInstId, GameState } from '../core/types';
import { CardComponent } from './CardComponent';

interface Props {
  state: GameState;
  cardName: string;
  reqTarget: 'ALLY' | 'HERO';
  candidates: CardInstId[];
  onSelect: (targetCardInstId: CardInstId) => void;
  onCancel: () => void;
}

/** Deja elegir a qué Aliado/Héroe se adjunta un Objeto cuando hay más de un candidato válido. */
export function AttachTargetModal({ state, cardName, reqTarget, candidates, onSelect, onCancel }: Props) {
  const label = reqTarget === 'ALLY' ? 'un Aliado' : 'un Héroe';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-110 backdrop-blur-sm">
      <div className="bg-surface-container-highest border border-tertiary/30 rounded-2xl shadow-2xl flex flex-col gap-4 p-5 w-full max-w-md mx-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-base text-on-surface">{cardName}</h2>
            <p className="text-[11px] text-on-surface-variant/70 mt-1 leading-snug">
              Elige {label} objetivo.
            </p>
          </div>
          <button onClick={onCancel} className="text-on-surface-variant/40 hover:text-on-surface transition-colors text-lg leading-none">×</button>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          {candidates.map(id => {
            const card = state.allCards[id];
            if (!card) return null;
            return (
              <div
                key={id}
                onClick={() => onSelect(id)}
                className="cursor-pointer transition-all rounded-xl opacity-80 hover:opacity-100 hover:scale-105"
              >
                <CardComponent card={card} state={state} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

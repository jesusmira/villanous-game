import { useState } from 'react';
import type { GameState } from '../core/types';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';

interface Props { state: GameState }

export function WicketPickModal({ state }: Props) {
  const doResolveWicketPick = useGameStore(s => s.doResolveWicketPick);
  const { pendingWicketPick } = state;
  const [selected, setSelected] = useState<string[]>([]);

  if (!pendingWicketPick) return null;
  const { eligibleInstIds, max, kind } = pendingWicketPick;
  const cards = eligibleInstIds.map(id => state.allCards[id]).filter(Boolean);
  const title = kind === 'TO_WICKET' ? 'Por orden de la Reina' : 'Gato Risón';
  const verb = kind === 'TO_WICKET' ? 'convertir en Postigo' : 'convertir en Soldado Naipe';

  function toggle(instId: string) {
    setSelected(prev => {
      if (prev.includes(instId)) return prev.filter(id => id !== instId);
      if (prev.length >= max) return prev;
      return [...prev, instId];
    });
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-surface-container-highest/95 border border-primary/30 rounded-2xl shadow-2xl flex flex-col gap-5 p-6 w-full max-w-3xl pointer-events-auto">
        <div>
          <h2 className="font-serif text-base text-on-surface">{title}</h2>
          <p className="text-[11px] text-on-surface-variant/70 mt-1 leading-snug">
            Elige hasta {max} carta(s) para {verb} ({selected.length}/{max}):
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          {cards.map(card => (
            <CardComponent
              key={card.instId}
              card={card}
              state={state}
              selected={selected.includes(card.instId)}
              onClick={() => toggle(card.instId)}
            />
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={() => doResolveWicketPick(selected)}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-stats uppercase tracking-widest"
          >
            Confirmar ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}

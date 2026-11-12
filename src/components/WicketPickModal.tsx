import { useState } from 'react';
import type { GameState } from '../core/types';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';
import { ModalStage } from './shared/ModalStage';

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
    <ModalStage
      passThrough
      eyebrow={title}
      title={`Elige hasta ${max} carta${max !== 1 ? 's' : ''}`}
      subtitle={`Para ${verb} · ${selected.length}/${max} elegida${selected.length !== 1 ? 's' : ''}`}
      actions={
        <button onClick={() => doResolveWicketPick(selected)} className="stage-btn stage-btn--primary">
          Confirmar ({selected.length})
        </button>
      }
    >
      <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
        {cards.map(card => (
          <button key={card.instId} onClick={() => toggle(card.instId)}
            className={`stage-pick ${selected.includes(card.instId) ? 'is-chosen' : ''}`}>
            <CardComponent card={card} state={state} selected={selected.includes(card.instId)} sizeClassName="card-size-stage" />
          </button>
        ))}
      </div>
    </ModalStage>
  );
}

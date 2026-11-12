import { useState } from 'react';
import type { GameState } from '../core/types';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';
import { ModalStage } from './shared/ModalStage';

interface Props { state: GameState }

export function ShrinkPickModal({ state }: Props) {
  const doResolveShrinkPick = useGameStore(s => s.doResolveShrinkPick);
  const { pendingShrinkPick } = state;
  const [selected, setSelected] = useState<string[]>([]);

  if (!pendingShrinkPick) return null;
  const { eligibleHeroInstIds, max } = pendingShrinkPick;
  const cards = eligibleHeroInstIds.map(id => state.allCards[id]).filter(Boolean);

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
      tone="fate"
      eyebrow="Furia"
      title={`Mengua hasta ${max} Héroe${max !== 1 ? 's' : ''}`}
      subtitle={`Héroes del rival · ${selected.length}/${max} elegido${selected.length !== 1 ? 's' : ''}`}
      actions={
        <button onClick={() => doResolveShrinkPick(selected)} className="stage-btn stage-btn--primary">
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

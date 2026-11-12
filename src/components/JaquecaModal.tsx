import type { GameState } from '../core/types';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';
import { ModalStage } from './shared/ModalStage';

interface Props { state: GameState }

export function JaquecaModal({ state }: Props) {
  const doResolveJaqueca = useGameStore(s => s.doResolveJaqueca);
  const { pendingJaqueca } = state;

  if (!pendingJaqueca) return null;

  const { itemInstIds } = pendingJaqueca;
  const items = itemInstIds.map(id => state.allCards[id]).filter(Boolean);

  return (
    <ModalStage
      passThrough
      tone="fate"
      eyebrow="Gran Jaqueca"
      title="Elige qué Objeto descartar"
      subtitle="Se descartará del Reino de Garfio."
    >
      <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
        {items.map(card => (
          <button key={card.instId} onClick={() => doResolveJaqueca(card.instId)}
            className="stage-pick is-danger" title={`Descartar ${card.name}`}>
            <CardComponent card={card} state={state} sizeClassName="card-size-stage" />
            <span className="stage-pick-caption">Descartar</span>
          </button>
        ))}
      </div>
    </ModalStage>
  );
}

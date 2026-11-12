import type { GameState } from '../core/types';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';
import { ModalStage } from './shared/ModalStage';

interface Props { state: GameState }

export function ShotRevealModal({ state }: Props) {
  const doResolveShotReveal = useGameStore(s => s.doResolveShotReveal);
  const { pendingShotReveal } = state;

  if (!pendingShotReveal) return null;
  const { revealedInstIds, totalCost, wicketStrength, won } = pendingShotReveal;
  const cards = revealedInstIds.map(id => state.allCards[id]).filter(Boolean);

  return (
    <ModalStage
      zClass="z-110"
      tone={won ? 'gold' : 'fate'}
      eyebrow="Efectúa el tiro"
      title={won ? '¡Tiro conseguido!' : 'El tiro falla'}
      subtitle={won ? 'La Reina de Corazones gana la partida.' : 'Las cartas reveladas se descartan.'}
      actions={
        <button onClick={() => doResolveShotReveal()} className="stage-btn stage-btn--primary">Continuar</button>
      }
    >
      <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
        {cards.map(card => (
          <CardComponent key={card.instId} card={card} state={state} sizeClassName="card-size-stage" />
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 sm:gap-6">
        <span className="stage-stat">Precio total <b className={won ? 'text-gold-bright' : 'text-[#ff9c90]'}>{totalCost}</b></span>
        <span className="modal-stage-label">vs</span>
        <span className="stage-stat">Fuerza de Postigos <b className="text-gold-bright">{wicketStrength}</b></span>
      </div>
    </ModalStage>
  );
}

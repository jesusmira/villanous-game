import type { GameState, PlayerState } from '../core/types';
import { CardComponent } from './CardComponent';
import { ModalStage } from './shared/ModalStage';

interface Props {
  state: GameState;
  victim: PlayerState;
  onClose: () => void;
}

export function FloraRevealModal({ state, victim, onClose }: Props) {
  const handCards = victim.handInstIds.map(id => state.allCards[id]).filter(Boolean);

  return (
    <ModalStage
      onDismiss={onClose}
      tone="fate"
      eyebrow="Flora · mano revelada"
      title={`Mano de ${victim.name}`}
      subtitle={`${handCards.length} carta${handCards.length !== 1 ? 's' : ''}`}
      widthClass="max-w-5xl"
      actions={<button onClick={onClose} className="btn btn--secondary">Cerrar</button>}
    >
      {handCards.length === 0 ? (
        <p className="modal-stage-note">La mano está vacía.</p>
      ) : (
        <div className="flex flex-wrap justify-center gap-3 sm:gap-5">
          {handCards.map(card => (
            <CardComponent key={card.instId} card={card} state={state} sizeClassName="card-size-stage" />
          ))}
        </div>
      )}
    </ModalStage>
  );
}

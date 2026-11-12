import type { CardInstId, GameState } from '../core/types';
import { CardComponent } from './CardComponent';
import { ModalStage } from './shared/ModalStage';

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
    <ModalStage
      zClass="z-110"
      onDismiss={onCancel}
      eyebrow={cardName}
      title={`Elige ${label}`}
      subtitle={`${cardName} se unirá a la carta que elijas.`}
      actions={<button onClick={onCancel} className="stage-btn stage-btn--secondary">Cancelar</button>}
    >
      <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
        {candidates.map(id => {
          const card = state.allCards[id];
          if (!card) return null;
          return (
            <button key={id} onClick={() => onSelect(id)} className="stage-pick">
              <CardComponent card={card} state={state} sizeClassName="card-size-stage" />
            </button>
          );
        })}
      </div>
    </ModalStage>
  );
}

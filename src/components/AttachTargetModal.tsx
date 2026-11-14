import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
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
  /** Texto bajo el título; por defecto, el de unir un Objeto. */
  subtitle?: string;
}

/**
 * Deja elegir el Aliado/Héroe objetivo cuando hay más de un candidato válido (unir un Objeto,
 * Mome Raths…). Como en la Acción Destino, "Ver tablero" oculta el modal y deja una pastilla
 * arriba con "Ver cartas" para volver.
 */
export function AttachTargetModal({ state, cardName, reqTarget, candidates, onSelect, onCancel, subtitle }: Props) {
  const [hidden, setHidden] = useState(false);
  const label = reqTarget === 'ALLY' ? 'un Aliado' : 'un Héroe';

  if (hidden) {
    return (
      <div className="fate-pill">
        <span className="font-serif text-sm font-semibold text-[#ffc2b8]">{cardName}</span>
        <span className="font-narrative italic text-sm text-[#efe6d2]/80">Elige {label}</span>
        <button onClick={() => setHidden(false)} className="btn btn--secondary btn--sm shrink-0">
          <Eye className="w-3.5 h-3.5" /> Ver cartas
        </button>
      </div>
    );
  }

  return (
    <ModalStage
      zClass="z-110"
      onDismiss={onCancel}
      eyebrow={cardName}
      title={`Elige ${label}`}
      subtitle={subtitle ?? `${cardName} se unirá a la carta que elijas.`}
      actions={<>
        <button onClick={() => setHidden(true)} className="btn btn--secondary btn--sm">
          <EyeOff className="w-3.5 h-3.5" /> Ver tablero
        </button>
        <button onClick={onCancel} className="btn btn--secondary">Cancelar</button>
      </>}
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

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { CardInstId, GameState, LocationId, PlayerState } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { ModalStage } from './shared/ModalStage';

interface Props {
  state: GameState;
  /** Carta de Destino jugada (p. ej. Mome Raths). */
  fateCardId: CardInstId;
  /** Carta ya elegida que se va a mover. */
  targetCardInstId: CardInstId;
  /** Dueño del Reino donde se mueve (el rival objetivo de la Acción Destino). */
  owner: PlayerState;
  onSelect: (locationId: LocationId) => void;
  onCancel: () => void;
}

/**
 * Segundo paso de las cartas de Destino con `targetCardThenDestination` (Mome Raths): elegida la
 * carta, se elige ADÓNDE moverla — cualquier ubicación no bloqueada del Reino salvo la actual.
 * Como en la Acción Destino, "Ver tablero" oculta el modal y deja una pastilla para volver.
 */
export function FateMoveDestModal({ state, fateCardId, targetCardInstId, owner, onSelect, onCancel }: Props) {
  const [hidden, setHidden] = useState(false);
  const fateName = state.allCards[fateCardId]?.name ?? '';
  const target   = state.allCards[targetCardInstId];
  const destinations = getPlugin(owner.villainId).locations
    .filter(l => l.id !== target?.locationId && !owner.locationStates[l.id]?.isLocked);

  if (hidden) {
    return (
      <div className="fate-pill">
        <span className="font-serif text-sm font-semibold text-[#ffc2b8]">{fateName}</span>
        <span className="font-narrative italic text-sm text-[#efe6d2]/80">
          ¿Adónde mueves {target?.name ?? 'la carta'}?
        </span>
        <button onClick={() => setHidden(false)} className="btn btn--secondary btn--sm shrink-0">
          <Eye className="w-3.5 h-3.5" /> Ver destinos
        </button>
      </div>
    );
  }

  return (
    <ModalStage
      zClass="z-110"
      onDismiss={onCancel}
      eyebrow={fateName}
      title="¿Adónde lo mueves?"
      subtitle={target
        ? <>Mueve <b className="not-italic text-gold-bright">{target.name}</b> a cualquier ubicación del Reino de {owner.name}.</>
        : undefined}
      widthClass="max-w-lg"
      actions={<>
        <button onClick={() => setHidden(true)} className="btn btn--secondary btn--sm">
          <EyeOff className="w-3.5 h-3.5" /> Ver tablero
        </button>
        <button onClick={onCancel} className="btn btn--secondary">Cancelar</button>
      </>}
    >
      <div className="flex flex-wrap justify-center gap-2">
        {destinations.map(l => (
          <button key={l.id} className="chip" onClick={() => onSelect(l.id)}>{l.name}</button>
        ))}
      </div>
    </ModalStage>
  );
}

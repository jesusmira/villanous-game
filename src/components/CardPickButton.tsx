import type { CardInst, GameState } from '../core/types';
import { CardComponent } from './CardComponent';

interface Props {
  card: CardInst;
  state: GameState;
  selected?: boolean;
  disabled?: boolean;
  /** Texto corto bajo la carta (coste, fuerza, ubicación…) — la imagen ya lleva el nombre. */
  caption?: string;
  onClick: () => void;
}

/** Botón de elegir carta para modales de selección: la imagen sustituye al nombre en texto plano. */
export function CardPickButton({ card, state, selected, disabled, caption, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`stage-pick ${selected ? 'is-chosen' : ''}`}
    >
      <CardComponent card={card} state={state} selected={selected} sizeClassName="card-size-stage" />
      {caption && <span className="stage-pick-caption">{caption}</span>}
    </button>
  );
}

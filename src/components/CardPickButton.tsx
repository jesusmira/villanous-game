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
      className={`flex flex-col items-center gap-1 rounded-xl transition-all active:scale-95 ${
        disabled ? 'opacity-35 cursor-not-allowed'
          : selected ? 'ring-2 ring-primary scale-105' : 'opacity-80 hover:opacity-100 hover:scale-105'
      }`}
    >
      <CardComponent card={card} state={state} selected={selected} />
      {caption && (
        <span className="font-stats text-[9px] text-on-surface-variant/70 text-center leading-tight">{caption}</span>
      )}
    </button>
  );
}

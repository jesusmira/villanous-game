import type { CardInst, GameState } from '../core/types';
import { CardComponent } from './CardComponent';
import { DragSource } from '../hooks/DragProvider';

interface Props {
  state: GameState;
  cards: CardInst[];
  /** Carta elegida para jugar (las ubicaciones válidas se iluminan en el tablero). */
  selectedCardId: string | null;
  /** Carta que se está arrastrando ahora mismo hacia una ubicación. */
  dragCardId: string | null;
  /** Cartas que se pueden jugar ahora mismo en alguna ubicación (brillo de "jugable"). */
  playableIds: ReadonlySet<string>;
  /** Flora (Maléfica): la mano está al descubierto para el rival. */
  revealed?: boolean;
  /** Clic en una carta fuera del modo Descartar: abre el Modo Enfoque. */
  onInspect: (card: CardInst) => void;
  /** Arrastre directo a una ubicación (solo puntero fino). */
  dragEnabled: boolean;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
  /** Modo Descartar: las cartas suben del todo y pasan a ser una selección múltiple. */
  discardMode: boolean;
  discardIds: string[];
  onToggleDiscard: (cardId: string) => void;
}

/**
 * Mano en abanico anclada al borde inferior (estilo juego de cartas digital): las cartas
 * asoman hasta media altura para no robar espacio al tablero, y al pasar el ratón la carta
 * se endereza y sube entera. Sin bandeja ni barra: el tablero se ve por detrás y a los lados.
 * Geometría en CSS (.hand-fan*): aquí solo se reparten --fan (posición respecto al centro)
 * y --fan-step (giro entre cartas, menor cuantas más cartas haya).
 */
export function HandFan({
  state, cards, selectedCardId, dragCardId, playableIds, revealed,
  onInspect, dragEnabled, onDragStart, onDragEnd,
  discardMode, discardIds, onToggleDiscard,
}: Props) {
  const mid  = (cards.length - 1) / 2;
  const step = cards.length > 1 ? Math.min(6, 28 / (cards.length - 1)) : 0;

  return (
    <section
      className={`hand-fan ${discardMode ? 'is-raised' : ''} ${dragCardId ? 'is-dragging' : ''}`}
      style={{ '--fan-step': `${step}deg` }}
      aria-label={`Tu mano: ${cards.length} carta${cards.length !== 1 ? 's' : ''}`}
    >
      {revealed && (
        <span className="hand-fan-badge" title="Flora: tu rival ve tu mano">Mano visible</span>
      )}
      {cards.map((card, i) => {
        const isMarked   = discardMode && discardIds.includes(card.instId);
        const isSelected = !discardMode && selectedCardId === card.instId;
        const isPlayable = !discardMode && !isSelected && playableIds.has(card.instId);
        return (
          <DragSource
            key={card.instId}
            disabled={discardMode || !dragEnabled}
            // La copia que sigue al puntero se toma de la carta tal como se ve (subida y crecida),
            // no del hueco en reposo: si no, al empezar a arrastrar saltaba media carta hacia abajo.
            ghostSelector=".villainous-card"
            onStart={() => onDragStart(card.instId)}
            onEnd={onDragEnd}
            onClick={() => (discardMode ? onToggleDiscard(card.instId) : onInspect(card))}
            className={`hand-fan-slot ${isSelected ? 'is-selected' : ''} ${isPlayable ? 'is-playable' : ''} ${isMarked ? 'is-marked' : ''} ${dragCardId === card.instId ? 'is-dragging' : ''} ${dragEnabled && !discardMode ? 'cursor-grab active:cursor-grabbing touch-none select-none' : 'cursor-pointer'}`}
            style={{ '--fan': i - mid, zIndex: isSelected ? 60 : 10 + i }}
          >
            {/* Solo este envoltorio se mueve al pasar el ratón; el slot (zona sensible) queda fijo. */}
            <div className="hand-fan-card relative">
              <CardComponent card={card} state={state} selected={isSelected} sizeClassName="card-size-fan" inspectable />
              {discardMode && (
                <span className={`absolute top-2 left-2 z-70 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] font-bold ${
                  isMarked ? 'border-error bg-error text-white' : 'border-white/60 bg-black/55 text-white/70'
                }`}>
                  {isMarked ? '✕' : ''}
                </span>
              )}
            </div>
          </DragSource>
        );
      })}
    </section>
  );
}

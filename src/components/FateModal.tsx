import { useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { CardType } from '../core/types';
import type { GameState } from '../core/types';
import { getCardDef, getEffectDef } from '../core/villains/registry';
import { CardComponent } from './CardComponent';

// En táctil no hay arrastre: el toque elige y el segundo toque (en la ubicación) coloca.
const IS_COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

interface Props {
  state: GameState;
  onFateDragStart?: (cardId: string) => void;
  onFateDragEnd?: () => void;
  /** Notifica la carta elegida (o null al cancelar): activa el resaltado y el clic/toque en ubicación. */
  onFateSelect?: (cardId: string | null) => void;
}

/**
 * Acción Destino, mismo flujo en escritorio y móvil (estilo "Descubrir"):
 *  1. Elegir: las cartas reveladas aparecen grandes y centradas, con su texto legible debajo.
 *     Clic/toque = elegir. En escritorio también se pueden arrastrar: al empezar el arrastre el
 *     panel se oculta para ver el tablero del rival.
 *  2. Colocar: el panel se reduce a una pastilla arriba; el tablero del rival se desplaza a la
 *     vista con sus ubicaciones válidas iluminadas y un clic/toque en una resuelve la carta.
 */
export function FateModal({ state, onFateDragStart, onFateDragEnd, onFateSelect }: Props) {
  const { pendingFate } = state;
  const [chosenId, setChosenId]       = useState<string | null>(null);
  const [cardsHidden, setCardsHidden] = useState(false);
  const [dragging, setDragging]       = useState(false);

  if (!pendingFate) return null;

  const targetPlayer    = state.players[pendingFate.targetPlayerIndex];
  const revealedCards   = pendingFate.revealedInstIds.map(id => state.allCards[id]).filter(Boolean);
  const autoPlayedCards = (pendingFate.autoPlayedInstIds ?? []).map(id => state.allCards[id]).filter(Boolean);
  const chosenCard      = chosenId ? state.allCards[chosenId] : null;

  const reqTarget = chosenCard?.effectIds.map(id => getEffectDef(id)?.requiresTargetCard).find(Boolean) ?? null;
  // Mirar si la carta declara un objetivo, no su cardType: Robar a los Ricos es EFFECT y aun así
  // necesita un Héroe (requiresTargetCard: 'HERO').
  const needsCardTarget = reqTarget === 'ALLY' || reqTarget === 'HERO';
  const hasAnyTarget = (reqTarget && reqTarget !== 'CURSE')
    ? Object.values(state.allCards).some(c =>
        c.ownerId === targetPlayer.id &&
        c.cardType === (reqTarget === 'ALLY' ? CardType.ALLY : CardType.HERO) &&
        !!c.locationId)
    : true;

  const scrollToTarget = () => {
    document.querySelector(`[data-player-board="${targetPlayer.id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const choose = (cardId: string) => {
    setChosenId(cardId);
    onFateSelect?.(cardId);
    scrollToTarget();
  };
  const cancel = () => { setChosenId(null); onFateSelect?.(null); };

  // ── Paso 2: carta elegida → pastilla arriba, se coloca tocando una ubicación ──
  if (chosenCard && !dragging) {
    return (
      <div className="fate-pill">
        <div className="shrink-0">
          <CardComponent card={chosenCard} state={state} sizeClassName="card-size-fate-thumb" />
        </div>
        <div className="min-w-0 flex flex-col">
          <span className="font-serif text-sm font-semibold text-[#ffc2b8] truncate">{chosenCard.name}</span>
          <span className="font-narrative italic text-sm text-[#efe6d2]/85 leading-tight">
            {!hasAnyTarget
              ? `Sin ${reqTarget === 'ALLY' ? 'Aliados' : 'Héroes'}: elige cualquier ubicación de ${targetPlayer.name}`
              : needsCardTarget
                ? `Elige la ubicación iluminada de ${targetPlayer.name}`
                : `Elige una ubicación de ${targetPlayer.name}`}
          </span>
        </div>
        <button onClick={cancel} className="fate-pill-btn shrink-0" title="Elegir otra carta">
          <X className="w-3.5 h-3.5" /> Cambiar
        </button>
      </div>
    );
  }

  // ── Paso 1 oculto: solo un recordatorio para volver a mostrar las cartas ──
  if (cardsHidden && !dragging) {
    return (
      <div className="fate-pill">
        <span className="font-serif text-sm font-semibold text-[#ffc2b8]">Acción Destino</span>
        <span className="font-narrative italic text-sm text-[#efe6d2]/80">
          {revealedCards.length} carta{revealedCards.length !== 1 ? 's' : ''} contra {targetPlayer.name}
        </span>
        <button onClick={() => setCardsHidden(false)} className="fate-pill-btn shrink-0">
          <Eye className="w-3.5 h-3.5" /> Ver cartas
        </button>
      </div>
    );
  }

  // ── Paso 1: elegir carta ──
  // Durante un arrastre el panel sigue montado (es el origen del arrastre) pero invisible,
  // para que se vea el tablero del rival donde soltar la carta.
  return (
    <div className={`fixed inset-x-0 bottom-0 top-12 z-95 flex items-center justify-center p-3 sm:p-6 transition-opacity duration-200 ${dragging ? 'opacity-0 pointer-events-none' : ''}`}>
      <div className="card-focus-backdrop absolute inset-0" />
      <div className="card-focus-enter relative flex flex-col items-center gap-3 sm:gap-5 max-h-full overflow-y-auto scrollbar-hide">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="font-stats text-[10px] font-semibold uppercase tracking-[0.3em] text-[#ff9c90]/80">
            Acción Destino contra {targetPlayer.name}
          </span>
          <h2 className="font-serif text-lg sm:text-2xl font-bold tracking-[0.06em] text-[#f6dd94]"
            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>
            Elige una carta
          </h2>
        </div>

        <div className="flex flex-wrap items-start justify-center gap-4 sm:gap-8">
          {revealedCards.map(card => {
            const description = getCardDef(card.defId)?.description;
            return (
              <div key={card.instId} className="fate-choice flex flex-col items-center gap-2">
                <button onClick={() => choose(card.instId)} className="fate-choice-card" aria-label={`Elegir ${card.name}`}>
                  <CardComponent
                    card={card}
                    state={state}
                    sizeClassName="card-size-fate"
                    // Arrastre directo a una ubicación del rival (ratón): el panel se oculta mientras.
                    draggable={!IS_COARSE_POINTER}
                    onDragStart={() => {
                      setChosenId(card.instId);
                      setDragging(true);
                      onFateDragStart?.(card.instId);
                    }}
                    onDragEnd={() => {
                      // Si se soltó fuera de una ubicación válida, se vuelve a elegir.
                      setDragging(false);
                      setChosenId(null);
                      onFateDragEnd?.();
                    }}
                  />
                </button>
                {description && (
                  <p className="fate-choice-text font-narrative text-[13px] sm:text-[15px] leading-snug text-[#efe6d2] text-center">
                    {description}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {autoPlayedCards.length > 0 && (
          <p className="font-narrative italic text-sm text-on-surface-variant/70 text-center">
            Ya resuelta{autoPlayedCards.length !== 1 ? 's' : ''} automáticamente: {autoPlayedCards.map(c => c.name).join(', ')}
          </p>
        )}

        <button onClick={() => setCardsHidden(true)} className="fate-pill-btn">
          <EyeOff className="w-3.5 h-3.5" /> Ver tablero
        </button>
      </div>
    </div>
  );
}

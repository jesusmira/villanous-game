import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { CardType } from '../core/types';
import type { GameState, LocationId, CardInstId } from '../core/types';
import { getEffectDef } from '../core/villains/registry';
import { useGameStore as _useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';

interface Props {
  state: GameState;
  onFateDragStart?: (cardId: string) => void;
  onFateDragEnd?: () => void;
  /** Móvil: notifica la carta elegida (o null al cancelar) para activar el tap-en-ubicación */
  onFateSelect?: (cardId: string | null) => void;
}

export function FateModal({ state, onFateDragStart, onFateDragEnd, onFateSelect }: Props) {
  const { pendingFate } = state;
  const [chosenId,      setChosenId]     = useState<string | null>(null);
  const [_targetLocId,   setTargetLocId]  = useState<LocationId | null>(null);
  const [_targetCardId,  setTargetCardId] = useState<CardInstId | null>(null);
  const [hoveredFateId, setHoveredFateId] = useState<string | null>(null);
  // Móvil, paso 1 (elegir carta): el panel tapa el tablero entero — permite ocultarlo
  // temporalmente para ver las ubicaciones antes de decidir qué carta jugar, sin tener que
  // comprometerse ya a una elección (el paso 2 ya se reduce solo a una barra fina).
  const [cardsHidden, setCardsHidden]   = useState(false);

  if (!pendingFate) return null;

  const targetPlayer   = state.players[pendingFate.targetPlayerIndex];
  const revealedCards  = pendingFate.revealedInstIds.map(id => state.allCards[id]).filter(Boolean);
  const autoPlayedCards = (pendingFate.autoPlayedInstIds ?? []).map(id => state.allCards[id]).filter(Boolean);
  const chosenCard     = chosenId ? state.allCards[chosenId] : null;

  const reqTarget = chosenCard?.effectIds.map(id => getEffectDef(id)?.requiresTargetCard).find(Boolean) ?? null;
  // OJO: antes se asumía que ninguna carta EFFECT necesita elegir Héroe/Aliado objetivo, así que
  // se saltaba siempre el aviso de "toca una ubicación de X" — pero cartas como Robar a los Ricos
  // SÍ lo necesitan (requiresTargetCard: 'HERO') aunque sean EFFECT, no ITEM. Lo correcto es
  // mirar si la carta declara un target, no su cardType.
  const needsCardTarget = reqTarget === 'ALLY' || reqTarget === 'HERO';

  const hasAnyTarget = (reqTarget && reqTarget !== 'CURSE')
    ? Object.values(state.allCards).some(c =>
        c.ownerId === targetPlayer.id &&
        c.cardType === (reqTarget === 'ALLY' ? CardType.ALLY : CardType.HERO) &&
        !!c.locationId)
    : true;

  // Desktop: puro drag & drop, sin selección manual
  // Mobile: requiere selección de ubicación

  return (
    <>
    {/* ════════ DESKTOP (lg+) — sin cambios respecto al original ════════ */}
    <div className="hidden lg:block fixed top-12 inset-x-0 z-50 bg-surface-container-highest/97 backdrop-blur-xl border-b border-error/30 shadow-2xl animate-slide-down overflow-visible">

      <div className="max-w-375 mx-auto px-4 py-3 flex flex-col gap-3 overflow-visible">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="font-serif text-sm font-bold text-error">Acción Destino</span>
            <span className="text-on-surface-variant/60 text-[11px] ml-2">
              contra <strong className="text-on-surface">{targetPlayer.name}</strong>
              {' '}· Arrastra una carta al tablero
            </span>
          </div>
        </div>

        {/* Cards — fila horizontal, arrastrables al tablero */}
        <div className="flex gap-3 overflow-x-auto overflow-y-visible pb-1" style={{ overflowY: 'visible' }}>
          {autoPlayedCards.map(card => (
            <div key={card.instId} className="opacity-40 pointer-events-none shrink-0">
              <CardComponent card={card} state={state} />
            </div>
          ))}
          {revealedCards.map(card => {
            const isChosen = chosenId === card.instId;
            return (
              <div
                key={card.instId}
                onMouseEnter={() => setHoveredFateId(card.instId)}
                onMouseLeave={() => setHoveredFateId(null)}
                onClick={() => { setChosenId(card.instId); setTargetLocId(null); setTargetCardId(null); }}
                onDragStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  return false;
                }}
                className={`shrink-0 cursor-grab active:cursor-grabbing select-none transition-all rounded-xl ${
                  isChosen ? 'ring-2 ring-tertiary scale-105' : 'opacity-75 hover:opacity-100 hover:scale-105'
                }`}
              >
                <CardComponent
                  card={card}
                  state={state}
                  selected={isChosen}
                  draggable
                  onDragStart={() => {
                    setChosenId(card.instId);
                    setHoveredFateId(null);
                    onFateDragStart?.(card.instId);
                  }}
                  onDragEnd={() => onFateDragEnd?.()}
                />
              </div>
            );
          })}
        </div>


        {/* En desktop: puro drag & drop, sin UI de selección. Se resuelve automáticamente al soltar. */}
      </div>
    </div>

    {/* Preview carta al hover — solo desktop */}
    {hoveredFateId && (() => {
      const hc = state.allCards[hoveredFateId];
      if (!hc) return null;
      return (
        <div className="hidden lg:block fixed left-1/2 -translate-x-1/2 z-49 pointer-events-none" style={{ top: '18rem' }}>
          <div className="villainous-card-preview-wrap">
            <div className="villainous-card-preview">
              <CardComponent card={hc} state={state} />
            </div>
          </div>
        </div>
      );
    })()}

    {/* ════════ MÓVIL/TABLET (<lg) — flujo tipo mano ════════ */}
    {/* Paso 1: elegir carta (panel arriba con cartas centradas/escaladas). Se puede ocultar
        temporalmente (botón "Ver ubicaciones") para consultar el tablero sin perder las
        cartas reveladas ni tener que elegir una todavía. */}
    {!chosenId && cardsHidden && (
      <div className="lg:hidden fixed top-12 inset-x-0 z-50 bg-surface-container-highest/97 backdrop-blur-xl border-b border-error/30 shadow-xl px-4 py-2 flex items-center gap-3">
        <span className="flex-1 min-w-0 font-stats text-[11px] uppercase tracking-wider text-on-surface-variant/80 truncate">
          Cartas ocultas · consulta el tablero
        </span>
        <button
          onClick={() => setCardsHidden(false)}
          className="shrink-0 flex items-center gap-1.5 font-stats text-[11px] uppercase tracking-wider text-primary hover:text-primary/80 px-3 py-1 rounded border border-primary/40 active:scale-95 transition-transform"
        >
          <Eye className="w-3.5 h-3.5" />
          Ver cartas
        </button>
      </div>
    )}
    {!chosenId && !cardsHidden && (
      <div className="lg:hidden fixed top-12 inset-x-0 bottom-0 z-50 bg-surface-container-highest/97 backdrop-blur-xl border-b border-error/30 shadow-2xl animate-slide-down flex flex-col">
        <div className="px-4 py-2 shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-serif text-sm font-bold text-error shrink-0">Acción Destino</span>
            <span className="text-on-surface-variant/60 text-[11px] truncate">
              contra <strong className="text-on-surface">{targetPlayer.name}</strong> · elige una carta
            </span>
          </div>
          <button
            onClick={() => setCardsHidden(true)}
            className="shrink-0 flex items-center gap-1.5 font-stats text-[10px] uppercase tracking-wider text-on-surface-variant/70 hover:text-on-surface px-2.5 py-1 rounded border border-outline-variant/40 active:scale-95 transition-transform"
            title="Ocultar cartas y ver el tablero"
          >
            <EyeOff className="w-3.5 h-3.5" />
            Ocultar
          </button>
        </div>
        <div className="flex-1 flex items-center overflow-x-auto overflow-y-hidden">
          <div className="flex items-center gap-5 w-max max-w-full mx-auto px-6 py-4">
            {autoPlayedCards.map(card => (
              <div key={card.instId} className="opacity-40 pointer-events-none shrink-0">
                <CardComponent card={card} state={state} sizeClassName="card-size-hand" />
              </div>
            ))}
            {revealedCards.map(card => (
              <div
                key={card.instId}
                onClick={() => { setChosenId(card.instId); setTargetLocId(null); setTargetCardId(null); onFateSelect?.(card.instId); }}
                className="relative shrink-0 cursor-pointer select-none transition-transform active:scale-95"
              >
                <CardComponent card={card} state={state} sizeClassName="card-size-hand" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* Paso 2: carta elegida → barra fina; tocar ubicación del rival la coloca */}
    {chosenId && (
      <div className="lg:hidden fixed top-12 inset-x-0 z-50 bg-surface-container-highest/97 backdrop-blur-xl border-b border-error/30 shadow-xl px-4 py-2 flex items-center gap-3">
        {!needsCardTarget || !hasAnyTarget ? (
          /* No requiere elegir Héroe/Aliado, o no hay ninguno disponible: cualquier ubicación vale */
          <span className="flex-1 min-w-0 font-stats text-[11px] uppercase tracking-wider text-on-surface-variant/80 truncate">
            {!hasAnyTarget
              ? `Sin ${reqTarget === 'ALLY' ? 'Aliados' : 'Héroes'} — toca cualquier ubicación`
              : 'Toca cualquier ubicación de ' + targetPlayer.name}
          </span>
        ) : (
          <span className="flex-1 min-w-0 font-stats text-[11px] uppercase tracking-wider text-error truncate">
            Toca una ubicación de {targetPlayer.name}
          </span>
        )}
        <button
          onClick={() => { setChosenId(null); setTargetLocId(null); setTargetCardId(null); onFateSelect?.(null); }}
          className="shrink-0 font-stats text-[11px] uppercase tracking-wider text-on-surface-variant/70 hover:text-on-surface px-3 py-1 rounded border border-outline-variant/40 active:scale-95 transition-transform"
        >
          Cancelar
        </button>
      </div>
    )}
    </>
  );
}

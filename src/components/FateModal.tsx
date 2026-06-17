import { useState } from 'react';
import { CardType } from '../core/types';
import type { GameState, LocationId, CardInstId, CardInst } from '../core/types';
import { getPlugin, getEffectDef } from '../core/villains/registry';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';
import { modalStyles } from '../styles/modalStyles';

const BTN = modalStyles.buttonPrimary;

interface Props {
  state: GameState;
  onFateDragStart?: (cardId: string) => void;
  onFateDragEnd?: () => void;
  onCardDetail?: (card: CardInst) => void;
  /** Móvil: notifica la carta elegida (o null al cancelar) para activar el tap-en-ubicación */
  onFateSelect?: (cardId: string | null) => void;
}

export function FateModal({ state, onFateDragStart, onFateDragEnd, onCardDetail, onFateSelect }: Props) {
  const doFateResolve = useGameStore(s => s.doFateResolve);
  const { pendingFate } = state;
  const [chosenId,      setChosenId]     = useState<string | null>(null);
  const [targetLocId,   setTargetLocId]  = useState<LocationId | null>(null);
  const [targetCardId,  setTargetCardId] = useState<CardInstId | null>(null);
  const [hoveredFateId, setHoveredFateId] = useState<string | null>(null);

  if (!pendingFate) return null;

  const targetPlayer   = state.players[pendingFate.targetPlayerIndex];
  const targetPlugin   = getPlugin(targetPlayer.villainId);
  const revealedCards  = pendingFate.revealedInstIds.map(id => state.allCards[id]).filter(Boolean);
  const autoPlayedCards = (pendingFate.autoPlayedInstIds ?? []).map(id => state.allCards[id]).filter(Boolean);
  const chosenCard     = chosenId ? state.allCards[chosenId] : null;

  const allLocs = targetPlugin.locations.filter(
    l => !targetPlayer.locationStates[l.id]?.isLocked,
  );

  const reqTarget = chosenCard?.effectIds.map(id => getEffectDef(id)?.requiresTargetCard).find(Boolean) ?? null;
  // Las cartas EFFECT (p. ej. Robar a los Ricos) no se juegan "en" una ubicación — su target
  // puede ser cualquier Héroe/Aliado del Reino, no solo los de la ubicación elegida.
  const isEffectCard = chosenCard?.cardType === CardType.EFFECT;
  const targetsAtLoc = (reqTarget && reqTarget !== 'CURSE' && (targetLocId || isEffectCard))
    ? Object.values(state.allCards).filter(c =>
        c.ownerId === targetPlayer.id &&
        c.cardType === (reqTarget === 'ALLY' ? CardType.ALLY : CardType.HERO) &&
        (isEffectCard ? !!c.locationId : c.locationId === targetLocId))
    : [];

  const availableCurses = reqTarget === 'CURSE'
    ? Object.values(state.allCards).filter(c =>
        c.ownerId === targetPlayer.id &&
        c.cardType === CardType.CURSE &&
        c.locationId &&
        (targetPlayer.locationStates[c.locationId]?.heroCardInstIds.length ?? 0) > 0)
    : [];

  const canConfirm = chosenId && (
    (isEffectCard && reqTarget !== 'CURSE' && (!reqTarget || targetsAtLoc.length === 0 || !!targetCardId)) ||
    (reqTarget === 'CURSE' && !!targetCardId) ||
    (targetLocId && (!reqTarget || targetsAtLoc.length === 0 || !!targetCardId))
  );

  function confirm() {
    if (!chosenId) return;
    if (reqTarget === 'CURSE') {
      if (!targetCardId) return;
      const curse = state.allCards[targetCardId];
      const loc = curse?.locationId ?? allLocs[0]?.id;
      if (!loc) return;
      doFateResolve(chosenId, loc, { targetCardInstId: targetCardId });
      setChosenId(null); setTargetLocId(null); setTargetCardId(null);
      return;
    }
    const loc = targetLocId ?? allLocs[0]?.id;
    if (!loc) return;
    doFateResolve(chosenId, loc, targetCardId ? { targetCardInstId: targetCardId } : {});
    setChosenId(null); setTargetLocId(null); setTargetCardId(null);
  }

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
              {' '}· Arrastra una carta al tablero o elige ubicación abajo
            </span>
          </div>
          {canConfirm && (
            <button className={BTN} onClick={confirm}>Confirmar</button>
          )}
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
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', card.instId);
                  setChosenId(card.instId);
                  setHoveredFateId(null);
                  onFateDragStart?.(card.instId);
                }}
                onDragEnd={() => onFateDragEnd?.()}
                onMouseEnter={() => setHoveredFateId(card.instId)}
                onMouseLeave={() => setHoveredFateId(null)}
                onClick={() => { setChosenId(card.instId); setTargetLocId(null); setTargetCardId(null); }}
                className={`shrink-0 cursor-grab active:cursor-grabbing select-none transition-all rounded-xl ${
                  isChosen ? 'ring-2 ring-tertiary scale-105' : 'opacity-75 hover:opacity-100 hover:scale-105'
                }`}
              >
                <CardComponent card={card} state={state} selected={isChosen} />
              </div>
            );
          })}
        </div>

        {/* Curse picker */}
        {chosenId && reqTarget === 'CURSE' && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-on-surface-variant shrink-0">Maldición a descartar:</span>
            {availableCurses.length === 0
              ? <span className="text-xs text-error/60">No hay Maldiciones en ubicaciones con Héroes.</span>
              : availableCurses.map(c => (
                  <div
                    key={c.instId}
                    onClick={() => setTargetCardId(c.instId)}
                    className={`cursor-pointer shrink-0 transition-all rounded-xl ${targetCardId === c.instId ? 'ring-2 ring-error scale-105' : 'opacity-70 hover:opacity-100 hover:scale-105'}`}
                  >
                    <CardComponent card={c} state={state} selected={targetCardId === c.instId} />
                  </div>
                ))
            }
          </div>
        )}

        {/* Location picker (fallback cuando no se puede arrastrar) */}
        {chosenId && chosenCard?.cardType !== CardType.EFFECT && reqTarget !== 'CURSE' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-on-surface-variant/60 shrink-0">Ubicación:</span>
            {allLocs.map(l => (
              <button key={l.id}
                onClick={() => { setTargetLocId(l.id); setTargetCardId(null); }}
                className={targetLocId === l.id
                  ? 'px-2 py-1 rounded border border-tertiary bg-tertiary/10 text-tertiary text-[11px] font-stats font-bold'
                  : 'px-2 py-1 rounded border border-outline-variant/40 text-[11px] font-stats text-on-surface-variant bg-surface-container hover:border-primary hover:text-primary transition-all'}
              >{l.name}</button>
            ))}
          </div>
        )}

        {/* Target card picker */}
        {(targetLocId || isEffectCard) && reqTarget && reqTarget !== 'CURSE' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-on-surface-variant/60 shrink-0">
              {reqTarget === 'ALLY' ? 'Aliado:' : 'Héroe:'}
            </span>
            {targetsAtLoc.length === 0
              ? <span className="text-[11px] text-error/70">No hay ninguno disponible. Se jugará sin efecto.</span>
              : targetsAtLoc.map(c => (
                  <button key={c.instId}
                    className={targetCardId === c.instId
                      ? 'px-2 py-1 rounded border border-tertiary bg-tertiary/10 text-tertiary text-[11px] font-stats font-bold'
                      : 'px-2 py-1 rounded border border-outline-variant/40 text-[11px] font-stats text-on-surface-variant bg-surface-container hover:border-primary hover:text-primary transition-all'}
                    onClick={() => setTargetCardId(c.instId)}>
                    {c.name} (F:{getEffectiveStrength(state, c.instId)})
                  </button>
                ))
            }
          </div>
        )}
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
    {/* Paso 1: elegir carta (panel arriba con cartas centradas/escaladas) */}
    {!chosenId && (
      <div className="lg:hidden fixed top-12 inset-x-0 z-50 bg-surface-container-highest/97 backdrop-blur-xl border-b border-error/30 shadow-2xl animate-slide-down">
        <div className="px-4 py-2">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-sm font-bold text-error">Acción Destino</span>
            <span className="text-on-surface-variant/60 text-[11px]">
              contra <strong className="text-on-surface">{targetPlayer.name}</strong> · elige una carta
            </span>
          </div>
        </div>
        <div className="overflow-x-auto overflow-y-hidden">
          <div className="flex items-center gap-7 w-max max-w-full mx-auto px-6 py-4">
            {autoPlayedCards.map(card => (
              <div
                key={card.instId}
                className="opacity-40 pointer-events-none shrink-0"
                style={{ transform: 'scale(1.35)', transformOrigin: 'center' }}
              >
                <CardComponent card={card} state={state} />
              </div>
            ))}
            {revealedCards.map(card => (
              <div
                key={card.instId}
                onClick={() => { setChosenId(card.instId); setTargetLocId(null); setTargetCardId(null); onFateSelect?.(card.instId); }}
                className="relative shrink-0 cursor-pointer select-none transition-transform active:scale-95"
                style={{ transform: 'scale(1.35)', transformOrigin: 'center' }}
              >
                <CardComponent card={card} state={state} />
                {onCardDetail && (
                  <button
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface-container-highest border border-white/25 text-white/70 text-[10px] font-bold flex items-center justify-center shadow-md active:scale-90 transition-transform"
                    onClick={e => { e.stopPropagation(); onCardDetail(card); }}
                  >i</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* Paso 2: carta elegida → barra fina; tocar ubicación del rival la coloca */}
    {chosenId && (
      <div className="lg:hidden fixed top-12 inset-x-0 z-50 bg-surface-container-highest/97 backdrop-blur-xl border-b border-error/30 shadow-xl px-4 py-2 flex items-center gap-3">
        <span className="flex-1 min-w-0 font-stats text-[11px] uppercase tracking-wider text-error truncate">
          Toca una ubicación de {targetPlayer.name}
        </span>
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

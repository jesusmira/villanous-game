import { useState } from 'react';
import { CardType } from '../core/types';
import type { GameState, LocationId, CardInstId } from '../core/types';
import { getPlugin, getEffectDef } from '../core/villains/registry';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';

const BTN = 'px-3 py-1.5 rounded border border-primary/50 bg-primary-container text-primary text-xs font-stats font-bold uppercase tracking-wide hover:bg-primary/20 transition-all disabled:opacity-40';

interface Props {
  state: GameState;
  onFateDragStart?: (cardId: string) => void;
  onFateDragEnd?: () => void;
}

export function FateModal({ state, onFateDragStart, onFateDragEnd }: Props) {
  const doFateResolve = useGameStore(s => s.doFateResolve);
  const { pendingFate } = state;
  const [chosenId,     setChosenId]    = useState<string | null>(null);
  const [targetLocId,  setTargetLocId] = useState<LocationId | null>(null);
  const [targetCardId, setTargetCardId] = useState<CardInstId | null>(null);

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
  const targetsAtLoc = (reqTarget && targetLocId && reqTarget !== 'CURSE')
    ? Object.values(state.allCards).filter(c =>
        c.locationId === targetLocId && c.ownerId === targetPlayer.id &&
        c.cardType === (reqTarget === 'ALLY' ? CardType.ALLY : CardType.HERO))
    : [];

  const availableCurses = reqTarget === 'CURSE'
    ? Object.values(state.allCards).filter(c =>
        c.ownerId === targetPlayer.id &&
        c.cardType === CardType.CURSE &&
        c.locationId &&
        (targetPlayer.locationStates[c.locationId]?.heroCardInstIds.length ?? 0) > 0)
    : [];

  const canConfirm = chosenId && (
    (chosenCard?.cardType === CardType.EFFECT && reqTarget !== 'CURSE') ||
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
    /* Panel deslizante desde arriba — tablero completamente visible debajo */
    <div className="fixed top-12 inset-x-0 z-50 bg-surface-container-highest/97 backdrop-blur-xl border-b border-error/30 shadow-2xl animate-slide-down">

      <div className="max-w-375 mx-auto px-4 py-3 flex flex-col gap-3">

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
        <div className="flex gap-3 overflow-x-auto pb-1">
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
                  onFateDragStart?.(card.instId);
                }}
                onDragEnd={() => onFateDragEnd?.()}
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
        {targetLocId && reqTarget && reqTarget !== 'CURSE' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-on-surface-variant/60 shrink-0">
              {reqTarget === 'ALLY' ? 'Aliado:' : 'Héroe:'}
            </span>
            {targetsAtLoc.length === 0
              ? <span className="text-[11px] text-error/70">No hay ninguno aquí. Se jugará sin adjuntar.</span>
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
  );
}

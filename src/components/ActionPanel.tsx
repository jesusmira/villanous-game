import { useState } from 'react';
import { TurnPhase, ActionType } from '../core/types';
import type { GameState, PlayerId, CardInstId } from '../core/types';
import { getEffectDef, getPlugin } from '../core/villains/registry';
import { EffectId, CardDefId } from '../core/villains/effectIds';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { modalStyles } from '../styles/modalStyles';
import { ACTION_LABELS } from './shared/actionLabels';
import { useGameStore } from '../state/gameStore';

const ACTION_IMG: Record<string, string> = {
  GAIN_POWER:     '/images/actions/gain_power.png',
  VANQUISH:       '/images/actions/vanquish.png',
  MOVE_HERO:      '/images/actions/move_hero.png',
  MOVE_ITEM_ALLY: '/images/actions/move_item_ally.png',
  ACTIVATE_CARD:  '/images/actions/activate_card.png',
  DISCARD:        '/images/actions/discard.png',
  PLAY_CARD:      '/images/actions/play_card.png',
  FATE:           '/images/actions/fate.png',
};
import type { ActionPanelCtx } from './useActionPanelState';
import { Zap, MousePointerClick } from 'lucide-react';

// ─── Shared sub-styles ─────────────────────────────────────────────────────────

const BTN_BASE      = 'px-3 sm:px-3 py-2 sm:py-1.5 min-h-10 sm:min-h-auto rounded text-xs sm:text-xs font-stats font-bold uppercase tracking-wide border transition-all duration-150 active:scale-95';
const BTN_PRIMARY   = `${BTN_BASE} bg-primary-container border-primary/50 text-primary hover:bg-primary/20 hover:border-primary disabled:opacity-40`;
const BTN_SECONDARY = `${BTN_BASE} bg-transparent border-outline-variant/50 text-on-surface-variant hover:border-outline hover:text-on-surface`;

// ─── ACTIVATE_CARD flow (El Cuervo, etc.) ───────────────────────────────────────

function ActivateCardFlow({ ap, state }: { ap: ActionPanelCtx; state: GameState }) {
  const selCard  = ap.selectedCardId ? state.allCards[ap.selectedCardId] : null;
  const needsLoc = selCard?.effectIds.some(id => getEffectDef(id)?.requiresTargetLocation);

  return (
    <div className={modalStyles.panel}>
      <p className="text-xs text-on-surface-variant">Selecciona la carta a Activar:</p>
      <div className="flex flex-wrap gap-1.5">
        {ap.kingdomCards
          .filter(c => c.activationCost !== undefined)
          .map(c => (
            <button key={c.instId}
              className={ap.selectedCardId === c.instId ? modalStyles.buttonActive : ap.player.power < (c.activationCost ?? 0) ? `${modalStyles.buttonSelect} opacity-35` : modalStyles.buttonSelect}
              disabled={ap.player.power < (c.activationCost ?? 0)}
              onClick={() => ap.setSelectedCardId(c.instId)}>
              {c.name} <span className="text-tertiary">(Coste:{c.activationCost ?? 0}⚡)</span>
            </button>
          ))}
      </div>
      {ap.selectedCardId && !needsLoc && (
        <button className={modalStyles.buttonPrimary} onClick={() => {
          if (ap.pendingSlot === null) return;
          ap.store.doActivateCard(ap.selectedCardId!, ap.pendingSlot);
          ap.clearPending(); ap.resetSelection();
        }}>Activar</button>
      )}
      {ap.selectedCardId && needsLoc && (
        <>
          <p className="text-xs text-on-surface-variant">Elige ubicación de destino:</p>
          <div className="flex flex-wrap gap-1.5">
            {ap.allUnlockedLocs
              .filter(l => l.id !== selCard?.locationId)
              .map(l => (
                <button key={l.id} className={ap.targetLocId === l.id ? modalStyles.buttonActive : modalStyles.buttonSelect}
                  onClick={() => ap.setTargetLocId(l.id)}>{l.name}</button>
              ))}
          </div>
          {ap.targetLocId && (
            <button className={modalStyles.buttonPrimary} onClick={() => {
              if (ap.pendingSlot === null) return;
              ap.store.doActivateCard(ap.selectedCardId!, ap.pendingSlot, { targetLocationId: ap.targetLocId! });
              ap.clearPending(); ap.resetSelection(); ap.setTargetLocId(null);
            }}>Activar</button>
          )}
        </>
      )}
    </div>
  );
}

// ─── VANQUISH flow ─────────────────────────────────────────────────────────────

function VanquishFlow({ ap, state }: { ap: ActionPanelCtx; state: GameState }) {
  const selectedHero = ap.selectedCardId ? state.allCards[ap.selectedCardId] : null;

  const heroHasBurla = (instId: string) =>
    (state.allCards[instId]?.attachedItemInstIds ?? []).some(
      itemId => state.allCards[itemId]?.effectIds.includes(EffectId.BURLA_ATTACH),
    );
  const anyBurlaHero = ap.heroesInKingdom.some(h => heroHasBurla(h.instId));

  if (!selectedHero) {
    return (
      <div className={modalStyles.panel}>
        <p className="text-xs text-on-surface-variant">Selecciona el Héroe a derrotar (de cualquier ubicación):</p>
        <div className="flex flex-wrap gap-1.5">
          {ap.heroesInKingdom.map(hero => {
            const heroStr   = getEffectiveStrength(state, hero.instId);
            const locName   = ap.plugin.locations.find(l => l.id === hero.locationId)?.name ?? hero.locationId!;
            const isPP      = hero.defId === CardDefId.HOOK_PETER_PAN;
            const ppNotAtJR = isPP && hero.locationId !== 'jollyroger';
            const burlaBlocked = !heroHasBurla(hero.instId) && anyBurlaHero;
            const disabled  = ppNotAtJR || burlaBlocked;
            return (
              <button key={hero.instId}
                disabled={disabled}
                title={ppNotAtJR ? 'Solo en Jolly Roger' : burlaBlocked ? 'Derrota primero a los héroes con Burla' : undefined}
                className={disabled ? `${modalStyles.buttonSelect} opacity-35` : modalStyles.buttonSelect}
                onClick={() => { ap.setSelectedCardId(hero.instId); ap.setSelectedAllyIds([]); }}
              >
                {hero.name} <span className="text-tertiary">F{heroStr}</span>
                <span className="text-on-surface-variant/60 ml-1 text-[10px]">({locName})</span>
                {ppNotAtJR    && <span className="text-error ml-1 text-[10px]">Solo en JR</span>}
                {burlaBlocked && <span className="text-error ml-1 text-[10px]">Burla</span>}
              </button>
            );
          })}
          {ap.heroesInKingdom.length === 0 && (
            <p className="text-xs text-on-surface-variant/60">No hay Héroes en tu Reino.</p>
          )}
        </div>
      </div>
    );
  }

  const heroStr     = getEffectiveStrength(state, selectedHero.instId);
  const eligible    = ap.vanquishEligibleAllies(selectedHero.instId);
  const combined    = ap.vanquishCombinedStr;
  const needsMultiple = selectedHero.effectIds.some(id => getEffectDef(id)?.requiresMultipleAlliesToVanquish);
  const canConfirm  = combined >= heroStr && ap.selectedAllyIds.length > 0 && (!needsMultiple || ap.selectedAllyIds.length >= 2);

  return (
    <div className={modalStyles.panel}>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => { ap.setSelectedCardId(null); ap.setSelectedAllyIds([]); }}
          className="text-xs text-on-surface-variant/60 hover:text-on-surface transition-colors shrink-0"
        >← Cambiar</button>
        <span className="font-stats text-xs text-on-surface-variant flex-1">
          Vencer: <span className="text-primary font-bold">{selectedHero.name}</span>
        </span>
        <span className={`font-stats text-sm font-bold shrink-0 ${combined >= heroStr ? 'text-primary' : 'text-on-surface-variant/60'}`}>
          {combined}<span className="text-on-surface-variant/40 text-xs"> / {heroStr}</span>
        </span>
      </div>
      {needsMultiple && ap.selectedAllyIds.length < 2 && (
        <p className="text-[10px] text-tertiary">Este héroe requiere al menos 2 aliados</p>
      )}
      <p className="text-xs text-on-surface-variant">Elige aliados a usar (se descartarán al vencer):</p>
      <div className="flex flex-wrap gap-1.5">
        {eligible.map(ally => {
          const allyStr   = getEffectiveStrength(state, ally.instId);
          const isSelected = ap.selectedAllyIds.includes(ally.instId);
          const isAdj     = ally.locationId !== selectedHero.locationId;
          return (
            <button key={ally.instId}
              className={isSelected ? modalStyles.buttonActive : modalStyles.buttonSelect}
              onClick={() => ap.setSelectedAllyIds(
                prev => prev.includes(ally.instId)
                  ? prev.filter(id => id !== ally.instId)
                  : [...prev, ally.instId],
              )}
            >
              {ally.name} <span className="text-tertiary">F{allyStr}</span>
              {isAdj && <span className="text-on-surface-variant/40 ml-1 text-[10px]">Adj</span>}
            </button>
          );
        })}
        {eligible.length === 0 && (
          <p className="text-xs text-error">Sin aliados en la ubicación de este héroe</p>
        )}
      </div>
      <button className={modalStyles.buttonPrimary} disabled={!canConfirm} onClick={() => ap.execVanquish()}>
        Vencer — {ap.selectedAllyIds.length} aliado{ap.selectedAllyIds.length !== 1 ? 's' : ''}
      </button>
    </div>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

interface Props {
  ap: ActionPanelCtx;
  state: GameState;
  playerId: PlayerId;
  selectedCardId?: CardInstId | null;
  detailCardOpen?: boolean;
  handCount?: number;
  handRevealed?: boolean;
  onToggleHand?: () => void;
}

// ─── El Cuervo — se usa ANTES de mover el peón (fase MOVER) ─────────────────────
function RavenFlow({ state, playerId }: { state: GameState; playerId: PlayerId }) {
  const doActivateRaven = useGameStore(s => s.doActivateRaven);
  const [open, setOpen]       = useState(false);
  const [targetLoc, setTarget] = useState<string | null>(null);

  const player = state.players.find(p => p.id === playerId);
  if (!player || player.ravenUsedThisTurn) return null;

  // Buscar el Cuervo en el reino (cualquier ubicación).
  const ravenId = Object.values(state.allCards).find(
    c => c.ownerId === playerId && c.effectIds.includes(EffectId.RAVEN_ACTIVATE) && c.locationId,
  )?.instId;
  if (!ravenId) return null;

  const plugin = getPlugin(player.villainId);
  const allLocs = plugin.locations.filter(l => !player.locationStates[l.id]?.isLocked);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 px-2.5 py-1 rounded border border-primary/50 bg-primary/10 text-primary font-stats text-[10px] uppercase tracking-wider active:scale-95 transition-transform"
      >
        El Cuervo
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-stats text-[10px] text-primary uppercase tracking-wider shrink-0">Mover Cuervo a:</span>
      {allLocs.map(loc => (
        <button key={loc.id}
          onClick={() => setTarget(loc.id)}
          className={targetLoc === loc.id ? modalStyles.buttonActive : modalStyles.buttonSelect}
        >{loc.name}</button>
      ))}
      {targetLoc && (
        <button
          className={modalStyles.buttonPrimary}
          onClick={() => {
            doActivateRaven(ravenId, targetLoc);
            setOpen(false);
            setTarget(null);
          }}
        >Mover</button>
      )}
      <button
        onClick={() => { setOpen(false); setTarget(null); }}
        className="font-stats text-[10px] text-on-surface-variant/60 hover:text-on-surface transition-colors"
      >Cancelar</button>
    </div>
  );
}

/** Botón "Mano" — solo visible en móvil/tablet (oculto en desktop, que usa la pestaña lateral) */
function HandButton({ count, revealed, onToggle }: { count: number; revealed?: boolean; onToggle?: () => void }) {
  if (!onToggle || count <= 0) return null;
  return (
    <button
      onClick={onToggle}
      className={`lg:hidden flex items-center gap-1.5 border rounded-full pl-1.5 pr-3 py-1 min-h-9 active:scale-95 transition-transform shrink-0 ${revealed ? 'bg-error/20 border-error/50' : 'bg-primary/20 border-primary/50'}`}
    >
      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-stats text-xs font-bold ${revealed ? 'bg-error/30 text-error' : 'bg-primary/30 text-primary'}`}>
        {count}
      </span>
      <span className={`font-stats text-[11px] uppercase tracking-[0.12em] font-bold ${revealed ? 'text-error' : 'text-primary'}`}>
        Mano{revealed && ' !'}
      </span>
    </button>
  );
}

export function ActionPanel({ ap, state, playerId, selectedCardId, detailCardOpen, handCount = 0, handRevealed, onToggleHand }: Props) {
  if (state.winner) return null;
  if (state.players[state.currentPlayerIndex].id !== playerId) return null;

  /* ── MOVE phase ──────────────────────────────────────── */
  if (state.turnPhase === TurnPhase.MOVE) {
    const currentLocName = ap.plugin.locations.find(l => l.id === ap.player.pawnLocationId)?.name ?? '';
    return (
      <div className="bg-surface-container-low/95 backdrop-blur-md border-t border-tertiary/30 px-4 py-3 flex flex-row items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2 text-tertiary/70 text-xs sm:text-[10px] min-w-0 flex-1">
          <MousePointerClick className="w-4 h-4 shrink-0" />
          <p className="font-stats uppercase tracking-wider">
            {ap.player.skipNextMove
              ? `Puedes permanecer en ${currentLocName} o moverte`
              : `Elige dónde moverte — actualmente en ${currentLocName}`}
          </p>
        </div>
        {ap.player.skipNextMove && (
          <button className={`${BTN_SECONDARY} min-h-10 sm:min-h-auto shrink-0`} onClick={() => ap.store.doSkipMove()}>
            Permanecer aquí
          </button>
        )}
        <RavenFlow state={state} playerId={playerId} />
        <HandButton count={handCount} revealed={handRevealed} onToggle={onToggleHand} />
      </div>
    );
  }

  /* ── DRAW phase ──────────────────────────────────────── */
  if (state.turnPhase === TurnPhase.DRAW) {
    const deckSize   = ap.player.villainDeckInstIds.length;
    const drawCount  = Math.min(ap.plugin.handSize - ap.player.handInstIds.length, deckSize);
    return (
      <div className="bg-surface-container-low/95 backdrop-blur-md border-t border-outline-variant/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <button
          onClick={() => ap.store.doRevertToActivate()}
          className="flex items-center gap-1.5 text-on-surface-variant/60 hover:text-on-surface transition-colors font-stats text-xs sm:text-[10px] uppercase tracking-wider shrink-0"
        >
          ← Volver
        </button>
        <div className="hidden sm:block h-4 w-px bg-outline-variant/30 shrink-0" />
        <span className="font-stats text-xs sm:text-[10px] text-on-surface-variant/50 flex-1 sm:flex-none">
          {drawCount > 0
            ? `Robarás ${drawCount} carta${drawCount !== 1 ? 's' : ''} (${deckSize} en mazo)`
            : deckSize === 0 ? 'Mazo vacío — se baraja el descarte' : 'Mano llena'}
        </span>
        <HandButton count={handCount} revealed={handRevealed} onToggle={onToggleHand} />
        <button className={`${BTN_PRIMARY} sm:ml-auto`} onClick={() => ap.store.doDrawCards()}>
          Robar y terminar turno
        </button>
      </div>
    );
  }

  if (!ap.locDef) return null;

  /* ── ACTIVATE phase ──────────────────────────────────── */
  const selectedCard = selectedCardId ? state.allCards[selectedCardId] : null;

  return (
    <div className="bg-surface-container-low/95 backdrop-blur-md border-t border-secondary-container/30 px-4 sm:px-4 py-3 sm:py-3 flex flex-col gap-3 sm:gap-2">

      {/* Indicador de carta seleccionada */}
      {selectedCardId && selectedCard && !detailCardOpen && (
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 lg:hidden">
          <div className="w-6 h-6 rounded bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary">
            {Math.max(0, selectedCard.baseCost + selectedCard.costModifier)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-primary truncate">{selectedCard.name}</p>
            <p className="text-[10px] text-primary/70">Toca ubicación para jugar</p>
          </div>
        </div>
      )}

      {/* Header — texto + poder + botón terminar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 text-on-surface-variant/60 text-xs sm:text-[10px]">
          <MousePointerClick className="w-3.5 h-3.5 shrink-0" />
          <p className="font-stats uppercase tracking-wider">
            Elige una acción · {ap.locDef.name}
          </p>
        </div>
        <div className="ml-0 sm:ml-auto flex items-center gap-2 w-full sm:w-auto">
          <HandButton count={handCount} revealed={handRevealed} onToggle={onToggleHand} />
          <div className="flex items-center gap-1.5 bg-secondary-container/10 border border-secondary-container/30 px-2.5 py-1 sm:py-1 rounded-full">
            <Zap className="w-3 h-3 text-secondary-container shrink-0" fill="currentColor" />
            <span className="font-stats text-sm sm:text-sm font-bold text-secondary-container">{ap.player.power}</span>
          </div>
          <button className={`${BTN_SECONDARY} flex-1 sm:flex-none`} onClick={() => ap.store.doEndActivate()}>
            {ap.availableSlots.length === 0 ? 'Terminar → Robar' : 'Terminar'}
          </button>
        </div>
      </div>

      {/* Activar carta (El Cuervo, etc.) */}
      {ap.pendingAction === ActionType.ACTIVATE_CARD && (
        <ActivateCardFlow ap={ap} state={state} />
      )}

      {/* Vencer héroe */}
      {ap.pendingAction === ActionType.VANQUISH && (
        <VanquishFlow ap={ap} state={state} />
      )}

      {/* Extra item slots — shown as action tokens */}
      {ap.extraSlots.length > 0 && (
        <div className="flex items-center gap-3 border-t border-outline-variant/15 pt-2">
          <span className="font-stats text-[9px] uppercase tracking-wider text-on-surface-variant/40 shrink-0">Extras:</span>
          <div className="flex gap-2 flex-wrap">
            {ap.extraSlots.map(({ slotIndex, slot, itemName }) => {
              const available = !state.usedActionSlotIndices.includes(slotIndex);
              const img = ACTION_IMG[slot.type];
              return (
                <button
                  key={slotIndex}
                  disabled={!available}
                  onClick={() => ap.handleSlotClick(slotIndex, slot)}
                  title={`${ACTION_LABELS[slot.type] ?? slot.type} — ${itemName}`}
                  className={`relative w-14 h-14 sm:w-11 sm:h-11 rounded-full border-2 overflow-hidden transition-all shrink-0 active:scale-95 ${
                    available
                      ? 'border-primary/60 hover:scale-110 hover:border-primary cursor-pointer shadow-md'
                      : 'border-outline-variant/20 opacity-35 cursor-not-allowed'
                  }`}
                >
                  {img
                    ? <img src={img} alt={slot.type} className="w-full h-full object-cover" />
                    : <span className="font-stats text-[8px] text-on-surface-variant">{slot.type.slice(0, 3)}</span>
                  }
                  {!available && (
                    <div className="absolute inset-0 bg-background/50" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

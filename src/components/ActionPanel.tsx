import { TurnPhase, ActionType } from '../core/types';
import type { GameState, PlayerId, CardInstId } from '../core/types';
import { getEffectDef } from '../core/villains/registry';
import { EffectId, CardDefId } from '../core/villains/effectIds';
import { getEffectiveStrength, computeActivationCostMod } from '../core/engine/stateHelpers';
import { canActivateCard } from '../core/engine/RuleEngine';
import { modalStyles } from '../styles/modalStyles';
import { ACTION_LABELS } from './shared/actionLabels';
import { ACTION_IMG } from './shared/actionImages';
import type { ActionPanelCtx } from './useActionPanelState';

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
          .map(c => {
            // Mismo criterio que el motor: coste con modificadores (Conejo Blanco +1…) y bloqueos
            // (Dodo). Comparar solo con el coste base dejaba activar sin Poder suficiente.
            const cost  = Math.max(0, (c.activationCost ?? 0) + computeActivationCostMod(state, ap.player.id, c));
            const check = ap.pendingSlot !== null
              ? canActivateCard(state, ap.player.id, c.instId, ap.pendingSlot)
              : { valid: ap.player.power >= cost, reason: undefined };
            return (
              <button key={c.instId}
                className={ap.selectedCardId === c.instId ? modalStyles.buttonActive : !check.valid ? `${modalStyles.buttonSelect} opacity-35` : modalStyles.buttonSelect}
                disabled={!check.valid}
                title={check.valid ? undefined : check.reason}
                onClick={() => ap.setSelectedCardId(c.instId)}>
                {c.name} <span className="text-tertiary">(Coste:{cost}⚡)</span>
              </button>
            );
          })}
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
// Sin barra inferior: los controles del turno flotan en tres sitios fijos alrededor del
// abanico de la mano, para que el tablero llegue hasta abajo.
//   · Abajo a la derecha  → botón de turno (Terminar / Robar y terminar) + pista de la fase.
//   · Abajo a la izquierda → acciones extra concedidas por cartas (p. ej. El Estuche de Garfio),
//                            tantas como haya, sin depender del ancho de una barra.
//   · Centro, sobre la mano → panel contextual solo mientras haya un subflujo abierto
//                            (Activar, Vencer, Descartar).

interface Props {
  ap: ActionPanelCtx;
  state: GameState;
  playerId: PlayerId;
  selectedCardId?: CardInstId | null;
  /** Quita la carta elegida para jugar (p. ej. si no se puede colocar en ninguna ubicación). */
  onCancelSelection?: () => void;
  /** Descartar: la selección vive en la mano (HandFan); aquí solo se confirma o cancela. */
  discard?: { count: number; canConfirm: boolean; onConfirm: () => void; onCancel: () => void };
}

export function ActionPanel({ ap, state, playerId, selectedCardId, onCancelSelection, discard }: Props) {
  if (state.winner) return null;
  if (state.players[state.currentPlayerIndex].id !== playerId) return null;

  const phase = state.turnPhase;
  const selectedCard = selectedCardId ? state.allCards[selectedCardId] : null;
  const hasHandSelection = !!selectedCard && ap.player.handInstIds.includes(selectedCard.instId);
  const currentLocName = ap.plugin.locations.find(l => l.id === ap.player.pawnLocationId)?.name ?? '';

  // ── Pista de la fase (sobre el botón de turno) ──
  const hint =
    phase === TurnPhase.MOVE
      ? ap.player.skipNextMove
        ? `Puedes quedarte en ${currentLocName} o moverte`
        : 'Elige dónde moverte'
      : phase === TurnPhase.DRAW
        ? (() => {
            const deckSize  = ap.player.villainDeckInstIds.length;
            const drawCount = Math.min(ap.plugin.handSize - ap.player.handInstIds.length, deckSize);
            return drawCount > 0
              ? `Robarás ${drawCount} carta${drawCount !== 1 ? 's' : ''}`
              : deckSize === 0 ? 'Mazo vacío: se baraja el descarte' : 'Mano llena';
          })()
        : hasHandSelection
          ? `${selectedCard!.name}: elige una ubicación iluminada`
          : ap.locDef ? `Acciones en ${ap.locDef.name}` : '';

  const flowOpen =
    phase === TurnPhase.ACTIVATE &&
    (ap.pendingAction === ActionType.ACTIVATE_CARD || ap.pendingAction === ActionType.VANQUISH || ap.pendingAction === ActionType.DISCARD);

  return (
    <>
      {/* ── Abajo a la izquierda: acciones extra de cartas ── */}
      {phase === TurnPhase.ACTIVATE && ap.extraSlots.length > 0 && (
        <div className="turn-corner turn-corner--left">
          <span className="font-stats text-[9px] font-semibold uppercase tracking-[0.2em] text-gold/70">Acciones extra</span>
          <div className="flex flex-wrap items-center gap-2">
            {ap.extraSlots.map(({ slotIndex, slot, itemName }) => {
              const available = !state.usedActionSlotIndices.includes(slotIndex);
              const img = ACTION_IMG[slot.type];
              return (
                <button
                  key={slotIndex}
                  disabled={!available}
                  onClick={() => ap.handleSlotClick(slotIndex, slot)}
                  title={`${ACTION_LABELS[slot.type] ?? slot.type} — ${itemName}`}
                  className={`action-token ${available ? 'is-available' : 'is-used'} relative w-11 h-11 lg:w-12 lg:h-12 rounded-full border-2 overflow-hidden shrink-0 ${
                    available ? 'border-gold-bright cursor-pointer' : 'border-black/40 cursor-not-allowed'
                  }`}
                >
                  {img
                    ? <img src={img} alt={slot.type} className="w-full h-full object-cover" />
                    : <span className="font-stats text-[8px] text-on-surface-variant">{slot.type.slice(0, 3)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Abajo a la derecha: botón de turno ── */}
      <div className="turn-corner turn-corner--right">
        {hint && (
          <p className="turn-hint max-w-60 text-right font-narrative italic text-sm leading-snug text-[#f3e2b3]">
            {hint}
          </p>
        )}
        <div className="flex items-center gap-2">
          {phase === TurnPhase.MOVE && ap.player.skipNextMove && (
            <button className="turn-btn turn-btn--secondary" onClick={() => ap.store.doSkipMove()}>
              Permanecer
            </button>
          )}
          {phase === TurnPhase.ACTIVATE && hasHandSelection && onCancelSelection && (
            <button className="turn-btn turn-btn--secondary" onClick={onCancelSelection}>
              Cancelar carta
            </button>
          )}
          {phase === TurnPhase.ACTIVATE && (
            <button className="turn-btn turn-btn--primary" onClick={() => ap.store.doEndActivate()}>
              {ap.availableSlots.length === 0 ? 'Terminar' : 'Terminar acciones'}
            </button>
          )}
          {phase === TurnPhase.DRAW && (
            <>
              <button className="turn-btn turn-btn--secondary" onClick={() => ap.store.doRevertToActivate()}>
                ← Volver
              </button>
              <button className="turn-btn turn-btn--primary" onClick={() => ap.store.doDrawCards()}>
                Robar y terminar
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Centro: panel contextual de subflujos ── */}
      {flowOpen && (
        <div className="turn-flow">
          {ap.pendingAction === ActionType.ACTIVATE_CARD && <ActivateCardFlow ap={ap} state={state} />}
          {ap.pendingAction === ActionType.VANQUISH && <VanquishFlow ap={ap} state={state} />}
          {ap.pendingAction === ActionType.DISCARD && discard && (
            <div className="flex flex-col items-center gap-2.5 px-1">
              <p className="font-stats text-[11px] uppercase tracking-[0.16em] text-[#ffc9c2]">
                {discard.count > 0 ? `${discard.count} carta(s) para descartar` : 'Toca en tu mano las cartas a descartar'}
              </p>
              <div className="flex items-center gap-3">
                <button className="turn-btn turn-btn--secondary" onClick={discard.onCancel}>Cancelar</button>
                <button className="turn-btn turn-btn--danger" disabled={!discard.canConfirm} onClick={discard.onConfirm}>
                  Descartar {discard.count > 0 ? discard.count : ''}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

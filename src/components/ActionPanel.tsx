import { TurnPhase } from '../core/types';
import type { GameState, PlayerId } from '../core/types';
import { ACTION_LABELS } from './shared/actionLabels';

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

const BTN_BASE      = 'px-3 py-1.5 rounded text-xs font-stats font-bold uppercase tracking-wide border transition-all duration-150';
const BTN_PRIMARY   = `${BTN_BASE} bg-primary-container border-primary/50 text-primary hover:bg-primary/20 hover:border-primary disabled:opacity-40`;
const BTN_SECONDARY = `${BTN_BASE} bg-transparent border-outline-variant/50 text-on-surface-variant hover:border-outline hover:text-on-surface`;

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

interface Props {
  ap: ActionPanelCtx;
  state: GameState;
  playerId: PlayerId;
}

export function ActionPanel({ ap, state, playerId }: Props) {
  if (state.winner) return null;
  if (state.players[state.currentPlayerIndex].id !== playerId) return null;

  /* ── MOVE phase ──────────────────────────────────────── */
  if (state.turnPhase === TurnPhase.MOVE) {
    const currentLocName = ap.plugin.locations.find(l => l.id === ap.player.pawnLocationId)?.name ?? '';
    return (
      <div className="bg-surface-container-low/95 backdrop-blur-md border-t border-tertiary/30 px-4 py-2.5 flex items-center gap-4">
        <div className="flex items-center gap-2 text-tertiary/70">
          <MousePointerClick className="w-4 h-4 shrink-0" />
          <p className="font-stats text-[10px] uppercase tracking-wider">
            {ap.player.skipNextMove
              ? `Puedes permanecer en ${currentLocName} o moverte`
              : `Elige dónde moverte — actualmente en ${currentLocName}`}
          </p>
        </div>
        {ap.player.skipNextMove && (
          <button className={`${BTN_SECONDARY} ml-auto`} onClick={() => ap.store.doSkipMove()}>
            Permanecer aquí
          </button>
        )}
      </div>
    );
  }

  /* ── DRAW phase ──────────────────────────────────────── */
  if (state.turnPhase === TurnPhase.DRAW) {
    const deckSize   = ap.player.villainDeckInstIds.length;
    const drawCount  = Math.min(ap.plugin.handSize - ap.player.handInstIds.length, deckSize);
    return (
      <div className="bg-surface-container-low/95 backdrop-blur-md border-t border-outline-variant/30 px-4 py-2.5 flex items-center gap-3">
        <button
          onClick={() => ap.store.doRevertToActivate()}
          className="flex items-center gap-1.5 text-on-surface-variant/60 hover:text-on-surface transition-colors font-stats text-[10px] uppercase tracking-wider shrink-0"
        >
          ← Volver
        </button>
        <div className="h-4 w-px bg-outline-variant/30 shrink-0" />
        <span className="font-stats text-[10px] text-on-surface-variant/50 shrink-0">
          {drawCount > 0
            ? `Robarás ${drawCount} carta${drawCount !== 1 ? 's' : ''} (${deckSize} en mazo)`
            : deckSize === 0 ? 'Mazo vacío — se baraja el descarte' : 'Mano llena'}
        </span>
        <button className={`${BTN_PRIMARY} ml-auto`} onClick={() => ap.store.doDrawCards()}>
          Robar y terminar turno
        </button>
      </div>
    );
  }

  if (!ap.locDef) return null;

  /* ── ACTIVATE phase ──────────────────────────────────── */
  return (
    <div className="bg-surface-container-low/95 backdrop-blur-md border-t border-secondary-container/30 px-4 py-3 flex flex-col gap-2">

      {/* Header — texto + poder + botón terminar en la misma fila */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-on-surface-variant/60">
          <MousePointerClick className="w-3.5 h-3.5" />
          <p className="font-stats text-[10px] uppercase tracking-wider">
            Elige una acción · {ap.locDef.name}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-secondary-container/10 border border-secondary-container/30 px-2.5 py-1 rounded-full">
            <Zap className="w-3 h-3 text-secondary-container" fill="currentColor" />
            <span className="font-stats text-sm font-bold text-secondary-container">{ap.player.power}</span>
          </div>
          <button className={BTN_SECONDARY} onClick={() => ap.store.doEndActivate()}>
            {ap.availableSlots.length === 0 ? 'Terminar → Robar' : 'Terminar'}
          </button>
        </div>
      </div>

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
                  className={`relative w-11 h-11 rounded-full border-2 overflow-hidden transition-all shrink-0 ${
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

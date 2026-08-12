// ─── Resolución de condiciones reactivas para la IA (Cobardía, Perspicaz, Malicia...) ──
// FASE 4: antes, cualquier IA que debía reaccionar a una condición pendiente (pendingCondition)
// la ignoraba siempre (resolveCondition(s, null)), sin importar qué tuviera en mano. Para el
// Príncipe Juan eso dejaba Cobardía —"si el rival tiene 3+ Aliados, juega un Aliado gratis"—
// completamente inutilizable: nunca se dispara jugándola con Jugar Carta (su efecto es
// CONTINUOUS/reactivo, no ON_PLAY), así que sin esto ocupa hueco en mano toda la partida sin
// aportar nunca nada (confirmado con partidas simuladas: 0 activaciones en 25 partidas).
import { CardType } from '../types';
import type { GameState, PendingCondition, CardInstId, ConditionCtx, PlayerState } from '../types';
import { getPlayer } from '../engine/stateHelpers';
import { getPlugin } from '../villains/registry';
import { resolveCondition } from '../engine/PendingStateResolver';
import { EffectId } from '../villains/effectIds';
import { chooseIntention, quickStateValue } from './intent/planner';

/**
 * Decide cómo debe reaccionar la IA a una condición pendiente. Simula cada combinación
 * candidata con la resolución REAL (resolveCondition) y se queda con la que mejor puntúa para
 * quien reacciona — "Ignorar" es siempre una candidata más, así que nunca elige jugar la
 * condición si eso empeora el estado.
 *
 * Solo Cobardía (Príncipe Juan) tiene heurística propia por ahora. Malicia y Tiranía
 * (Maléfica) y Obsesión/Perspicaz (Garfio) siguen ignorándose, igual que antes — quedan como
 * extensión natural de esta misma función en una fase futura.
 */
export function chooseConditionResolution(
  state: GameState,
  pending: PendingCondition,
): { condInstId: CardInstId | null; ctx: ConditionCtx } {
  const player = getPlayer(state, pending.reactingPlayerId);
  const { chosen } = chooseIntention(state, pending.reactingPlayerId);

  let best: { condInstId: CardInstId | null; ctx: ConditionCtx } = { condInstId: null, ctx: {} };
  let bestVal = quickStateValue(resolveCondition(state, null), pending.reactingPlayerId, chosen);

  for (const condInstId of pending.eligibleCardInstIds) {
    const card = state.allCards[condInstId];
    if (!card) continue;

    if (card.effectIds.includes(EffectId.JHON_COBARDIA_COND)) {
      for (const ctx of freeAllyCandidates(state, player)) {
        const val = quickStateValue(resolveCondition(state, condInstId, ctx), pending.reactingPlayerId, chosen);
        if (val > bestVal) { bestVal = val; best = { condInstId, ctx }; }
      }
    }
  }

  return best;
}

/** Combinaciones Aliado (en mano) × ubicación (desbloqueada) para una jugada gratuita. */
function freeAllyCandidates(state: GameState, player: PlayerState): ConditionCtx[] {
  const plugin = getPlugin(player.villainId);
  const allyInstIds = player.handInstIds.filter(id => state.allCards[id]?.cardType === CardType.ALLY);
  const unlockedLocs = plugin.locations.filter(l => !player.locationStates[l.id]?.isLocked);

  const out: ConditionCtx[] = [];
  for (const allyInstId of allyInstIds) {
    for (const loc of unlockedLocs) {
      out.push({ allyInstId, targetLocationId: loc.id });
    }
  }
  return out;
}

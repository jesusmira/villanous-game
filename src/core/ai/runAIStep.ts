// ─── Orquestación de un "paso" de IA: resolver pendientes + jugar el turno ──────
// Extraído de aiWorker.ts para poder reutilizarlo fuera del Web Worker (p. ej. el
// simulador headless scripts/simulate.ts que mide tasas de victoria IA vs IA).
import { runAITurnWithAudit, chooseCuervoAction, resolveTrampaForAI, bestTrampaVanquish } from './AIPlayer';
import {
  resolveCondition, resolveCuervo, resolveDemosles, resolveJaqueca,
  resolveWicketPick, resolveShrinkPick, resolveEnlargeTarget, resolveShrinkSlotChoice,
  resolveShotReveal,
} from '../engine/PendingStateResolver';
import { chooseDemoslesResolution } from '../villains/hook/aiHelpers';
import { chooseConditionResolution } from './conditionAI';
import { CardDefPrefix } from '../villains/effectIds';
import { getEffectiveStrength, getPlayer } from '../engine/stateHelpers';
import { getCoveredSlotIndices } from '../engine/slotHelpers';
import { getPlugin } from '../villains/registry';
import { ActionType } from '../types';
import type { GameState, PlayerId } from '../types';
import type { OpponentProfile } from './opponentModel';
import type { TurnAudit } from './intent/types';

/** Prioridad de casillas a tapar (mayor = más valiosa para el que juega Agrandar). */
const ENLARGE_SLOT_PRIORITY: Record<string, number> = {
  [ActionType.PLAY_CARD]: 4,
  [ActionType.GAIN_POWER]: 3,
  [ActionType.ACTIVATE_CARD]: 2,
  [ActionType.VANQUISH]: 2,
  [ActionType.MOVE_ITEM_ALLY]: 1,
  [ActionType.MOVE_HERO]: 1,
  [ActionType.FATE]: 1,
  [ActionType.DISCARD]: 0,
};

export interface AIStepResult {
  final: GameState;
  steps: GameState[];
  /** Informe de auditoría del turno de IA (intención elegida, acciones, alternativas ignoradas,
   *  puntuación lograda vs óptima) — ausente si no le tocaba jugar a una IA en este paso. */
  audit?: TurnAudit;
}

// Las 4 resoluciones automáticas siguen el mismo patrón: si hay algo pendiente Y quien debe
// reaccionar es la IA, resolverlo; si no, dejar el estado intacto para que decida la UI.
function maybeAutoResolve<T>(
  state: GameState,
  pending: T | undefined,
  getActorId: (pending: T) => PlayerId,
  resolve: (state: GameState, pending: T) => GameState,
): GameState {
  if (!pending) return state;
  const actor = state.players.find(p => p.id === getActorId(pending));
  if (!actor?.isAI) return state;
  return resolve(state, pending);
}

function maybeAutoResolveCondition(state: GameState): GameState {
  return maybeAutoResolve(
    state, state.pendingCondition,
    pending => pending.reactingPlayerId,
    (s, pending) => {
      const { condInstId, ctx } = chooseConditionResolution(s, pending);
      return resolveCondition(s, condInstId, ctx);
    },
  );
}

function maybeAutoResolveCuervo(state: GameState): GameState {
  return maybeAutoResolve(
    state, state.pendingCuervo,
    pending => pending.playerId,
    s => {
      const { action, params } = chooseCuervoAction(s);
      return resolveCuervo(s, action, params);
    },
  );
}

function maybeAutoResolveDemosles(state: GameState): GameState {
  return maybeAutoResolve(
    state, state.pendingDemosles,
    pending => pending.playerId,
    (s, pending) => {
      // Estrategia de búsqueda de PP: si está revelado, a la cima; si no, descartar y cavar.
      const { discardIds, orderedKeepIds } = chooseDemoslesResolution(s, pending);
      return resolveDemosles(s, discardIds, orderedKeepIds);
    },
  );
}

function maybeAutoResolveJaqueca(state: GameState): GameState {
  return maybeAutoResolve(
    state, state.pendingJaqueca,
    pending => pending.actingPlayerId,
    (s, pending) => {
      const canon = pending.itemInstIds.find(id => s.allCards[id]?.defId?.startsWith(CardDefPrefix.HOOK_CANON));
      return resolveJaqueca(s, canon ?? pending.itemInstIds[0]);
    },
  );
}

// Reina de Corazones: alterna hasta `max` cartas propias. Prioriza, al convertir en Postigo,
// las que están en ubicaciones del Reino que todavía no tienen ninguno (progreso hacia el
// objetivo); al revertir a Soldado (Gato Risón) el orden es indiferente.
function maybeAutoResolveWicketPick(state: GameState): GameState {
  return maybeAutoResolve(
    state, state.pendingWicketPick,
    pending => pending.actingPlayerId,
    (s, pending) => {
      const candidates = [...pending.eligibleInstIds];
      if (pending.kind === 'TO_WICKET') {
        const player = s.players.find(p => p.id === pending.actingPlayerId)!;
        const uncoveredLocIds = new Set(
          Object.values(player.locationStates)
            .filter(ls => !ls.villainCardInstIds.some(id => s.allCards[id]?.isWicket))
            .map(ls => ls.id),
        );
        candidates.sort((a, b) => {
          const aPri = uncoveredLocIds.has(s.allCards[a]?.locationId ?? '') ? 0 : 1;
          const bPri = uncoveredLocIds.has(s.allCards[b]?.locationId ?? '') ? 0 : 1;
          return aPri - bPri;
        });
      }
      return resolveWicketPick(s, candidates.slice(0, pending.max));
    },
  );
}

// Furia: mengua a los Héroes rivales de mayor Fuerza efectiva entre los elegibles.
function maybeAutoResolveShrinkPick(state: GameState): GameState {
  return maybeAutoResolve(
    state, state.pendingShrinkPick,
    pending => pending.actingPlayerId,
    (s, pending) => {
      const ranked = [...pending.eligibleHeroInstIds].sort(
        (a, b) => getEffectiveStrength(s, b) - getEffectiveStrength(s, a),
      );
      return resolveShrinkPick(s, ranked.slice(0, pending.max));
    },
  );
}

// Agrandar: elige la ubicación adyacente y casilla que más perjudiquen al dueño del Héroe —
// prioriza acciones de más valor (Jugar Carta > Ganar Poder > resto) y evita tapar una casilla
// que ya estuviera tapada si hay una alternativa libre.
function maybeAutoResolveEnlargeTarget(state: GameState): GameState {
  return maybeAutoResolve(
    state, state.pendingEnlargeTarget,
    pending => pending.actingPlayerId,
    (s, pending) => {
      const hero = s.allCards[pending.heroInstId];
      const ownerId = hero?.ownerId;
      const plugin = ownerId ? getPlugin(getPlayer(s, ownerId).villainId) : null;
      const scoreOf = (e: { locationId: string; slotIndex: number }) => {
        if (!ownerId || !plugin) return 0;
        const locDef = plugin.locations.find(l => l.id === e.locationId);
        const action = locDef?.actions[e.slotIndex];
        const alreadyCovered = getCoveredSlotIndices(s, ownerId, e.locationId).includes(e.slotIndex);
        if (alreadyCovered) return -1;
        return action ? (ENLARGE_SLOT_PRIORITY[action.type] ?? 0) : 0;
      };
      const best = [...pending.eligible].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
      if (!best) return s;
      return resolveEnlargeTarget(s, best.locationId, best.slotIndex);
    },
  );
}

// Menguar/Furia: elige qué casilla sigue tapada — la de MENOR valor (así se libera la mejor
// acción de esa ubicación, que es justo el motivo por el que la Reina mengua a un Héroe rival).
// La cola puede traer hasta 2 elementos (Furia menguando 2 Héroes) — se resuelven TODOS de una
// vez en vez de uno por llamada, para no depender de que algo vuelva a invocar runAIStep después.
function maybeAutoResolveShrinkSlotChoice(state: GameState): GameState {
  let s = state;
  while (s.pendingShrinkSlotChoice) {
    const pending = s.pendingShrinkSlotChoice;
    const actor = s.players.find(p => p.id === pending.actingPlayerId);
    if (!actor?.isAI) break;
    const item = pending.queue[0];
    if (!item) break;
    const hero = s.allCards[item.heroInstId];
    const plugin = hero ? getPlugin(getPlayer(s, hero.ownerId).villainId) : null;
    const locDef = plugin?.locations.find(l => l.id === item.locationId);
    const best = [...item.eligibleSlotIndices].sort((a, b) => {
      const scoreOf = (slotIndex: number) => {
        const action = locDef?.actions[slotIndex];
        return action ? (ENLARGE_SLOT_PRIORITY[action.type] ?? 0) : 0;
      };
      return scoreOf(a) - scoreOf(b); // ascendente: la de menor valor primero
    })[0];
    s = resolveShrinkSlotChoice(s, best);
  }
  return s;
}

// Efectúa el tiro: la IA no necesita "mirar" las cartas — cierra la vista de inmediato.
function maybeAutoResolveShotReveal(state: GameState): GameState {
  return maybeAutoResolve(
    state, state.pendingShotReveal,
    pending => pending.actingPlayerId,
    s => resolveShotReveal(s),
  );
}

/** Resuelve todos los estados pendientes cuya reacción corresponde a un jugador IA. */
export function autoResolveAIPendings(state: GameState): GameState {
  let s = maybeAutoResolveCondition(state);
  s = maybeAutoResolveCuervo(s);
  s = maybeAutoResolveDemosles(s);
  s = maybeAutoResolveJaqueca(s);
  s = maybeAutoResolveWicketPick(s);
  s = maybeAutoResolveShrinkPick(s);
  s = maybeAutoResolveEnlargeTarget(s);
  s = maybeAutoResolveShrinkSlotChoice(s);
  s = maybeAutoResolveShotReveal(s);
  // Trampa: normalmente se resuelve inline durante el turno de la IA (tryPlayCard),
  // pero por robustez se cubre también aquí por si el flag cruza un límite de turno.
  if (s.trampaActive && s.players.find(p => p.id === s.trampaActive)?.isAI) {
    s = resolveTrampaForAI(s, s.trampaActive);
  }
  if (s.trampaVanquish && s.players.find(p => p.id === s.trampaVanquish)?.isAI) {
    s = bestTrampaVanquish(s, s.trampaVanquish);
  }
  return s;
}

/**
 * Un paso completo de IA: resuelve pendientes, juega el turno si le toca a una IA y
 * vuelve a resolver los pendientes que el propio turno haya creado.
 */
export function runAIStep(state: GameState, profile?: OpponentProfile): AIStepResult {
  const s = autoResolveAIPendings(state);

  const current = s.players[s.currentPlayerIndex];
  if (!current.isAI || s.winner) {
    return { final: s, steps: [] };
  }

  const { steps, audit } = runAITurnWithAudit(s, profile);
  let final = steps.length > 0 ? steps[steps.length - 1] : s;
  final = autoResolveAIPendings(final);
  if (steps.length > 0) steps[steps.length - 1] = final;

  return { final, steps, audit };
}

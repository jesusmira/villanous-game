// ─── Orquestación de un "paso" de IA: resolver pendientes + jugar el turno ──────
// Extraído de aiWorker.ts para poder reutilizarlo fuera del Web Worker (p. ej. el
// simulador headless scripts/simulate.ts que mide tasas de victoria IA vs IA).
import { runAITurn, chooseCuervoAction, resolveTrampaForAI, bestTrampaVanquish } from './AIPlayer';
import { resolveCondition, resolveCuervo, resolveDemosles, resolveJaqueca } from '../engine/PendingStateResolver';
import { chooseDemoslesResolution } from '../villains/hook/aiHelpers';
import { CardDefPrefix } from '../villains/effectIds';
import type { GameState, PlayerId } from '../types';

export interface AIStepResult {
  final: GameState;
  steps: GameState[];
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
    s => resolveCondition(s, null),
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

/** Resuelve todos los estados pendientes cuya reacción corresponde a un jugador IA. */
export function autoResolveAIPendings(state: GameState): GameState {
  let s = maybeAutoResolveCondition(state);
  s = maybeAutoResolveCuervo(s);
  s = maybeAutoResolveDemosles(s);
  s = maybeAutoResolveJaqueca(s);
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
export function runAIStep(state: GameState): AIStepResult {
  const s = autoResolveAIPendings(state);

  const current = s.players[s.currentPlayerIndex];
  if (!current.isAI || s.winner) {
    return { final: s, steps: [] };
  }

  const steps = runAITurn(s);
  let final = steps.length > 0 ? steps[steps.length - 1] : s;
  final = autoResolveAIPendings(final);
  if (steps.length > 0) steps[steps.length - 1] = final;

  return { final, steps };
}

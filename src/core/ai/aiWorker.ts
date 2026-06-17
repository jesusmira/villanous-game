/// <reference lib="webworker" />
import { runAITurn, chooseCuervoAction } from './AIPlayer';
import { resolveCondition, resolveCuervo, resolveDemosles, resolveJaqueca } from '../engine/PendingStateResolver';
import { CardDefPrefix } from '../villains/effectIds';
import type { GameState, PlayerId } from '../types';

export interface AIWorkerResponse {
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
    (s, pending) => resolveDemosles(s, pending.topCardIds, []),
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

self.onmessage = (e: MessageEvent<GameState>) => {
  let s = maybeAutoResolveCondition(e.data);
  s = maybeAutoResolveCuervo(s);
  s = maybeAutoResolveDemosles(s);
  s = maybeAutoResolveJaqueca(s);

  const current = s.players[s.currentPlayerIndex];
  if (!current.isAI || s.winner) {
    const response: AIWorkerResponse = { final: s, steps: [] };
    self.postMessage(response);
    return;
  }

  const steps = runAITurn(s);
  let final = steps.length > 0 ? steps[steps.length - 1] : s;
  final = maybeAutoResolveCondition(final);
  final = maybeAutoResolveCuervo(final);
  final = maybeAutoResolveDemosles(final);
  if (steps.length > 0) steps[steps.length - 1] = final;

  const response: AIWorkerResponse = { final, steps };
  self.postMessage(response);
};

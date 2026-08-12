// ─── Punto de entrada público de la IA ────────────────────────────────────────────
// Wrapper fino sobre el planificador (core/ai/intent/planner.ts): elige la intención del
// turno, busca la secuencia de acciones que mejor la sirve y devuelve los estados intermedios
// para animación — igual que antes, para no romper a runAIStep.ts ni a los tests existentes.
import type { GameState, PlayerId } from '../types';
import type { OpponentProfile } from './opponentModel';
import type { TurnAudit } from './intent/types';
import {
  planTurn, chooseIntention,
  resolveTrampaForAIWithIntention, bestTrampaVanquishWithIntention,
} from './intent/planner';
import { chooseCuervoAction } from './intent/legalMoves';

export function runAITurn(state: GameState, profile?: OpponentProfile): GameState[] {
  return planTurn(state, state.players[state.currentPlayerIndex].id, profile).steps;
}

/** Igual que runAITurn, pero también devuelve el TurnAudit del turno — usado por runAIStep. */
export function runAITurnWithAudit(
  state: GameState, profile?: OpponentProfile,
): { steps: GameState[]; audit: TurnAudit } {
  const { steps, audit } = planTurn(state, state.players[state.currentPlayerIndex].id, profile);
  return { steps, audit };
}

/** Resolución de Trampa fuera del turno propio (p. ej. un pendiente que cruza el límite de
 *  turno) — elige la intención vigente en ese momento para valorar las opciones. */
export function resolveTrampaForAI(state: GameState, playerId: PlayerId): GameState {
  const { chosen } = chooseIntention(state, playerId);
  return resolveTrampaForAIWithIntention(state, playerId, chosen);
}

export function bestTrampaVanquish(state: GameState, playerId: PlayerId): GameState {
  const { chosen } = chooseIntention(state, playerId);
  return bestTrampaVanquishWithIntention(state, playerId, chosen);
}

export { chooseCuervoAction };

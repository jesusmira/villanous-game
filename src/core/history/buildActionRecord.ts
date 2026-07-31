// ─── Historial de partidas: construcción de un ActionRecord (pura) ──────────
import type { GameState, PlayerId } from '../types';
import { getPlayer } from '../engine/stateHelpers';
import { snapshotPlayer, snapshotPlayerCards } from './snapshot';
import type { ActionKind, ActionRecord } from './types';

export function buildActionRecord(params: {
  seq: number;
  before: GameState;
  after: GameState;
  actorPlayerId: PlayerId;
  kind: ActionKind;
  actionParams?: Record<string, unknown>;
}): ActionRecord {
  const { seq, before, after, actorPlayerId, kind, actionParams } = params;
  const opponentId = after.players.find(p => p.id !== actorPlayerId)?.id;
  return {
    seq,
    round: before.roundNumber,
    turnPhase: before.turnPhase,
    actorPlayerId,
    actorIsAI: getPlayer(before, actorPlayerId).isAI,
    kind,
    params: actionParams,
    before: snapshotPlayer(before, actorPlayerId),
    after: snapshotPlayer(after, actorPlayerId),
    opponent: opponentId
      ? snapshotPlayer(after, opponentId)
      : snapshotPlayer(after, actorPlayerId), // partidas de 1 jugador: no debería ocurrir en la práctica
    timestamp: Date.now(),
    cards: {
      self: snapshotPlayerCards(after, actorPlayerId),
      opponent: opponentId ? snapshotPlayerCards(after, opponentId) : snapshotPlayerCards(after, actorPlayerId),
    },
    // Mensajes que el propio motor ya generó para esta acción (ver addLog en stateHelpers.ts) —
    // más fiable que intentar re-describir la acción a partir del diff de estados.
    logMessages: after.log.slice(before.log.length),
  };
}

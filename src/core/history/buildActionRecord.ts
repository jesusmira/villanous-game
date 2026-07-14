// ─── Historial de partidas: construcción de un ActionRecord (pura) ──────────
import type { GameState, PlayerId } from '../types';
import { getPlayer } from '../engine/stateHelpers';
import { snapshotPlayer } from './snapshot';
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
  };
}

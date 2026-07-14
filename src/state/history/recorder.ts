// ─── Historial de partidas: grabador de sesión ───────────────────────────────
// Acumula los ActionRecord de la partida en curso y los persiste al terminar.
// Solo hay una partida activa a la vez en esta app, así que el estado de sesión
// vive en variables de módulo (igual de simple que el propio gameStore).
import type { GameState, PlayerId } from '../../core/types';
import { buildActionRecord } from '../../core/history/buildActionRecord';
import type { ActionKind, ActionRecord, GameRecord, GameRecordPlayer } from '../../core/history/types';
import { saveGameRecord } from './db';

function makeId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface Session {
  id: string;
  startedAt: number;
  players: GameRecordPlayer[];
  actions: ActionRecord[];
  seq: number;
}

let session: Session | null = null;

/** Arranca el registro de una nueva partida. Llamar desde initGame. */
export function startSession(state: GameState): void {
  session = {
    id: makeId(),
    startedAt: Date.now(),
    players: state.players.map(p => ({ id: p.id, name: p.name, villainId: p.villainId, isAI: p.isAI })),
    actions: [],
    seq: 0,
  };
}

async function persist(finalState: GameState, winnerPlayerId: PlayerId | null): Promise<void> {
  if (!session) return;
  const record: GameRecord = {
    id: session.id,
    startedAt: session.startedAt,
    finishedAt: Date.now(),
    players: session.players,
    winnerPlayerId,
    rounds: finalState.roundNumber,
    actions: session.actions,
  };
  session = null;
  try {
    await saveGameRecord(record);
  } catch (err) {
    console.error('[history] No se pudo guardar la partida en el historial:', err);
  }
}

/**
 * Registra una acción (antes → después) de `actorPlayerId`. No-op si no hay sesión activa,
 * si el estado no cambió (acción inválida/absorbida) o si `actorPlayerId` es undefined
 * (algunas resoluciones pendientes no siempre tienen actor claro).
 * Si `after` ya tiene ganador y `before` no lo tenía, cierra y persiste la sesión.
 */
export function recordAction(
  before: GameState,
  after: GameState,
  actorPlayerId: PlayerId | undefined,
  kind: ActionKind,
  actionParams?: Record<string, unknown>,
): void {
  if (!session || !actorPlayerId || before === after) return;
  session.actions.push(buildActionRecord({
    seq: session.seq++, before, after, actorPlayerId, kind, actionParams,
  }));
  if (after.winner && !before.winner) {
    void persist(after, after.winner);
  }
}

/**
 * Registra un turno de IA como un único bloque (no se desglosan sus acciones internas).
 * `steps` son los estados intermedios que ya devuelve runAIStep (para la animación);
 * el último es el estado final del turno.
 */
export function recordAITurn(before: GameState, steps: GameState[], aiPlayerId: PlayerId): void {
  if (!session || steps.length === 0) return;
  const after = steps[steps.length - 1];
  recordAction(before, after, aiPlayerId, 'AI_TURN');
}

/** Cierra la sesión sin ganador (partida abandonada/reiniciada a medias) y la persiste igualmente. */
export function abortSession(lastState: GameState): void {
  if (!session || session.actions.length === 0) { session = null; return; }
  void persist(lastState, null);
}

// ─── Modelo del rival humano ──────────────────────────────────────────────────
// Agrega el historial de partidas (Fase 1) en un perfil por villano: a qué
// ubicaciones suele mover el peón el humano y en qué momento (progreso de
// victoria de la IA) suele lanzar Destino contra ella. Puro: GameRecord[] → OpponentProfile.
import type { VillainId, LocationId } from '../types';
import type { ActionKind, GameRecord } from '../history/types';

export interface VillainMoveProfile {
  gamesPlayed: number;
  /** Frecuencia normalizada (suma ≈ 1) de destinos de movimiento observados con este villano. */
  moveFrequency: Partial<Record<LocationId, number>>;
  /** Nº de veces que resolvió una acción de Destino jugando este villano. */
  fateCount: number;
  /** Media del winProgress DEL RIVAL (la IA) en el momento en que lanzó Destino. null = sin datos. */
  avgFateTriggerOppProgress: number | null;
  /** Descartes por turno jugado — cuánto cicla la mano. */
  discardRate: number;
}

export interface OpponentProfile {
  /** Nº de partidas Jugador-vs-IA analizadas (de cualquier villano). */
  gamesAnalyzed: number;
  byVillain: Partial<Record<VillainId, VillainMoveProfile>>;
}

// Umbrales de confianza: con pocas partidas o sin preferencia clara, mejor no anticipar nada
// (una sola partida no es un patrón, y forzar una predicción ruidosa puede sesgar mal el minimax).
const MIN_CONFIDENCE_GAMES = 2;
const MIN_FAVORED_FREQ = 0.32;

interface VillainAccum {
  gamesPlayed: number;
  moveCounts: Partial<Record<LocationId, number>>;
  fateProgressSamples: number[];
  discardCount: number;
  turnCount: number;
}

export function buildOpponentProfile(records: GameRecord[]): OpponentProfile {
  const accum: Partial<Record<VillainId, VillainAccum>> = {};
  let gamesAnalyzed = 0;

  for (const record of records) {
    // Solo cuentan las partidas Jugador vs IA: exactamente un humano y una IA.
    // Las partidas 1v1 (dos humanos) no dicen nada sobre "cómo juega contra la IA".
    const human = record.players.find(p => !p.isAI);
    const ai = record.players.find(p => p.isAI);
    if (!human || !ai || human.id === ai.id) continue;
    gamesAnalyzed++;

    const a = (accum[human.villainId] ??= {
      gamesPlayed: 0, moveCounts: {}, fateProgressSamples: [], discardCount: 0, turnCount: 0,
    });
    a.gamesPlayed++;

    for (const action of record.actions) {
      if (action.actorPlayerId !== human.id) continue;
      const kind: ActionKind = action.kind;
      if (kind === 'MOVE_PAWN') {
        const loc = action.params?.locationId as LocationId | undefined;
        if (loc) a.moveCounts[loc] = (a.moveCounts[loc] ?? 0) + 1;
      } else if (kind === 'FATE_RESOLVE') {
        // `opponent` no existía en registros guardados antes de añadir este campo al esquema;
        // los de IndexedDB son datos externos y pueden no coincidir con el tipo actual.
        if (action.opponent) a.fateProgressSamples.push(action.opponent.winProgress);
      } else if (kind === 'DISCARD') {
        a.discardCount++;
      } else if (kind === 'END_ACTIVATE') {
        a.turnCount++;
      }
    }
  }

  const byVillain: Partial<Record<VillainId, VillainMoveProfile>> = {};
  for (const [villainId, a] of Object.entries(accum) as [VillainId, VillainAccum][]) {
    const totalMoves = Object.values(a.moveCounts).reduce((s: number, n) => s + (n ?? 0), 0);
    const moveFrequency: Partial<Record<LocationId, number>> = {};
    if (totalMoves > 0) {
      for (const [loc, n] of Object.entries(a.moveCounts)) moveFrequency[loc] = (n ?? 0) / totalMoves;
    }
    byVillain[villainId] = {
      gamesPlayed: a.gamesPlayed,
      moveFrequency,
      fateCount: a.fateProgressSamples.length,
      avgFateTriggerOppProgress: a.fateProgressSamples.length > 0
        ? a.fateProgressSamples.reduce((s, n) => s + n, 0) / a.fateProgressSamples.length
        : null,
      discardRate: a.turnCount > 0 ? a.discardCount / a.turnCount : 0,
    };
  }

  return { gamesAnalyzed, byVillain };
}

/**
 * Destino que el humano suele elegir jugando `villainId`, entre los `candidates` disponibles
 * ahora mismo — solo si hay suficientes partidas y una preferencia clara; si no, undefined.
 * Usado por minimaxOppResponse (AIPlayer.ts) para que el árbol de búsqueda no descarte lo
 * que el rival REALMENTE tiende a hacer solo porque no es su jugada teóricamente óptima.
 */
export function pickFavoredDestination(
  profile: OpponentProfile | undefined,
  villainId: VillainId,
  candidates: LocationId[],
): LocationId | undefined {
  const vp = profile?.byVillain[villainId];
  if (!vp || vp.gamesPlayed < MIN_CONFIDENCE_GAMES) return undefined;
  let best: LocationId | undefined;
  let bestFreq = 0;
  for (const loc of candidates) {
    const f = vp.moveFrequency[loc] ?? 0;
    if (f > bestFreq) { bestFreq = f; best = loc; }
  }
  return bestFreq >= MIN_FAVORED_FREQ ? best : undefined;
}

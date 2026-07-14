// ─── Historial de partidas: tipos puros ──────────────────────────────────────
// Sin dependencias de React ni de IndexedDB — solo modelan los datos que se
// registran durante una partida para poder persistirlos y, más adelante,
// construir un perfil del jugador humano (ver evaluate.ts / AIPlayer.ts).
import type { PlayerId, VillainId, LocationId } from '../types';

/** Tipo de acción registrada. Refleja 1:1 los `do*` de `useGameStore` + el turno de IA. */
export const ActionKind = {
  MOVE_PAWN: 'MOVE_PAWN',
  SKIP_MOVE: 'SKIP_MOVE',
  GAIN_POWER: 'GAIN_POWER',
  PLAY_CARD: 'PLAY_CARD',
  VANQUISH: 'VANQUISH',
  MOVE_ITEM_ALLY: 'MOVE_ITEM_ALLY',
  MOVE_HERO: 'MOVE_HERO',
  FATE_START: 'FATE_START',
  FATE_RESOLVE: 'FATE_RESOLVE',
  ACTIVATE_CARD: 'ACTIVATE_CARD',
  DISCARD: 'DISCARD',
  END_ACTIVATE: 'END_ACTIVATE',
  DRAW_CARDS: 'DRAW_CARDS',
  RESOLVE_CONDITION: 'RESOLVE_CONDITION',
  RESOLVE_AURORA_HERO: 'RESOLVE_AURORA_HERO',
  REVERT_TO_ACTIVATE: 'REVERT_TO_ACTIVATE',
  RESOLVE_CUERVO: 'RESOLVE_CUERVO',
  RESOLVE_DEMOSLES: 'RESOLVE_DEMOSLES',
  ACTIVATE_RAVEN: 'ACTIVATE_RAVEN',
  ACTIVATE_SHERIF: 'ACTIVATE_SHERIF',
  RESOLVE_JAQUECA: 'RESOLVE_JAQUECA',
  RESOLVE_TRAMPA: 'RESOLVE_TRAMPA',
  TRAMPA_VANQUISH: 'TRAMPA_VANQUISH',
  TRAMPA_SKIP: 'TRAMPA_SKIP',
  /** Turno completo de la IA (rollout de varias acciones internas no desglosadas). */
  AI_TURN: 'AI_TURN',
} as const;
export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];

/** Foto del estado de UN jugador en un instante — usada como "antes"/"después" de cada acción. */
export interface PlayerSnapshot {
  power: number;
  handSize: number;
  /** 0-100, vía getWinProgress() de evaluate.ts. */
  winProgress: number;
  pawnLocationId: LocationId;
  /** Fuerza total de tus propios aliados en juego. */
  allyStrength: number;
  /** Nº de héroes rivales presentes en TU reino (te estorban). */
  heroesPresent: number;
}

export interface ActionRecord {
  /** Orden dentro de la partida (0, 1, 2...). */
  seq: number;
  round: number;
  turnPhase: string;
  actorPlayerId: PlayerId;
  actorIsAI: boolean;
  kind: ActionKind;
  /** Parámetros de la acción, serializables (ids, no objetos completos). */
  params?: Record<string, unknown>;
  before: PlayerSnapshot;
  after: PlayerSnapshot;
  /**
   * Snapshot del RIVAL justo después de esta acción (partidas 1 vs 1: el otro jugador).
   * Permite, p. ej., saber a qué progreso de victoria del rival dispara el jugador el
   * Destino — la propia acción solo captura el estado del actor, no el del oponente.
   */
  opponent: PlayerSnapshot;
  timestamp: number;
}

export interface GameRecordPlayer {
  id: PlayerId;
  name: string;
  villainId: VillainId;
  isAI: boolean;
}

export interface GameRecord {
  id: string;
  startedAt: number;
  finishedAt: number;
  players: GameRecordPlayer[];
  /** null = partida abandonada/reiniciada sin ganador. */
  winnerPlayerId: PlayerId | null;
  rounds: number;
  actions: ActionRecord[];
}

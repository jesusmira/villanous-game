// ─── Tipos del motor de IA basado en intenciones ─────────────────────────────────
// Arquitectura: Contexto (foto estructurada del estado) → Intenciones (universales +
// por villano, cada una con nombre y evaluate(ctx)) → Planificador (elige la intención
// del turno y busca la secuencia de acciones que mejor la sirve) → Auditor (registra
// qué se decidió y por qué).
import type { ActionType, CardInstId, GameState, LocationId, PlayerId, PlayerState, VillainPlugin } from '../../types';
import type { OpponentProfile } from '../opponentModel';

// ─── Contexto ─────────────────────────────────────────────────────────────────────

export interface LocationSnapshot {
  id: LocationId;
  isLocked: boolean;
  /** Casillas de acción libres AHORA MISMO para el dueño de este reino, solo tiene sentido
   *  cuando el peón del dueño está en esta ubicación (fuera de ahí, ninguna casilla es usable
   *  este turno aunque exista en la definición). */
  availableSlotIndices: number[];
  heroCardInstIds: CardInstId[];
  villainCardInstIds: CardInstId[];
  heroStrength: number;
  allyStrength: number;
  /** false en ubicaciones con heroesNeverCoverSlots (p. ej. La Prisión de Jhon) — un héroe ahí
   *  no tapa ninguna ranura, así que colocarlo o quitarlo de ahí no cambia nada estructural. */
  blocksSlots: boolean;
}

export interface AIContext {
  state: GameState;
  playerId: PlayerId;
  player: PlayerState;
  plugin: VillainPlugin;
  opponent: PlayerState | null;
  oppPlugin: VillainPlugin | null;
  profile?: OpponentProfile;
  /** 0-100: progreso propio hacia la condición de victoria del villano. */
  ownProgress: number;
  /** 0-100: progreso del rival hacia SU condición de victoria. */
  oppProgress: number;
  locations: LocationSnapshot[];
  oppLocations: LocationSnapshot[];
  /** Cartas en mano que ya no aportan nada (ver VillainPlugin.deadCards + duplicados de Condición). */
  deadHandCardIds: CardInstId[];
  /** Memoria de partida — derivada de GameState (motor puro, sin estado mutable). */
  memory: MemorySummary;
  /** Lectura avanzada del rival: urgencia estimada y recursos disponibles. */
  oppThreat: OppThreatSummary;
  /** Planificación a 2-3 turnos (heurística de huecos restantes, no búsqueda exhaustiva) —
   *  turnos estimados para completar el objetivo de victoria propio. */
  turnsToGoalEstimate: number;
}

/** Memoria de partida — ver core/ai/intent/memory.ts para cómo se deriva de GameState. */
export interface MemorySummary {
  heroesEliminatedByMe: number;
  heroesEliminatedByOpp: number;
  cardsPlayedByMe: number;
  cardsPlayedByOpp: number;
}

/** Lectura avanzada del rival — heurística de huecos restantes, no búsqueda exhaustiva. */
export interface OppThreatSummary {
  /** null si no hay rival (no debería pasar en 1v1, pero el tipo lo contempla). */
  turnsToWinEstimate: number | null;
  alliesAvailableStrength: number;
  keyCardsInPlay: string[];
}

// ─── Intenciones ────────────────────────────────────────────────────────────────

export interface IntentionDef {
  id: string;
  name: string;
  /** Urgencia/prioridad de perseguir esta intención AHORA MISMO (mayor = más prioritaria) — se
   *  usa para elegir la intención del turno. Dos estilos posibles, distinguidos por `polarity`:
   *  "urgencia" (sube cuando hay un problema sin resolver, baja a 0 al resolverlo) o "logro"
   *  (sube cuando se avanza hacia el objetivo). Ambos son válidos para SELECCIONAR intención;
   *  la diferencia importa al puntuar acciones (ver `polarity`). */
  evaluate: (ctx: AIContext) => number;
  /**
   * +1 si evaluate() sube cuando el estado mejora ("logro" — p. ej. progreso de victoria: más
   * es mejor). −1 si evaluate() sube cuando hay una necesidad urgente sin resolver y BAJA al
   * resolverla ("urgencia" — p. ej. héroes bloqueando: menos es mejor). El puntuador de acciones
   * usa esto para que RESOLVER un problema urgente sume (no reste) puntos de alineación:
   * alineación = (evaluate(después) − evaluate(antes)) × polarity. Sin esto, vencer a un héroe
   * bloqueante que hacía urgente una intención "de urgencia" restaba puntos de golpe (la urgencia
   * cae a 0 al resolverse) — justo la trampa de gradiente que este campo evita.
   */
  polarity: 1 | -1;
}

export interface ScoredIntention extends IntentionDef {
  score: number;
}

/** Versión serializable de ScoredIntention (sin la función `evaluate`) — TurnAudit cruza el
 *  límite del Web Worker vía postMessage, que no puede clonar funciones (DataCloneError). */
export interface IntentionSummary {
  id: string;
  name: string;
  score: number;
  polarity: 1 | -1;
}

// ─── Acciones candidatas ──────────────────────────────────────────────────────────

export type ActionKind = ActionType | 'PAY_TO_DISCARD';

export interface ActionCandidate {
  kind: ActionKind;
  slotIdx?: number;
  label: string;
  resultState: GameState;
  /** Acción de mera reubicación (mover objeto/aliado/héroe) — candidata a la penalización
   *  "mover sin abrir opciones nuevas". */
  isRepositioning: boolean;
  /** Carta jugada, solo para candidatas PLAY_CARD — permite identificar qué carta concreta es
   *  sin tener que inferirlo del `label` o diferenciar la mano antes/después. */
  cardInstId?: CardInstId;
}

export interface ActionScoreBreakdown {
  progress: number;
  enemyImpact: number;
  economy: number;
  handSynergy: number;
  victoryPrep: number;
  intentionAlignment: number;
  /** Presión acumulada: valor de colocar un héroe rival (vía Destino) donde más estorbe —
   *  bloqueo de ranuras + sinergia con otros héroes ya colocados + debilidad estructural del
   *  rival ante héroes + coste de quitarlo. 0 para acciones que no colocan un héroe rival. */
  pressureScore: number;
  /** Colocación inteligente de Aliados: cuánto mejora el encaje Aliado↔héroe presente
   *  (independiente de la intención elegida — un Aliado bien puesto vale por sí solo). */
  allyPlacement: number;
  /** Bono estructural fijo por jugar una carta de búsqueda hacia el objetivo mientras aún no se
   *  ha encontrado (p. ej. Rival Digno/Démosles un susto de Garfio buscando a Peter Pan) — fijo
   *  porque el `resultState` de estas cartas puede depender de una tirada aleatoria interna
   *  (corte de mazo), y puntuar solo por ese muestreo puntual las infravalora la mitad de las
   *  veces por pura mala suerte. 0 para cualquier otra candidata. */
  searchBonus: number;
  uselessPenalty: number;
  total: number;
}

export interface ScoredAction extends ActionCandidate {
  breakdown: ActionScoreBreakdown;
}

// ─── Auditoría ─────────────────────────────────────────────────────────────────────

export interface AuditedAction {
  label: string;
  total: number;
  /** true si esta acción se eligió principalmente por la CONTINUACIÓN que habilita (su propio
   *  delta era mediocre/negativo, pero abre una secuencia de más valor) — combo detectado por el
   *  propio rollout recursivo, no una lista de combos hardcodeada. */
  isCombo?: boolean;
}

/** Una colocación de héroe rival vía Destino con presión acumulada > 0 (ver `pressureScore` en
 *  ActionScoreBreakdown) — resumen de auditoría, no un cálculo nuevo. */
export interface PressurePlacement {
  label: string;
  pressureScore: number;
}

/** Resumen riesgo-beneficio del turno: suma de los términos POSITIVOS (beneficio) y NEGATIVOS
 *  (riesgo, en valor absoluto) de `ActionScoreBreakdown` a lo largo de todas las acciones
 *  tomadas — no es una escala nueva, solo agrupa lo que `scoreAction()` ya calculaba término a
 *  término. */
export interface RiskBenefitSummary {
  benefit: number;
  risk: number;
}

export interface TurnAudit {
  playerId: PlayerId;
  villainId: string;
  roundNumber: number;
  intentionScores: IntentionSummary[];
  chosenIntention: IntentionSummary;
  actionsTaken: AuditedAction[];
  ignoredAlternatives: AuditedAction[];
  ruleErrors: string[];
  turnScoreAchieved: number;
  turnScoreOptimal: number;
  /** Planificación a 2-3 turnos (ver AIContext.turnsToGoalEstimate), fotografiada al elegir la
   *  intención del turno — informativo, no influye en la decisión. */
  turnsToGoalEstimate: number;
  /** Héroes rivales colocados este turno vía Destino con presión acumulada > 0. */
  pressureSummary: PressurePlacement[];
  riskBenefit: RiskBenefitSummary;
}

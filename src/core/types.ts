import type { IntentionDef, StructuralThreatDef, VillainWeightProfile } from './ai/intent/types';

export type PlayerId = string;
export type VillainId = 'maleficent' | 'hook' | 'jhon' | 'queen';
export type LocationId = string;
export type CardDefId = string;
export type CardInstId = string;
export type EffectId = string;

export const TurnPhase = { MOVE: 'MOVE', ACTIVATE: 'ACTIVATE', DRAW: 'DRAW' } as const;
export type TurnPhase = (typeof TurnPhase)[keyof typeof TurnPhase];

export const ActionType = {
  GAIN_POWER: 'GAIN_POWER', PLAY_CARD: 'PLAY_CARD', MOVE_ITEM_ALLY: 'MOVE_ITEM_ALLY',
  MOVE_HERO: 'MOVE_HERO', VANQUISH: 'VANQUISH', ACTIVATE_CARD: 'ACTIVATE_CARD',
  FATE: 'FATE', DISCARD: 'DISCARD',
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

export const CardType = {
  ALLY: 'ALLY', ITEM: 'ITEM', EFFECT: 'EFFECT', CONDITION: 'CONDITION',
  HERO: 'HERO', CURSE: 'CURSE',
} as const;
export type CardType = (typeof CardType)[keyof typeof CardType];

export const CardDeck = { VILLAIN: 'VILLAIN', FATE: 'FATE' } as const;
export type CardDeck = (typeof CardDeck)[keyof typeof CardDeck];

export const EffectTrigger = {
  ON_PLAY: 'ON_PLAY', CONTINUOUS: 'CONTINUOUS', ON_VANQUISH: 'ON_VANQUISH',
  AT_TURN_START: 'AT_TURN_START', ACTIVATED: 'ACTIVATED',
  ON_PAWN_ARRIVES: 'ON_PAWN_ARRIVES', ON_ALLY_PLACED: 'ON_ALLY_PLACED',
  ON_FATE_REVEAL: 'ON_FATE_REVEAL', ON_HERO_PLAYED_HERE: 'ON_HERO_PLAYED_HERE',
} as const;
export type EffectTrigger = (typeof EffectTrigger)[keyof typeof EffectTrigger];

export type ConditionTriggerType = 'VANQUISH_4PLUS' | 'ALLY_3PLUS' | 'ALLY_4PLUS_STR';

export interface ActionSlot {
  type: ActionType;
  value?: number;
}

export interface LocationSpecialRule {
  type: 'HERO_MIN_STRENGTH';
  minStrength: number;
}

export interface LocationDef {
  id: LocationId;
  name: string;
  actions: ActionSlot[];
  adjacentIds: LocationId[];
  startsLocked?: boolean;
  specialRules?: LocationSpecialRule[];
  heroesNeverCoverSlots?: boolean;
  actionsInBottomRow?: boolean;
}

export interface LocationState {
  id: LocationId;
  isLocked: boolean;
  villainCardInstIds: CardInstId[];
  heroCardInstIds: CardInstId[];
}

export interface CardDef {
  id: CardDefId;
  name: string;
  type: CardType;
  deck: CardDeck;
  villainId: VillainId;
  cost: number;
  strength?: number;
  activationCost?: number;
  effectIds: EffectId[];
  description: string;
  grantsActionSlot?: ActionSlot;
  imageFile?: string;
}

// Runtime card instance — carries everything needed so the engine
// never has to look up the definition during play.
export interface CardInst {
  instId: CardInstId;
  defId: CardDefId;
  ownerId: PlayerId;
  villainId: VillainId;
  deck: CardDeck;
  cardType: CardType;
  name: string;
  baseCost: number;
  baseStrength?: number;
  effectIds: EffectId[];
  activationCost?: number;
  grantsActionSlot?: ActionSlot;
  imageFile?: string;
  // runtime position
  locationId?: LocationId;
  // attachment
  attachedToInstId?: CardInstId;
  attachedItemInstIds: CardInstId[];
  // accumulated runtime modifiers
  strengthModifier: number;
  costModifier: number;
  bonusThisTurn: number;
  storedPower?: number;
  /** Ronda (GameState.roundNumber) en la que esta carta entró en la mano de su dueño — se
   *  restampa cada vez que vuelve a la mano (robo normal, mano inicial). Usado por
   *  getDeadHandCards (context.ts) para que una Condición que lleva demasiadas rondas sin
   *  dispararse (no depende de nada que el dueño pueda forzar) se marque descartable en vez de
   *  ocupar hueco de mano indefinidamente. undefined si la carta nunca ha pasado por un robo
   *  instrumentado (no afecta a nada más, el chequeo lo trata como "recién llegada"). */
  handSinceRound?: number;
  /** Reina de Corazones: un Soldado Naipe convertido en Postigo pierde su capacidad de Vencer
   *  pero conserva Fuerza a efectos de "Efectúa el tiro". Sigue siendo cardType ALLY. */
  isWicket?: boolean;
  /**
   * Reina de Corazones: Menguar gira al Héroe 45° — si hay varios Héroes en su ubicación, este
   * pasa a ser el ÚNICO que tapa una casilla, y tapa solo 1 (no las 2 de siempre). No afecta a
   * su Fuerza. Ver getCoveredSlotIndices (slotHelpers.ts).
   */
  isShrunk?: boolean;
  /** Reina de Corazones: cuál de las casillas normalmente tapadas por este Héroe sigue tapada
   *  mientras esté Menguado (elegida por quien lo mengua — ver pendingShrinkSlotChoice). */
  shrunkKeptSlotIndex?: number;
  /**
   * Reina de Corazones: Agrandar gira al Héroe 90° — además de tapar su ubicación de siempre,
   * tapa UNA casilla de una ubicación adyacente (enlargedTargetLocationId/enlargedTargetSlotIndex).
   * El Héroe se considera presente en ambas ubicaciones a efectos de tapado. Su `locationId`
   * real nunca cambia — "devolverlo a su ubicación original" es simplemente limpiar estos 3 campos.
   */
  isEnlarged?: boolean;
  enlargedTargetLocationId?: LocationId;
  enlargedTargetSlotIndex?: number;
}

export interface EffectContext {
  actingPlayerId: PlayerId;
  cardInstId: CardInstId;
  targetCardInstId?: CardInstId;
  targetLocationId?: LocationId;
  auxiliaryInstIds?: CardInstId[];
  /** El jugador declinó explícitamente el target opcional (p. ej. "Ignorar" en el modal de Sr.
   *  Starkey) — el efecto NO debe caer en su propio auto-target de respaldo. */
  skipTargetHero?: boolean;
}

/**
 * Datos opcionales que completan playCard() cuando el efecto ON_PLAY de la carta los necesita
 * (a qué Aliado/Héroe se adjunta un Objeto, qué Mapa se usa para pagarlo, etc.). Antes vivía
 * declarado por separado e inline en buildPlayCtx() y en la firma de playCard().
 */
export interface PlayCardCtx {
  targetCardInstId?: CardInstId;
  auxiliaryInstIds?: CardInstId[];
  mapaInstId?: CardInstId;
  targetLocationId?: LocationId;
  /** Ver EffectContext.skipTargetHero — viaja igual desde playCard() hasta el execute(). */
  skipTargetHero?: boolean;
}

/**
 * Datos opcionales que completan activateCard() para efectos ACTIVATED (p. ej. el Cuervo,
 * que necesita saber a qué ubicación se mueve). Antes vivía declarado inline en AIPlayer.ts
 * y en la firma de activateCard().
 */
export interface ActivateCardCtx {
  targetLocationId?: LocationId;
  targetCardInstId?: CardInstId;
}

export type EffectFn = (state: GameState, ctx: EffectContext) => GameState;

export interface EffectDef {
  id: EffectId;
  trigger: EffectTrigger;
  description: string;
  execute: EffectFn;
  computeStrengthBonus?: (state: GameState, cardInstId: CardInstId) => number;
  computePlayCostModifier?: (state: GameState, playerId: PlayerId, cardToPlay: CardInst, effectCardInstId: CardInstId, targetLocationId: LocationId) => number;
  requiresTargetCard?: 'ALLY' | 'HERO' | 'CURSE';
  requiresTargetHeroAnywhere?: boolean;
  requiresTargetLocation?: boolean;
  computePowerGainModifier?: (state: GameState, playerId: PlayerId, cardInstId: CardInstId) => number;
  canVanquishFromAdjacent?: boolean;
  blocksHeroPlay?: boolean;
  blocksCursePlay?: boolean;
  /** Mientras el Héroe portador esté vivo en el reino, no se pueden jugar cartas EFFECT (Rey Ricardo). */
  blocksEffectPlay?: boolean;
  /** El Héroe al que está adjunto este Objeto no puede ser Vencido (Buen Disfraz). */
  preventsVanquish?: boolean;
  /**
   * El DUEÑO de la carta puede descartarla voluntariamente pagando este Poder, en su propio
   * turno, sin consumir casilla de acción (p. ej. Buen Disfraz: 2 Monedas para quitárselo).
   */
  payToDiscardCost?: number;
  heroMinStrengthRequired?: number;
  /** El Héroe portador no puede jugarse ni moverse a esta ubicación (p. ej. Lady Kluck → La Prisión). */
  cannotEnterLocationId?: LocationId;
  requiresMultipleAlliesToVanquish?: boolean;
  conditionTrigger?: ConditionTriggerType;
  /** El Aliado portador no se descarta al ser utilizado para Vencer (Tweedle Dee y Tweedle Dum). */
  survivesVanquish?: boolean;
  /** La carta solo puede jugarse si el Reino del jugador tiene al menos un Postigo en cada
   *  ubicación (gate de jugabilidad de "Efectúa el tiro"). */
  requiresAllLocationsHaveWicket?: boolean;
  /** Mientras el Héroe portador esté vivo en el reino, no se pueden mover Aliados ni Objetos
   *  (Alicia). */
  blocksMoveItemAlly?: boolean;
  /** El Héroe portador no puede ser Menguado (El Lirón). */
  immuneToShrink?: boolean;
  /**
   * Declarado en una carta (p. ej. Dodo) que, mientras esté en una ubicación, bloquea activar
   * ahí cualquier otra carta para la que este predicado devuelva true (p. ej. los Soldados
   * Naipe/Postigos de la Reina de Corazones). Se comprueba contra TODAS las cartas presentes en
   * la ubicación de la carta que se intenta activar, no contra los efectos de esa propia carta.
   */
  blocksActivationAtLocation?: (cardToActivate: CardInst) => boolean;
  /** Modificador del Precio de Activación de la carta que se está activando (Conejo Blanco: +1
   *  a Soldados Naipe/Postigos). Análogo a computePlayCostModifier pero para ACTIVATE_CARD. */
  computeActivationCostModifier?: (state: GameState, playerId: PlayerId, cardToActivate: CardInst, effectCardInstId: CardInstId) => number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  villainId: VillainId;
  power: number;
  pawnLocationId: LocationId;
  handInstIds: CardInstId[];
  villainDeckInstIds: CardInstId[];
  villainDiscardInstIds: CardInstId[];
  fateDeckInstIds: CardInstId[];
  fateDiscardInstIds: CardInstId[];
  locationStates: Record<LocationId, LocationState>;
  isAI: boolean;
  completedObjectiveSteps: string[];
  skipNextMove?: boolean;
  dragonActive?: boolean;
  /** El Cuervo (Maléfica) ya se movió este turno (antes de mover el peón). */
  ravenUsedThisTurn?: boolean;
  /** El Sheriff de Nottingham ya se movió este turno. */
  sherifUsedThisTurn?: boolean;
}

export interface PendingFate {
  actingPlayerId: PlayerId;
  targetPlayerIndex: number;
  revealedInstIds: CardInstId[];
  autoPlayedInstIds: CardInstId[];
}

export interface PendingCondition {
  reactingPlayerId: PlayerId;
  triggerType: ConditionTriggerType;
  eligibleCardInstIds: CardInstId[];
}

export interface GameState {
  players: PlayerState[];
  currentPlayerIndex: number;
  turnPhase: TurnPhase;
  winner: PlayerId | null;
  allCards: Record<CardInstId, CardInst>;
  roundNumber: number;
  usedActionSlotIndices: number[];
  pendingFate?: PendingFate;
  pendingCondition?: PendingCondition;
  pendingCuervo?: { playerId: PlayerId; locationId: LocationId };
  pendingDemosles?: { playerId: PlayerId; topCardIds: CardInstId[] };
  pendingAuroraHero?: { heroInstId: CardInstId; targetPlayerId: PlayerId; actingPlayerId: PlayerId; isHero?: boolean };
  pendingJaqueca?: { itemInstIds: CardInstId[]; actingPlayerId: PlayerId };
  /**
   * Reina de Corazones: selección de hasta `max` cartas propias para alternar su estado de
   * Postigo. `kind` indica la dirección: 'TO_WICKET' (Soldado → Postigo, usado por "Por orden
   * de la Reina" y el onHeroDiscarded del Gato Risón) o 'TO_SOLDADO' (Postigo → Soldado, usado
   * por el ON_PLAY del Gato Risón).
   */
  pendingWicketPick?: {
    actingPlayerId: PlayerId;
    kind: 'TO_WICKET' | 'TO_SOLDADO';
    sourceCardInstId?: CardInstId;
    eligibleInstIds: CardInstId[];
    max: number;
  };
  /** Reina de Corazones: "Furia" — selección de hasta `max` Héroes rivales para Menguar. */
  pendingShrinkPick?: {
    actingPlayerId: PlayerId;
    sourceCardInstId?: CardInstId;
    eligibleHeroInstIds: CardInstId[];
    max: number;
  };
  /**
   * Reina de Corazones: "Agrandar" — quien la juega elige a qué ubicación adyacente y qué casilla
   * de esa ubicación tapará también el Héroe agrandado.
   */
  pendingEnlargeTarget?: {
    actingPlayerId: PlayerId;
    heroInstId: CardInstId;
    eligible: { locationId: LocationId; slotIndex: number }[];
  };
  /**
   * Reina de Corazones: quien Mengua a un Héroe elige cuál de las casillas normalmente tapadas
   * sigue tapada (deja la otra libre). Cola porque Furia puede menguar hasta 2 Héroes a la vez —
   * se resuelve uno a uno (el primero de `queue`).
   */
  pendingShrinkSlotChoice?: {
    actingPlayerId: PlayerId;
    queue: { heroInstId: CardInstId; locationId: LocationId; eligibleSlotIndices: number[] }[];
  };
  /**
   * Reina de Corazones: "Efectúa el tiro" — las 5 cartas reveladas quedan visibles hasta que el
   * jugador las revise (el resultado, ganar o descartar, ya se aplicó al jugar la carta; esto es
   * solo para poder ver qué salió).
   */
  pendingShotReveal?: {
    actingPlayerId: PlayerId;
    revealedInstIds: CardInstId[];
    totalCost: number;
    wicketStrength: number;
    won: boolean;
  };
  trampaActive?: PlayerId;
  /** Trampa (fase 2): el aliado ya se movió; el jugador puede llevar a cabo un Vencer gratuito. */
  trampaVanquish?: PlayerId;
  log: string[];
}

export interface ConditionCtx {
  targetCardInstId?: CardInstId;
  allyInstId?: CardInstId;
  targetLocationId?: LocationId;
  playHero?: boolean;
  discardInstIds?: CardInstId[];
}

export type ConditionHandler = (state: GameState, reactingPlayerId: PlayerId, ctx: ConditionCtx) => GameState;

export interface VillainPlugin {
  id: VillainId;
  name: string;
  color: string;
  description: string;
  locations: LocationDef[];
  villainCardDefs: CardDef[];
  fateCardDefs: CardDef[];
  effects: EffectDef[];
  startingPower: number;
  startingLocationId: LocationId;
  handSize: number;
  checkWinCondition: (state: GameState, playerId: PlayerId) => boolean;
  getWinProgress: (state: GameState, player: PlayerState) => string;
  conditionHandlers?: Record<string, ConditionHandler>;
  onVanquish?: (state: GameState, playerId: PlayerId, heroInstId: CardInstId, heroLocId: LocationId) => GameState;
  onHeroDiscarded?: (state: GameState, playerId: PlayerId, heroInstId: CardInstId) => GameState;
  /**
   * Intenciones de IA propias del villano (además de las universales, ver
   * core/ai/intent/universalIntentions.ts). Punto de extensión: el planificador las mezcla con
   * las universales y elige la de mayor score() para gobernar el turno.
   */
  intentions?: IntentionDef[];
  /**
   * Cartas de la mano que ya no pueden aportar nada en lo que queda de partida (p. ej. buscadores
   * de Peter Pan cuando PP ya está en el reino). La IA las descarta proactivamente en las
   * casillas DISCARD para ciclar el mazo, y el contexto de IA las penaliza en mano.
   */
  deadCards?: (state: GameState, self: PlayerState) => CardInstId[];
  /**
   * Héroes/obstáculos que bloquean estructuralmente el único camino a la victoria de este
   * villano (no solo tapan ranuras) — ver core/ai/intent/structuralThreats.ts para cómo se
   * puntúan (penalización mientras vivan + bono estructural al vencerlos/acercarse).
   */
  structuralThreats?: StructuralThreatDef[];
  /**
   * Perfil de pesos dinámicos por categoría (ver VillainWeightProfile) — multiplica el score de
   * cada intención y de los términos de ActionScoreBreakdown que encajan con una de las 7
   * categorías. Si se omite, se usa DEFAULT_VILLAIN_WEIGHTS (todo en 1.0, no-op).
   */
  aiWeights?: VillainWeightProfile;
}

export interface GameSetupOptions {
  player1: { villainId: VillainId; isAI: boolean; name: string };
  player2: { villainId: VillainId; isAI: boolean; name: string };
  /** Índice del jugador que empieza (0 = J1, 1 = J2). Por defecto 0. El que NO empieza recibe el +1. */
  startingPlayerIndex?: 0 | 1;
}

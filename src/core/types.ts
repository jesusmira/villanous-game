export type PlayerId = string;
export type VillainId = 'maleficent' | 'hook' | 'jhon';
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
}

export interface EffectContext {
  actingPlayerId: PlayerId;
  cardInstId: CardInstId;
  targetCardInstId?: CardInstId;
  targetLocationId?: LocationId;
  auxiliaryInstIds?: CardInstId[];
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
  heroMinStrengthRequired?: number;
  /** El Héroe portador no puede jugarse ni moverse a esta ubicación (p. ej. Lady Kluck → La Prisión). */
  cannotEnterLocationId?: LocationId;
  requiresMultipleAlliesToVanquish?: boolean;
  conditionTrigger?: ConditionTriggerType;
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
   * Heurísticas de IA propias del villano. Punto de extensión usado por core/ai/evaluate.ts
   * para no tener que ramificar `if (villainId === 'x')` en código compartido entre villanos.
   */
  aiHeuristics?: {
    /**
     * Contribución de este villano a evaluateState(): recibe el score de poder/mano "genérico"
     * (capado con rendimientos decrecientes) y puede sumarle bonos propios o, si su condición de
     * victoria lo requiere (p. ej. el Príncipe Juan, que necesita acumular poder sin tope),
     * ignorarlo y devolver un valor propio por completo.
     */
    scoreState?: (state: GameState, player: PlayerState, genericPowerScore: number) => number;
    /**
     * Cuán urgente es para el RIVAL desbaratar a `self` (este villano), en función de su avance
     * hacia la victoria. Se invoca sobre el plugin del oponente. Por defecto 1.0 (neutral).
     */
    threatUrgency?: (state: GameState, self: PlayerState) => number;
    /**
     * FASE 2 (descarte inteligente): cartas de la mano que ya no pueden aportar nada en lo que
     * queda de partida (p. ej. buscadores de Peter Pan cuando PP ya está en el reino). La IA
     * las descarta proactivamente en las casillas DISCARD para ciclar el mazo, y evaluate.ts
     * penaliza tenerlas en mano.
     */
    deadHandCards?: (state: GameState, self: PlayerState) => CardInstId[];
  };
}

export interface GameSetupOptions {
  player1: { villainId: VillainId; isAI: boolean; name: string };
  player2: { villainId: VillainId; isAI: boolean; name: string };
  /** Índice del jugador que empieza (0 = J1, 1 = J2). Por defecto 0. El que NO empieza recibe el +1. */
  startingPlayerIndex?: 0 | 1;
}

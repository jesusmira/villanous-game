export type PlayerId = string;
export type VillainId = 'maleficent' | 'hook';
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
  // runtime position
  locationId?: LocationId;
  // attachment
  attachedToInstId?: CardInstId;
  attachedItemInstIds: CardInstId[];
  // accumulated runtime modifiers
  strengthModifier: number;
  costModifier: number;
  bonusThisTurn: number;
}

export interface EffectContext {
  actingPlayerId: PlayerId;
  cardInstId: CardInstId;
  targetCardInstId?: CardInstId;
  targetLocationId?: LocationId;
  auxiliaryInstIds?: CardInstId[];
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
  canVanquishFromAdjacent?: boolean;
  blocksHeroPlay?: boolean;
  blocksCursePlay?: boolean;
  heroMinStrengthRequired?: number;
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
  pendingAuroraHero?: { heroInstId: CardInstId; targetPlayerId: PlayerId; actingPlayerId: PlayerId };
  log: string[];
}

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
}

export interface GameSetupOptions {
  player1: { villainId: VillainId; isAI: boolean; name: string };
  player2: { villainId: VillainId; isAI: boolean; name: string };
}

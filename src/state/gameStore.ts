import { create } from 'zustand';
import { ActionType } from '../core/types';
import type { GameState, GameSetupOptions, LocationId, CardInstId } from '../core/types';
import { createInitialState, movePawn, gainPower, playCard, vanquish,
  moveItemAlly, moveHero, startFate, resolveFate, activateCard,
  discardFromHand, endActivatePhase, drawCards, skipMove, resolveAuroraHero,
  revertToActivate,
} from '../core/engine/GameEngine';
import { resolveCondition, resolveCuervo, resolveDemosles } from '../core/engine/PendingStateResolver';
import { runAITurn } from '../core/ai/AIPlayer';

interface GameStore {
  state: GameState | null;
  aiReplayQueue: GameState[];
  initGame: (opts: GameSetupOptions) => void;
  resetGame: () => void;
  // Turn actions
  doMovePawn: (locationId: LocationId) => void;
  doSkipMove: () => void;
  doGainPower: (slotIndex: number, amountOverride?: number) => void;
  doPlayCard: (cardInstId: CardInstId, slotIndex: number, targetLocationId: LocationId, ctx?: { targetCardInstId?: CardInstId; mapaInstId?: CardInstId }) => void;
  doVanquish: (heroInstId: CardInstId, allyInstIds: CardInstId[], slotIndex: number) => void;
  doMoveItemAlly: (cardInstId: CardInstId, targetLocationId: LocationId, slotIndex: number) => void;
  doMoveHero: (heroInstId: CardInstId, targetLocationId: LocationId, slotIndex: number) => void;
  doFateStart: (targetPlayerIndex: number, slotIndex: number) => void;
  doFateResolve: (chosenInstId: CardInstId, targetLocationId: LocationId, ctx?: { targetCardInstId?: CardInstId }) => void;
  doActivateCard: (cardInstId: CardInstId, slotIndex: number, ctx?: { targetLocationId?: LocationId; targetCardInstId?: CardInstId }) => void;
  doDiscardFromHand: (cardInstIds: CardInstId[], slotIndex: number) => void;
  doEndActivate: () => void;
  doDrawCards: () => void;
  doResolveCondition: (condInstId: string | null, ctx: Parameters<typeof resolveCondition>[2]) => void;
  doResolveAuroraHero: (targetLocationId: string) => void;
  doClearAuroraReveal: () => void;
  doRevertToActivate: () => void;
  doResolveCuervo: (action: ActionType, params: Parameters<typeof resolveCuervo>[2]) => void;
  doResolveDemosles: (discardIds: Parameters<typeof resolveDemosles>[1], keepIds: Parameters<typeof resolveDemosles>[2]) => void;
}

function maybeAutoResolveCondition(state: GameState): GameState {
  if (!state.pendingCondition) return state;
  const reacting = state.players.find(p => p.id === state.pendingCondition!.reactingPlayerId);
  if (!reacting?.isAI) return state;
  return resolveCondition(state, null); // AI always skips
}

function maybeAutoResolveCuervo(state: GameState): GameState {
  if (!state.pendingCuervo) return state;
  const player = state.players.find(p => p.id === state.pendingCuervo!.playerId);
  if (!player?.isAI) return state;
  return resolveCuervo(state, ActionType.GAIN_POWER, {});
}

function maybeAutoResolveDemosles(state: GameState): GameState {
  if (!state.pendingDemosles) return state;
  const player = state.players.find(p => p.id === state.pendingDemosles!.playerId);
  if (!player?.isAI) return state;
  // IA descarta todas las cartas reveladas sin manipular el orden del mazo
  return resolveDemosles(state, state.pendingDemosles.topCardIds, []);
}

function maybeRunAI(state: GameState): [GameState, GameState[]] {
  let s = maybeAutoResolveCondition(state);
  s = maybeAutoResolveCuervo(s);
  s = maybeAutoResolveDemosles(s);
  if (s.winner) return [s, []];
  const current = s.players[s.currentPlayerIndex];
  if (!current.isAI) return [s, []];

  const steps = runAITurn(s);
  let final = steps.length > 0 ? steps[steps.length - 1] : s;
  final = maybeAutoResolveCondition(final);
  final = maybeAutoResolveCuervo(final);
  final = maybeAutoResolveDemosles(final);
  if (steps.length > 0) steps[steps.length - 1] = final;
  return [final, steps];
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  aiReplayQueue: [],

  initGame: (opts) => {
    const initial = createInitialState(opts);
    const [ready] = maybeRunAI(initial);
    set({ state: ready, aiReplayQueue: [] });
  },

  resetGame: () => set({ state: null, aiReplayQueue: [] }),

  doMovePawn: (locationId) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const [next, steps] = maybeRunAI(movePawn(state, playerId, locationId));
    set({ state: next, aiReplayQueue: steps });
  },

  doSkipMove: () => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const [next, steps] = maybeRunAI(skipMove(state, playerId));
    set({ state: next, aiReplayQueue: steps });
  },

  doGainPower: (slotIndex, amountOverride) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    set({ state: gainPower(state, playerId, slotIndex, amountOverride) });
  },

  doPlayCard: (cardInstId, slotIndex, targetLocationId, ctx = {}) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    set({ state: maybeAutoResolveCondition(playCard(state, playerId, cardInstId, slotIndex, targetLocationId, ctx)) });
  },

  doVanquish: (heroInstId, allyInstIds, slotIndex) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    set({ state: maybeAutoResolveCondition(vanquish(state, playerId, heroInstId, allyInstIds, slotIndex)) });
  },

  doMoveItemAlly: (cardInstId, targetLocationId, slotIndex) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    set({ state: moveItemAlly(state, playerId, cardInstId, targetLocationId, slotIndex) });
  },

  doMoveHero: (heroInstId, targetLocationId, slotIndex) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    set({ state: moveHero(state, playerId, heroInstId, targetLocationId, slotIndex) });
  },

  doFateStart: (targetPlayerIndex, slotIndex) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    set({ state: startFate(state, playerId, targetPlayerIndex, slotIndex) });
  },

  doFateResolve: (chosenInstId, targetLocationId, ctx = {}) => {
    const { state } = get();
    if (!state) return;
    set({ state: resolveFate(state, chosenInstId, targetLocationId, ctx) });
  },

  doActivateCard: (cardInstId, slotIndex, ctx = {}) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const [next, steps] = maybeRunAI(activateCard(state, playerId, cardInstId, slotIndex, ctx));
    set({ state: next, aiReplayQueue: steps });
  },

  doDiscardFromHand: (cardInstIds, slotIndex) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    set({ state: discardFromHand(state, playerId, cardInstIds, slotIndex) });
  },

  doEndActivate: () => {
    const { state } = get();
    if (!state) return;
    set({ state: endActivatePhase(state) });
  },

  doDrawCards: () => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const [next, steps] = maybeRunAI(drawCards(state, playerId));
    set({ state: next, aiReplayQueue: steps });
  },

  doResolveCondition: (condInstId, ctx = {}) => {
    const { state } = get();
    if (!state) return;
    const [next, steps] = maybeRunAI(resolveCondition(state, condInstId, ctx));
    set({ state: next, aiReplayQueue: steps });
  },

  doResolveAuroraHero: (targetLocationId) => {
    const { state } = get();
    if (!state) return;
    set({ state: resolveAuroraHero(state, targetLocationId) });
  },

  doClearAuroraReveal: () => {
    const { state } = get();
    if (!state) return;
    set({ state: { ...state, pendingAuroraHero: undefined } });
  },

  doRevertToActivate: () => {
    const { state } = get();
    if (!state) return;
    set({ state: revertToActivate(state) });
  },

  doResolveCuervo: (action, params = {}) => {
    const { state } = get();
    if (!state) return;
    set({ state: resolveCuervo(state, action, params) });
  },

  doResolveDemosles: (discardIds, keepIds) => {
    const { state } = get();
    if (!state) return;
    set({ state: resolveDemosles(state, discardIds, keepIds) });
  },
}));

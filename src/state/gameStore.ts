import { create } from 'zustand';
import { ActionType } from '../core/types';
import type { GameState, GameSetupOptions, LocationId, CardInstId } from '../core/types';
import { createInitialState, movePawn, gainPower, playCard, vanquish,
  moveItemAlly, moveHero, startFate, resolveFate, activateCard,
  discardFromHand, endActivatePhase, drawCards, skipMove, resolveAuroraHero,
  revertToActivate, activateRaven, activateSherif, payToDiscardItem,
} from '../core/engine/GameEngine';
import {
  resolveCondition, resolveCuervo, resolveDemosles, resolveJaqueca,
  resolveTrampaMove, resolveTrampaVanquish, skipTrampa,
} from '../core/engine/PendingStateResolver';
import { startSession, recordAction, recordAITurn, abortSession } from './history/recorder';
import { getActiveProfile, refreshActiveProfile } from './history/profileCache';

interface AIWorkerResponse {
  final: GameState;
  steps: GameState[];
}

interface GameStore {
  state: GameState | null;
  aiReplayQueue: GameState[];
  isAIThinking: boolean;
  /** Índice del jugador inicial sorteado, mientras se muestra el modal de revelado. null = sin modal. */
  startReveal: number | null;
  initGame: (opts: GameSetupOptions) => void;
  dismissStartReveal: () => void;
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
  doPayToDiscardItem: (cardInstId: CardInstId) => void;
  doEndActivate: () => void;
  doDrawCards: () => void;
  doResolveCondition: (condInstId: string | null, ctx: Parameters<typeof resolveCondition>[2]) => void;
  doResolveAuroraHero: (targetLocationId: string) => void;
  doClearAuroraReveal: () => void;
  doRevertToActivate: () => void;
  doResolveCuervo: (action: ActionType, params: Parameters<typeof resolveCuervo>[2]) => void;
  doResolveDemosles: (discardIds: Parameters<typeof resolveDemosles>[1], keepIds: Parameters<typeof resolveDemosles>[2]) => void;
  doActivateRaven: (ravenInstId: CardInstId, targetLocationId: LocationId) => void;
  doActivateSherif: (sherifInstId: CardInstId, targetLocationId: LocationId) => void;
  doResolveJaqueca: (itemInstId: CardInstId) => void;
  doResolveTrampa: (allyInstId: CardInstId, targetLocationId: LocationId) => void;
  doTrampaVanquish: (heroInstId: CardInstId, allyInstIds: CardInstId[]) => void;
  doTrampaSkip: () => void;
}

// ─── Web Worker ───────────────────────────────────────────────────────────────

const aiWorker = new Worker(
  new URL('../core/ai/aiWorker.ts', import.meta.url),
  { type: 'module' },
);

// Returns true when AI processing is needed (either current player is AI, or a
// pending state requires an AI to react — e.g. pendingCondition.reactingPlayerId).
function needsAIProcessing(state: GameState): boolean {
  if (state.winner) return false;
  if (state.players[state.currentPlayerIndex].isAI) return true;
  if (state.pendingCondition) {
    const r = state.players.find(p => p.id === state.pendingCondition!.reactingPlayerId);
    if (r?.isAI) return true;
  }
  if (state.pendingCuervo) {
    const p = state.players.find(p => p.id === state.pendingCuervo!.playerId);
    if (p?.isAI) return true;
  }
  if (state.pendingDemosles) {
    const p = state.players.find(p => p.id === state.pendingDemosles!.playerId);
    if (p?.isAI) return true;
  }
  if (state.pendingJaqueca) {
    const p = state.players.find(p => p.id === state.pendingJaqueca!.actingPlayerId);
    if (p?.isAI) return true;
  }
  return false;
}

// Dispatches state to the AI worker. Returns the Zustand partial to set
// immediately (the pre-AI state is shown while the worker computes).
// `pendingAIInput` remembers what was sent so the onmessage handler can log the
// AI's turn as a before → after pair once the worker responds.
let pendingAIInput: GameState | null = null;

function dispatchAI(next: GameState): Partial<GameStore> {
  pendingAIInput = next;
  aiWorker.postMessage({ state: next, profile: getActiveProfile() });
  return { state: next, aiReplayQueue: [], isAIThinking: true };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  aiReplayQueue: [],
  isAIThinking: false,
  startReveal: null,

  initGame: (opts) => {
    // Sorteo aleatorio del jugador inicial (salvo que se fuerce desde opts).
    const startingPlayerIndex = opts.startingPlayerIndex ?? (Math.random() < 0.5 ? 0 : 1);
    const initial = createInitialState({ ...opts, startingPlayerIndex });
    startSession(initial);
    refreshActiveProfile(); // Fase 2: relee el historial para que la IA use el perfil más reciente.
    // La partida NO arranca todavía: espera a que el jugador acepte el sorteo.
    // Si empieza la IA, se lanzará al cerrar el modal (dismissStartReveal).
    set({ state: initial, aiReplayQueue: [], isAIThinking: false, startReveal: startingPlayerIndex });
  },

  dismissStartReveal: () => {
    const { state } = get();
    // Al aceptar: si le toca empezar a la IA (o hay algo pendiente para ella), ahora sí la arrancamos.
    if (state && needsAIProcessing(state)) {
      set({ ...dispatchAI(state), startReveal: null });
    } else {
      set({ startReveal: null });
    }
  },

  resetGame: () => {
    const { state } = get();
    // Si la partida no había terminado (ganador ya registrado por recordAction), se
    // cierra igualmente como "abandonada" para no perder las acciones ya grabadas.
    if (state && !state.winner) abortSession(state);
    set({ state: null, aiReplayQueue: [], isAIThinking: false, startReveal: null });
  },

  doMovePawn: (locationId) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = movePawn(state, playerId, locationId);
    recordAction(state, next, playerId, 'MOVE_PAWN', { locationId });
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doSkipMove: () => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = skipMove(state, playerId);
    recordAction(state, next, playerId, 'SKIP_MOVE');
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doGainPower: (slotIndex, amountOverride) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = gainPower(state, playerId, slotIndex, amountOverride);
    recordAction(state, next, playerId, 'GAIN_POWER', { slotIndex, amountOverride });
    set({ state: next });
  },

  doPlayCard: (cardInstId, slotIndex, targetLocationId, ctx = {}) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const cardName = state.allCards[cardInstId]?.name;
    const next = playCard(state, playerId, cardInstId, slotIndex, targetLocationId, ctx);
    recordAction(state, next, playerId, 'PLAY_CARD', { cardInstId, cardName, slotIndex, targetLocationId });
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doVanquish: (heroInstId, allyInstIds, slotIndex) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = vanquish(state, playerId, heroInstId, allyInstIds, slotIndex);
    recordAction(state, next, playerId, 'VANQUISH', { heroInstId, allyInstIds, slotIndex });
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doMoveItemAlly: (cardInstId, targetLocationId, slotIndex) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = moveItemAlly(state, playerId, cardInstId, targetLocationId, slotIndex);
    recordAction(state, next, playerId, 'MOVE_ITEM_ALLY', { cardInstId, targetLocationId, slotIndex });
    set({ state: next });
  },

  doMoveHero: (heroInstId, targetLocationId, slotIndex) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = moveHero(state, playerId, heroInstId, targetLocationId, slotIndex);
    recordAction(state, next, playerId, 'MOVE_HERO', { heroInstId, targetLocationId, slotIndex });
    set({ state: next });
  },

  doFateStart: (targetPlayerIndex, slotIndex) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = startFate(state, playerId, targetPlayerIndex, slotIndex);
    recordAction(state, next, playerId, 'FATE_START', { targetPlayerIndex, slotIndex });
    set({ state: next });
  },

  doFateResolve: (chosenInstId, targetLocationId, ctx = {}) => {
    const { state } = get();
    if (!state) return;
    const actorPlayerId = state.pendingFate?.actingPlayerId;
    const chosenCardName = state.allCards[chosenInstId]?.name;
    const next = resolveFate(state, chosenInstId, targetLocationId, ctx);
    recordAction(state, next, actorPlayerId, 'FATE_RESOLVE', { chosenInstId, chosenCardName, targetLocationId });
    set({ state: next });
  },

  doActivateCard: (cardInstId, slotIndex, ctx = {}) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = activateCard(state, playerId, cardInstId, slotIndex, ctx);
    recordAction(state, next, playerId, 'ACTIVATE_CARD', { cardInstId, slotIndex });
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doDiscardFromHand: (cardInstIds, slotIndex) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = discardFromHand(state, playerId, cardInstIds, slotIndex);
    recordAction(state, next, playerId, 'DISCARD', { cardInstIds, slotIndex });
    set({ state: next });
  },

  doPayToDiscardItem: (cardInstId) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = payToDiscardItem(state, playerId, cardInstId);
    recordAction(state, next, playerId, 'PAY_TO_DISCARD_ITEM', { cardInstId });
    set({ state: next });
  },

  doEndActivate: () => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = endActivatePhase(state);
    recordAction(state, next, playerId, 'END_ACTIVATE');
    set({ state: next });
  },

  doDrawCards: () => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = drawCards(state, playerId);
    recordAction(state, next, playerId, 'DRAW_CARDS');
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next, aiReplayQueue: [] });
  },

  doResolveCondition: (condInstId, ctx = {}) => {
    const { state } = get();
    if (!state) return;
    const actorPlayerId = state.pendingCondition?.reactingPlayerId;
    const next = resolveCondition(state, condInstId, ctx);
    recordAction(state, next, actorPlayerId, 'RESOLVE_CONDITION', { condInstId });
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doResolveAuroraHero: (targetLocationId) => {
    const { state } = get();
    if (!state) return;
    const actorPlayerId = state.pendingAuroraHero?.actingPlayerId;
    const next = resolveAuroraHero(state, targetLocationId);
    recordAction(state, next, actorPlayerId, 'RESOLVE_AURORA_HERO', { targetLocationId });
    set({ state: next });
  },

  doClearAuroraReveal: () => {
    const { state } = get();
    if (!state) return;
    set({ state: { ...state, pendingAuroraHero: undefined } });
  },

  doRevertToActivate: () => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = revertToActivate(state);
    recordAction(state, next, playerId, 'REVERT_TO_ACTIVATE');
    set({ state: next });
  },

  doResolveCuervo: (action, params = {}) => {
    const { state } = get();
    if (!state) return;
    const actorPlayerId = state.pendingCuervo?.playerId;
    const next = resolveCuervo(state, action, params);
    recordAction(state, next, actorPlayerId, 'RESOLVE_CUERVO', { action });
    set({ state: next });
  },

  doResolveDemosles: (discardIds, keepIds) => {
    const { state } = get();
    if (!state) return;
    const actorPlayerId = state.pendingDemosles?.playerId;
    const next = resolveDemosles(state, discardIds, keepIds);
    recordAction(state, next, actorPlayerId, 'RESOLVE_DEMOSLES', { discardIds, keepIds });
    set({ state: next });
  },

  doActivateRaven: (ravenInstId, targetLocationId) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = activateRaven(state, playerId, ravenInstId, targetLocationId);
    recordAction(state, next, playerId, 'ACTIVATE_RAVEN', { ravenInstId, targetLocationId });
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doActivateSherif: (sherifInstId, targetLocationId) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = activateSherif(state, playerId, sherifInstId, targetLocationId);
    recordAction(state, next, playerId, 'ACTIVATE_SHERIF', { sherifInstId, targetLocationId });
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doResolveJaqueca: (itemInstId) => {
    const { state } = get();
    if (!state) return;
    const actorPlayerId = state.pendingJaqueca?.actingPlayerId;
    const next = resolveJaqueca(state, itemInstId);
    recordAction(state, next, actorPlayerId, 'RESOLVE_JAQUECA', { itemInstId });
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doResolveTrampa: (allyInstId, targetLocationId) => {
    const { state } = get();
    if (!state || !state.trampaActive) return;
    const actorPlayerId = state.trampaActive;
    // Mueve el Aliado y deja pendiente el Vencer gratuito (trampaVanquish) para la UI.
    const next = resolveTrampaMove(state, allyInstId, targetLocationId);
    recordAction(state, next, actorPlayerId, 'RESOLVE_TRAMPA', { allyInstId, targetLocationId });
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doTrampaVanquish: (heroInstId, allyInstIds) => {
    const { state } = get();
    if (!state || !state.trampaVanquish) return;
    const actorPlayerId = state.trampaVanquish;
    const next = resolveTrampaVanquish(state, heroInstId, allyInstIds);
    recordAction(state, next, actorPlayerId, 'TRAMPA_VANQUISH', { heroInstId, allyInstIds });
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doTrampaSkip: () => {
    const { state } = get();
    if (!state) return;
    const actorPlayerId = state.trampaActive;
    const next = skipTrampa(state);
    recordAction(state, next, actorPlayerId, 'TRAMPA_SKIP');
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },
}));

// Worker response: apply final state and replay steps for animation.
aiWorker.onmessage = (e: MessageEvent<AIWorkerResponse>) => {
  const aiInput = pendingAIInput;
  pendingAIInput = null;
  if (aiInput && e.data.steps.length > 0) {
    const aiPlayerId = aiInput.players[aiInput.currentPlayerIndex].id;
    recordAITurn(aiInput, e.data.steps, aiPlayerId);
  }
  useGameStore.setState({
    state: e.data.final,
    aiReplayQueue: e.data.steps,
    isAIThinking: false,
  });
};

import { create } from 'zustand';
import { ActionType } from '../core/types';
import type { GameState, GameSetupOptions, LocationId, CardInstId } from '../core/types';
import { createInitialState, movePawn, gainPower, playCard, vanquish,
  moveItemAlly, moveHero, startFate, resolveFate, activateCard,
  discardFromHand, endActivatePhase, drawCards, skipMove, resolveAuroraHero,
  revertToActivate, activateRaven, activateSherif,
} from '../core/engine/GameEngine';
import { resolveCondition, resolveCuervo, resolveDemosles, resolveJaqueca } from '../core/engine/PendingStateResolver';

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
function dispatchAI(next: GameState): Partial<GameStore> {
  aiWorker.postMessage(next);
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

  resetGame: () => set({ state: null, aiReplayQueue: [], isAIThinking: false, startReveal: null }),

  doMovePawn: (locationId) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = movePawn(state, playerId, locationId);
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doSkipMove: () => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = skipMove(state, playerId);
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
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
    const next = playCard(state, playerId, cardInstId, slotIndex, targetLocationId, ctx);
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doVanquish: (heroInstId, allyInstIds, slotIndex) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = vanquish(state, playerId, heroInstId, allyInstIds, slotIndex);
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
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
    const next = activateCard(state, playerId, cardInstId, slotIndex, ctx);
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
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
    const next = drawCards(state, playerId);
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next, aiReplayQueue: [] });
  },

  doResolveCondition: (condInstId, ctx = {}) => {
    const { state } = get();
    if (!state) return;
    const next = resolveCondition(state, condInstId, ctx);
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
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

  doActivateRaven: (ravenInstId, targetLocationId) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = activateRaven(state, playerId, ravenInstId, targetLocationId);
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doActivateSherif: (sherifInstId, targetLocationId) => {
    const { state } = get();
    if (!state) return;
    const playerId = state.players[state.currentPlayerIndex].id;
    const next = activateSherif(state, playerId, sherifInstId, targetLocationId);
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doResolveJaqueca: (itemInstId) => {
    const { state } = get();
    if (!state) return;
    const next = resolveJaqueca(state, itemInstId);
    set(needsAIProcessing(next) ? dispatchAI(next) : { state: next });
  },

  doResolveTrampa: (allyInstId, targetLocationId) => {
    const { state } = get();
    if (!state || !state.trampaActive) return;
    const playerId = state.trampaActive;
    const allyCard = state.allCards[allyInstId];
    if (!allyCard || allyCard.ownerId !== playerId) return;

    let s = state;
    // Mover aliado a la ubicación destino
    const srcLocId = allyCard.locationId;
    if (!srcLocId) return;

    // Remover del lugar de origen
    const srcLocState = s.players.find(p => p.id === playerId)?.locationStates[srcLocId];
    if (!srcLocState) return;
    s = {
      ...s,
      players: s.players.map(p =>
        p.id === playerId
          ? {
              ...p,
              locationStates: {
                ...p.locationStates,
                [srcLocId]: {
                  ...srcLocState,
                  villainCardInstIds: srcLocState.villainCardInstIds.filter(id => id !== allyInstId),
                },
              },
            }
          : p,
      ),
    };

    // Agregar a la ubicación destino
    const destPlayer = s.players.find(p => p.id === playerId);
    if (!destPlayer) return;
    const destLocState = destPlayer.locationStates[targetLocationId];
    if (!destLocState) return;

    s = {
      ...s,
      allCards: { ...s.allCards, [allyInstId]: { ...allyCard, locationId: targetLocationId } },
      players: s.players.map(p =>
        p.id === playerId
          ? {
              ...p,
              locationStates: {
                ...p.locationStates,
                [targetLocationId]: {
                  ...destLocState,
                  villainCardInstIds: [...destLocState.villainCardInstIds, allyInstId],
                },
              },
            }
          : p,
      ),
    };

    // Limpiar trampaActive
    s = { ...s, trampaActive: undefined };

    set(needsAIProcessing(s) ? dispatchAI(s) : { state: s, aiReplayQueue: [] });
  },
}));

// Worker response: apply final state and replay steps for animation.
aiWorker.onmessage = (e: MessageEvent<AIWorkerResponse>) => {
  useGameStore.setState({
    state: e.data.final,
    aiReplayQueue: e.data.steps,
    isAIThinking: false,
  });
};

import { createInitialState } from '../../core/engine/actions/init';
import type { GameState, PlayerId, CardInstId, LocationId, TurnPhase } from '../../core/types';

/** Estado base: Maléfica (P1, humano) vs Garfio (P2, IA) */
export function makeState(): GameState {
  return createInitialState({
    player1: { villainId: 'maleficent', isAI: false, name: 'Maléfica' },
    player2: { villainId: 'hook', isAI: true, name: 'Garfio' },
  });
}

/** ID del jugador Maléfica */
export function malId(state: GameState): PlayerId {
  return state.players.find(p => p.villainId === 'maleficent')!.id;
}

/** ID del jugador Garfio */
export function hookId(state: GameState): PlayerId {
  return state.players.find(p => p.villainId === 'hook')!.id;
}

/** Busca el primer instId cuyo defId empiece por `prefix` en todo el estado */
export function findCard(state: GameState, prefix: string): CardInstId | undefined {
  return Object.keys(state.allCards).find(id => state.allCards[id]?.defId.startsWith(prefix));
}

/** Busca el primer instId con `prefix` que esté en el mazo o descarte del jugador (no en mano) */
export function findInDeck(state: GameState, playerId: PlayerId, prefix: string): CardInstId | undefined {
  const p = state.players.find(pl => pl.id === playerId)!;
  return [...p.villainDeckInstIds, ...p.villainDiscardInstIds, ...p.fateDeckInstIds, ...p.fateDiscardInstIds]
    .find(id => state.allCards[id]?.defId.startsWith(prefix));
}

/** Mueve una carta (de mazo/descarte) a la mano del jugador */
export function putInHand(state: GameState, playerId: PlayerId, instId: CardInstId): GameState {
  return {
    ...state,
    players: state.players.map(p => {
      if (p.id !== playerId) return p;
      return {
        ...p,
        handInstIds: [...p.handInstIds.filter(id => id !== instId), instId],
        villainDeckInstIds: p.villainDeckInstIds.filter(id => id !== instId),
        villainDiscardInstIds: p.villainDiscardInstIds.filter(id => id !== instId),
        fateDeckInstIds: p.fateDeckInstIds.filter(id => id !== instId),
        fateDiscardInstIds: p.fateDiscardInstIds.filter(id => id !== instId),
      };
    }),
    allCards: { ...state.allCards, [instId]: { ...state.allCards[instId], locationId: undefined } },
  };
}

/** Coloca una carta de villano en una ubicación, sin validación de reglas */
export function placeVillainCard(
  state: GameState, playerId: PlayerId, locId: LocationId, instId: CardInstId,
): GameState {
  const player = state.players.find(p => p.id === playerId)!;
  const ls = player.locationStates[locId];
  return {
    ...state,
    players: state.players.map(p => {
      if (p.id !== playerId) return p;
      return {
        ...p,
        handInstIds: p.handInstIds.filter(id => id !== instId),
        villainDeckInstIds: p.villainDeckInstIds.filter(id => id !== instId),
        locationStates: {
          ...p.locationStates,
          [locId]: { ...ls, villainCardInstIds: [...ls.villainCardInstIds, instId] },
        },
      };
    }),
    allCards: { ...state.allCards, [instId]: { ...state.allCards[instId], locationId: locId } },
  };
}

/** Coloca un héroe en una ubicación del reino del jugador indicado */
export function placeHeroInLoc(
  state: GameState, playerId: PlayerId, locId: LocationId, instId: CardInstId,
): GameState {
  const player = state.players.find(p => p.id === playerId)!;
  const ls = player.locationStates[locId];
  return {
    ...state,
    players: state.players.map(p => {
      if (p.id !== playerId) return p;
      return {
        ...p,
        fateDeckInstIds: p.fateDeckInstIds.filter(id => id !== instId),
        fateDiscardInstIds: p.fateDiscardInstIds.filter(id => id !== instId),
        locationStates: {
          ...p.locationStates,
          [locId]: { ...ls, heroCardInstIds: [...ls.heroCardInstIds, instId] },
        },
      };
    }),
    allCards: { ...state.allCards, [instId]: { ...state.allCards[instId], locationId: locId } },
  };
}

/** Establece la fase de turno */
export function setPhase(state: GameState, phase: TurnPhase): GameState {
  return { ...state, turnPhase: phase };
}

/** Establece el poder del jugador */
export function setPower(state: GameState, playerId: PlayerId, power: number): GameState {
  return {
    ...state,
    players: state.players.map(p => p.id === playerId ? { ...p, power } : p),
  };
}

/** Posiciona el peón en una ubicación sin disparar efectos */
export function setPawn(state: GameState, playerId: PlayerId, locId: LocationId): GameState {
  return {
    ...state,
    players: state.players.map(p => p.id === playerId ? { ...p, pawnLocationId: locId } : p),
  };
}

/** Hace que sea el turno del jugador indicado */
export function setCurrentPlayer(state: GameState, playerId: PlayerId): GameState {
  return {
    ...state,
    currentPlayerIndex: state.players.findIndex(p => p.id === playerId),
    usedActionSlotIndices: [],
  };
}

import { CardType } from '../types';
import type {
  GameState, PlayerState, CardInst, CardInstId,
  PlayerId, LocationId, LocationState,
} from '../types';
import { getPlugin, getEffectDef } from '../villains/registry';

/** True si el Héroe tiene un efecto que le impide entrar en `locationId` (p. ej. Lady Kluck → La Prisión). */
export function heroBlockedFromLocation(
  state: GameState,
  heroInstId: CardInstId,
  locationId: LocationId,
): boolean {
  return (state.allCards[heroInstId]?.effectIds ?? []).some(
    effId => getEffectDef(effId)?.cannotEnterLocationId === locationId,
  );
}

export function computeKingdomPowerGainMod(
  state: GameState,
  playerId: PlayerId,
): number {
  const player = getPlayer(state, playerId);
  let mod = 0;
  for (const locState of Object.values(player.locationStates)) {
    for (const cId of [...locState.villainCardInstIds, ...locState.heroCardInstIds]) {
      for (const effId of (state.allCards[cId]?.effectIds ?? [])) {
        const eff = getEffectDef(effId);
        if (eff?.computePowerGainModifier) {
          mod += eff.computePowerGainModifier(state, playerId, cId);
        }
      }
    }
  }
  return mod;
}

export function applyPowerGain(
  state: GameState,
  playerId: PlayerId,
  rawAmount: number,
): GameState {
  if (rawAmount <= 0) {
    return updatePlayer(state, playerId, { power: getPlayer(state, playerId).power + rawAmount });
  }
  const mod = computeKingdomPowerGainMod(state, playerId);
  const effective = Math.max(0, rawAmount + mod);
  return updatePlayer(state, playerId, { power: getPlayer(state, playerId).power + effective });
}

export function computeKingdomCostMod(
  state: GameState,
  playerId: PlayerId,
  card: CardInst,
  targetLocationId: LocationId,
): number {
  const player = getPlayer(state, playerId);
  let mod = 0;
  for (const locState of Object.values(player.locationStates)) {
    for (const cId of locState.villainCardInstIds) {
      for (const effId of (state.allCards[cId]?.effectIds ?? [])) {
        const eff = getEffectDef(effId);
        if (eff?.computePlayCostModifier) {
          mod += eff.computePlayCostModifier(state, playerId, card, cId, targetLocationId);
        }
      }
    }
  }
  return mod;
}

export function getPlayer(state: GameState, playerId: PlayerId): PlayerState {
  const p = state.players.find(p => p.id === playerId);
  if (!p) throw new Error(`Player ${playerId} not found`);
  return p;
}

export function getCurrentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex];
}

export function getOpponent(state: GameState, playerId: PlayerId): PlayerState {
  const opp = state.players.find(p => p.id !== playerId);
  if (!opp) throw new Error('No opponent found');
  return opp;
}

export function updatePlayer(
  state: GameState,
  playerId: PlayerId,
  update: Partial<PlayerState>,
): GameState {
  return {
    ...state,
    players: state.players.map(p => (p.id === playerId ? { ...p, ...update } : p)),
  };
}

export function updateLocationState(
  state: GameState,
  playerId: PlayerId,
  locationId: LocationId,
  update: Partial<LocationState>,
): GameState {
  const player = getPlayer(state, playerId);
  const current = player.locationStates[locationId];
  return updatePlayer(state, playerId, {
    locationStates: {
      ...player.locationStates,
      [locationId]: { ...current, ...update },
    },
  });
}

export function updateCard(
  state: GameState,
  instId: CardInstId,
  update: Partial<CardInst>,
): GameState {
  return {
    ...state,
    allCards: { ...state.allCards, [instId]: { ...state.allCards[instId], ...update } },
  };
}

export function addLog(state: GameState, msg: string): GameState {
  return { ...state, log: [...state.log, msg] };
}

export function getEffectiveStrength(state: GameState, instId: CardInstId): number {
  const card = state.allCards[instId];
  if (!card || card.baseStrength === undefined) return 0;
  let strength = card.baseStrength + card.strengthModifier + (card.bonusThisTurn ?? 0);

  // Resolve CONTINUOUS strength bonuses declared on this card's effects
  for (const effId of card.effectIds) {
    const eff = getEffectDef(effId);
    if (eff?.computeStrengthBonus) {
      strength += eff.computeStrengthBonus(state, instId);
    }
  }
  return Math.max(0, strength);
}

// Move a card instance from its current position in any deck/hand array.
export function removeFromAllDecks(
  state: GameState,
  playerId: PlayerId,
  instId: CardInstId,
): GameState {
  const player = getPlayer(state, playerId);
  return updatePlayer(state, playerId, {
    handInstIds: player.handInstIds.filter(id => id !== instId),
    villainDeckInstIds: player.villainDeckInstIds.filter(id => id !== instId),
    villainDiscardInstIds: player.villainDiscardInstIds.filter(id => id !== instId),
    fateDeckInstIds: player.fateDeckInstIds.filter(id => id !== instId),
    fateDiscardInstIds: player.fateDiscardInstIds.filter(id => id !== instId),
  });
}

export function discardCardFromKingdom(
  state: GameState,
  instId: CardInstId,
): GameState {
  const card = state.allCards[instId];
  if (!card) return state;

  const player = getPlayer(state, card.ownerId);

  // Remove from location state
  let s = state;
  if (card.locationId) {
    const locState = player.locationStates[card.locationId];
    if (locState) {
      s = updateLocationState(s, card.ownerId, card.locationId, {
        villainCardInstIds: locState.villainCardInstIds.filter(id => id !== instId),
        heroCardInstIds: locState.heroCardInstIds.filter(id => id !== instId),
      });
    }
  }

  // Discard attached items along with the card (per rules: items go to discard when ally is defeated)
  for (const itemId of card.attachedItemInstIds) {
    s = discardCardFromKingdom(s, itemId);
  }
  if (card.attachedToInstId) {
    const host = s.allCards[card.attachedToInstId];
    if (host) {
      s = updateCard(s, card.attachedToInstId, {
        attachedItemInstIds: host.attachedItemInstIds.filter(id => id !== instId),
        strengthModifier: host.strengthModifier - card.strengthModifier,
      });
    }
  }

  // Determine correct discard pile
  const discard =
    card.deck === 'FATE'
      ? [...getPlayer(s, card.ownerId).fateDiscardInstIds, instId]
      : [...getPlayer(s, card.ownerId).villainDiscardInstIds, instId];

  const discardKey =
    card.deck === 'FATE' ? 'fateDiscardInstIds' : 'villainDiscardInstIds';

  s = updatePlayer(s, card.ownerId, { [discardKey]: discard });
  s = updateCard(s, instId, { locationId: undefined, attachedToInstId: undefined });
  return s;
}

/**
 * Mueve los Objetos adjuntos a `instId` junto con él, a `targetLocationId`. Por regla, un
 * Objeto adjunto viaja con su portador (solo se descarta si el portador se descarta — eso ya
 * lo cascada `discardCardFromKingdom`). Cualquier acción que reubique un Aliado/Héroe debe
 * llamar a esto, para todos los villanos.
 */
export function moveAttachedItems(state: GameState, instId: CardInstId, targetLocationId: LocationId): GameState {
  const card = state.allCards[instId];
  if (!card || card.attachedItemInstIds.length === 0) return state;
  let s = state;
  for (const itemId of card.attachedItemInstIds) {
    const item = s.allCards[itemId];
    if (!item?.locationId || item.locationId === targetLocationId) continue;
    const srcLs = getPlayer(s, item.ownerId).locationStates[item.locationId];
    s = updateLocationState(s, item.ownerId, item.locationId, {
      villainCardInstIds: srcLs.villainCardInstIds.filter(id => id !== itemId),
    });
    const destLs = getPlayer(s, item.ownerId).locationStates[targetLocationId];
    s = updateLocationState(s, item.ownerId, targetLocationId, {
      villainCardInstIds: [...destLs.villainCardInstIds, itemId],
    });
    s = updateCard(s, itemId, { locationId: targetLocationId });
  }
  return s;
}

export function countCursesInKingdom(state: GameState, playerId: PlayerId): number {
  const player = getPlayer(state, playerId);
  let count = 0;
  for (const locState of Object.values(player.locationStates)) {
    for (const id of locState.villainCardInstIds) {
      if (state.allCards[id]?.cardType === CardType.CURSE) count++;
    }
  }
  return count;
}

export function findCardInFateDeck(
  state: GameState,
  playerId: PlayerId,
  defId: string,
): CardInstId | undefined {
  const player = getPlayer(state, playerId);
  // Check deck first, then discard
  const inDeck = player.fateDeckInstIds.find(id => state.allCards[id]?.defId === defId);
  if (inDeck) return inDeck;
  return player.fateDiscardInstIds.find(id => state.allCards[id]?.defId === defId);
}

export function checkWin(state: GameState): GameState {
  for (const player of state.players) {
    const plugin = getPlugin(player.villainId);
    if (plugin.checkWinCondition(state, player.id)) {
      return addLog({ ...state, winner: player.id }, `¡${player.name} ha ganado!`);
    }
  }
  return state;
}

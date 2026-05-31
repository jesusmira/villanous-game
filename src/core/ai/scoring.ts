import { ActionType, CardType } from '../types';
import type { GameState, PlayerState, CardInstId, LocationId } from '../types';
import { getPlugin, getEffectDef } from '../villains/registry';
import { CardDefId } from '../villains/effectIds';
import { HookLocationId } from '../villains/hook/cards';
import { getAvailableSlotIndices, getActionAtSlot, computeKingdomCostMod } from '../engine/stateHelpers';

export function scoreLocation(state: GameState, player: PlayerState, locId: LocationId): number {
  const plugin = getPlugin(player.villainId);
  const loc = plugin.locations.find(l => l.id === locId);
  if (!loc) return 0;
  const locState = player.locationStates[locId];
  if (locState.isLocked) return -100;
  if (locId === player.pawnLocationId) return -100;

  let score = 0;
  const available = getAvailableSlotIndices(state, player.id, locId);

  for (const idx of available) {
    const slot = getActionAtSlot(state, player.id, idx);
    if (!slot) continue;
    switch (slot.type) {
      case ActionType.GAIN_POWER:
        score += slot.value ?? 2;
        break;
      case ActionType.PLAY_CARD:
        score += player.handInstIds.length > 0 ? 3 : 1;
        if (player.villainId === 'maleficent') {
          const hasCurse = player.handInstIds.some(
            id => state.allCards[id]?.cardType === CardType.CURSE,
          );
          if (hasCurse) score += 5;
        }
        break;
      case ActionType.VANQUISH: {
        const heroes = Object.values(player.locationStates).flatMap(ls => ls.heroCardInstIds);
        if (heroes.length > 0) score += 4;
        if (player.villainId === 'hook') {
          const ppAtJolly = player.locationStates[HookLocationId.JOLLY_ROGER]?.heroCardInstIds.some(
            id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN,
          );
          if (ppAtJolly) score += 20;
        }
        break;
      }
      case ActionType.FATE:
        score += 2;
        break;
      case ActionType.MOVE_ITEM_ALLY:
        score += 2;
        break;
      case ActionType.MOVE_HERO:
        if (player.villainId === 'hook') {
          const ppExists = Object.values(player.locationStates).some(ls =>
            ls.heroCardInstIds.some(id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN),
          );
          if (ppExists) score += 10;
        }
        break;
      case ActionType.ACTIVATE_CARD:
        score += 2;
        break;
      case ActionType.DISCARD:
        score += 1;
        break;
    }
  }
  return score;
}

export function scoreCard(state: GameState, player: PlayerState, cardInstId: CardInstId): number {
  const card = state.allCards[cardInstId];
  if (!card) return 0;
  const kingdomCostMod = computeKingdomCostMod(state, player.id, card, player.pawnLocationId);
  const effectiveCost = Math.max(0, card.baseCost + card.costModifier + kingdomCostMod);
  if (player.power < effectiveCost) return -1;

  let score = 1;

  if (player.villainId === 'maleficent') {
    if (card.cardType === CardType.CURSE) {
      const locIds = Object.keys(player.locationStates);
      const locsMissingCurse = locIds.filter(lid => {
        const ls = player.locationStates[lid];
        return !ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
      });
      score += locsMissingCurse.length * 5;
    }
    if (card.cardType === CardType.ALLY) score += 2;
  }

  if (player.villainId === 'hook') {
    const ppInKingdom = Object.values(player.locationStates).some(ls =>
      ls.heroCardInstIds.some(id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN),
    );
    const ppAtJolly = player.locationStates[HookLocationId.JOLLY_ROGER]?.heroCardInstIds.some(
      id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN,
    );

    if (['hook_v_rival_1', 'hook_v_rival_2', 'hook_v_rival_3'].includes(card.defId)) {
      score += ppInKingdom ? 2 : 15;
    }
    if (card.defId === 'hook_v_mapa') {
      score += player.locationStates[HookLocationId.HANGMAN]?.isLocked ? 12 : 0;
    }
    if (card.defId === 'hook_v_starkey') {
      score += ppInKingdom && !ppAtJolly ? 8 : 0;
    }
    if (card.cardType === CardType.ALLY) score += 3;
  }

  return score;
}

export function pickBestPlayTarget(
  state: GameState,
  player: PlayerState,
  cardInstId: CardInstId,
): LocationId {
  const plugin = getPlugin(player.villainId);
  const card = state.allCards[cardInstId];

  if (card.cardType === CardType.CURSE) {
    const needsCurse = plugin.locations.find(loc => {
      const ls = player.locationStates[loc.id];
      if (ls.isLocked) return false;
      if (ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE)) return false;
      const curseBlocked = ls.heroCardInstIds.some(id =>
        state.allCards[id]?.effectIds.some(effId => getEffectDef(effId)?.blocksCursePlay),
      );
      return !curseBlocked;
    });
    if (needsCurse) return needsCurse.id;
  }

  if (card.cardType === CardType.ALLY) {
    const withHero = plugin.locations.find(loc => {
      const ls = player.locationStates[loc.id];
      return !ls.isLocked && ls.heroCardInstIds.length > 0;
    });
    if (withHero) return withHero.id;
  }

  const pawnLoc = player.locationStates[player.pawnLocationId];
  if (!pawnLoc?.isLocked) return player.pawnLocationId;
  return plugin.locations.find(l => !player.locationStates[l.id]?.isLocked)?.id
    ?? plugin.locations[0].id;
}

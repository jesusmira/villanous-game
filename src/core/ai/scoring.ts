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
        if (heroes.length > 0) {
          // Prioritize vanquish more if there are strong heroes
          const strongHeroes = heroes.filter(id => (state.allCards[id]?.baseStrength ?? 0) >= 4);
          score += 4 + (strongHeroes.length * 2) + heroes.length;
        }
        if (player.villainId === 'hook') {
          const ppAtJolly = player.locationStates[HookLocationId.JOLLY_ROGER]?.heroCardInstIds.some(
            id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN,
          );
          if (ppAtJolly) score += 20;
        }
        break;
      }
      case ActionType.FATE: {
        const opponent = state.players.find(p => p.id !== player.id);
        const opponentProgress = Object.values(player.locationStates).flatMap(ls => ls.villainCardInstIds).length;
        // Increase FATE priority if opponent has many cards or power advantage
        const fateBonus = (opponent?.power ?? 0) > player.power + 3 ? 4 : opponentProgress > 3 ? 3 : 2;
        score += fateBonus;
        break;
      }
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
  // Small random noise to break ties between equal-scoring locations,
  // preventing the AI from always picking the exact same path each game.
  score += Math.random() * 1.2 - 0.6;

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
    if (card.cardType === CardType.ALLY) {
      // Vary ally priority based on hand size and power
      const allyBonus = player.handInstIds.length > 5 ? 5 : player.power < 5 ? 1 : 2;
      score += allyBonus;
    }
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
    // Evalúa todas las ubicaciones válidas con puntuación táctica + ruido
    const candidates = plugin.locations
      .filter(loc => {
        const ls = player.locationStates[loc.id];
        if (ls.isLocked) return false;
        if (ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE)) return false;
        return !ls.heroCardInstIds.some(id =>
          state.allCards[id]?.effectIds.some(effId => getEffectDef(effId)?.blocksCursePlay),
        );
      })
      .map(loc => {
        const ls = player.locationStates[loc.id];
        let score = 0;
        // Fuego Verde: preferir ubicaciones con más acciones disponibles (más valioso bloquear)
        if (card.defId.includes('fuego')) {
          score += loc.actions.length * 2;
        }
        // Sueño Sin Sueños: preferir ubicaciones donde ya hay héroes o muchas acciones
        if (card.defId.includes('sueno')) {
          score += ls.heroCardInstIds.length * 3;
          score += loc.actions.length;
        }
        // Selva: preferir ubicaciones con muchas acciones (más tráfico de héroes)
        if (card.defId.includes('selva')) {
          score += loc.actions.length * 1.5;
        }
        // Preferir ubicaciones sin héroes (más seguras para la maldición)
        score -= ls.heroCardInstIds.length;
        // Ruido alto para asegurar variedad entre partidas
        score += Math.random() * 4 - 2;
        return { locId: loc.id, score };
      });

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].locId;
    }
  }

  if (card.cardType === CardType.ALLY) {
    // Distribuir aliados entre ubicaciones con héroes, penalizando ubicaciones llenas
    const candidates = plugin.locations
      .filter(loc => {
        const ls = player.locationStates[loc.id];
        return !ls.isLocked && ls.heroCardInstIds.length > 0;
      })
      .map(loc => {
        const ls = player.locationStates[loc.id];
        let score = ls.heroCardInstIds.length * 2; // Preferir más héroes
        score -= ls.villainCardInstIds.length; // Penalizar ubicaciones llenas
        score += Math.random() * 2 - 1; // Ruido para variación
        return { locId: loc.id, score };
      });

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].locId;
    }
  }

  if (card.cardType === CardType.HERO) {
    // Distribuir héroes usando scoreLocation en lugar de siempre el peón
    const scores = plugin.locations.map(loc => ({
      locId: loc.id,
      score: scoreLocation(state, player, loc.id),
    }));
    scores.sort((a, b) => b.score - a.score);
    return scores[0].locId;
  }

  const pawnLoc = player.locationStates[player.pawnLocationId];
  if (!pawnLoc?.isLocked) return player.pawnLocationId;
  return plugin.locations.find(l => !player.locationStates[l.id]?.isLocked)?.id
    ?? plugin.locations[0].id;
}

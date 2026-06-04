import { ActionType, CardType, TurnPhase } from '../types';
import type { GameState, CardInstId, LocationId } from '../types';
import { getPlugin } from '../villains/registry';
import { EffectId, CardDefId } from '../villains/effectIds';
import { HookLocationId } from '../villains/hook/cards';
import { getPlayer, getAvailableSlotIndices, getEffectiveStrength, getActionAtSlot, computeKingdomCostMod } from '../engine/stateHelpers';
import {
  canPlayCard, canVanquish, canMoveItemAlly,
  canMoveHero, canFate, canActivateCard, canDiscard,
} from '../engine/RuleEngine';
import {
  movePawn, skipMove, gainPower, playCard, vanquish, moveItemAlly,
  moveHero, startFate, resolveFate, activateCard, discardFromHand,
  endActivatePhase, drawCards,
} from '../engine/GameEngine';
import { scoreLocation, scoreCard, pickBestPlayTarget } from './scoring';
import { buildPlayCtx } from './contextBuilder';

// ─── AI TURN EXECUTION ────────────────────────────────────────────────────────

export function runAITurn(state: GameState): GameState[] {
  const steps: GameState[] = [];
  let s = state;
  const playerId = s.players[s.currentPlayerIndex].id;

  // MOVE phase
  if (s.turnPhase === TurnPhase.MOVE) {
    const player = getPlayer(s, playerId);
    if (player.skipNextMove) {
      s = skipMove(s, playerId);
    } else {
      const plugin = getPlugin(player.villainId);
      const candidates = plugin.locations
        .filter(loc => loc.id !== player.pawnLocationId && !player.locationStates[loc.id]?.isLocked)
        .sort((a, b) => scoreLocation(s, player, b.id) - scoreLocation(s, player, a.id));

      if (candidates.length > 0) {
        s = movePawn(s, playerId, candidates[0].id);
      } else {
        const any = plugin.locations.find(l => l.id !== player.pawnLocationId && !player.locationStates[l.id]?.isLocked);
        if (any) s = movePawn(s, playerId, any.id);
      }
    }
    steps.push(s);
  }

  if (s.turnPhase !== TurnPhase.ACTIVATE) {
    if (s.turnPhase === TurnPhase.DRAW) { s = drawCards(s, playerId); steps.push(s); }
    return steps;
  }

  // ACTIVATE phase — keep taking actions until none available
  const MAX_ACTIVATE_ITERATIONS = 20;
  let iterations = 0;
  while (s.turnPhase === TurnPhase.ACTIVATE && iterations++ < MAX_ACTIVATE_ITERATIONS) {
    const player = getPlayer(s, playerId);
    const plugin = getPlugin(player.villainId);
    const locDef = plugin.locations.find(l => l.id === player.pawnLocationId);
    if (!locDef) break;

    const available = getAvailableSlotIndices(s, playerId, player.pawnLocationId);
    if (available.length === 0) break;

    let acted = false;

    for (const slotIdx of available) {
      const slot = getActionAtSlot(s, playerId, slotIdx);
      if (!slot) break;

      if (slot.type === ActionType.GAIN_POWER) {
        s = gainPower(s, playerId, slotIdx);
        acted = true;
        break;
      }

      if (slot.type === ActionType.PLAY_CARD) {
        const freshPlayer = getPlayer(s, playerId);
        // Include kingdom cost modifier to avoid attempting cards we can't actually afford
        const bestCard = freshPlayer.handInstIds
          .filter(id => {
            const card = s.allCards[id];
            if (!card) return false;
            const targetLoc = pickBestPlayTarget(s, freshPlayer, id);
            const costMod = computeKingdomCostMod(s, playerId, card, targetLoc);
            const effectiveCost = Math.max(0, card.baseCost + card.costModifier + costMod);
            return freshPlayer.power >= effectiveCost;
          })
          .sort((a, b) => scoreCard(s, freshPlayer, b) - scoreCard(s, freshPlayer, a))[0];

        if (bestCard) {
          const targetLoc = pickBestPlayTarget(s, freshPlayer, bestCard);
          if (canPlayCard(s, playerId, bestCard, slotIdx, targetLoc).valid) {
            const ctx = buildPlayCtx(s, playerId, bestCard, targetLoc);
            s = playCard(s, playerId, bestCard, slotIdx, targetLoc, ctx);
            acted = true;
            break;
          }
        }
      }

      if (slot.type === ActionType.VANQUISH) {
        const freshPlayer = getPlayer(s, playerId);
        const plugin3 = getPlugin(freshPlayer.villainId);
        // Find a hero we can vanquish; prioritize PP at Jolly Roger for Hook
        const heroEntries = Object.entries(freshPlayer.locationStates).flatMap(
          ([, ls]) => ls.heroCardInstIds,
        );
        const ppAtJollyId = freshPlayer.locationStates[HookLocationId.JOLLY_ROGER]?.heroCardInstIds.find(
          id => s.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN,
        );
        const orderedHeroes = ppAtJollyId
          ? [ppAtJollyId, ...heroEntries.filter(id => id !== ppAtJollyId)]
          : heroEntries;

        for (const heroId of orderedHeroes) {
          const heroLoc = s.allCards[heroId]?.locationId;
          if (!heroLoc) continue;
          const heroLocDef = plugin3.locations.find(l => l.id === heroLoc);
          const sameLocAllies = (freshPlayer.locationStates[heroLoc]?.villainCardInstIds ?? []).filter(
            id => s.allCards[id]?.cardType === CardType.ALLY,
          );
          // Adjacent Pelotón de Abordaje allies
          const adjAllies: CardInstId[] = (heroLocDef?.adjacentIds ?? []).flatMap(adjId => {
            const adjLs = freshPlayer.locationStates[adjId];
            return (adjLs?.villainCardInstIds ?? []).filter(id => {
              const a = s.allCards[id];
              return a?.cardType === CardType.ALLY && a.effectIds.includes(EffectId.PELOTON_ADJ_VANQUISH);
            });
          });
          const candidates = [...sameLocAllies, ...adjAllies];
          if (candidates.length === 0) continue;
          const heroStr = getEffectiveStrength(s, heroId);
          const sorted = [...candidates].sort(
            (a, b) => getEffectiveStrength(s, b) - getEffectiveStrength(s, a),
          );
          let total = 0;
          const chosen: CardInstId[] = [];
          for (const ally of sorted) {
            chosen.push(ally);
            total += getEffectiveStrength(s, ally);
            if (total >= heroStr) break;
          }
          if (total >= heroStr && canVanquish(s, playerId, heroId, chosen, slotIdx).valid) {
            s = vanquish(s, playerId, heroId, chosen, slotIdx);
            acted = true;
            break;
          }
        }
        if (acted) break;
      }

      if (slot.type === ActionType.MOVE_ITEM_ALLY) {
        // Move an Item or Ally to a better location
        const freshPlayer = getPlayer(s, playerId);
        const plugin2 = getPlugin(freshPlayer.villainId);
        for (const [locId, ls] of Object.entries(freshPlayer.locationStates)) {
          const movableId = ls.villainCardInstIds.find(id => {
            const c = s.allCards[id];
            return c?.cardType === CardType.ITEM || c?.cardType === CardType.ALLY;
          });
          if (!movableId) continue;
          const curLocDef = plugin2.locations.find(l => l.id === locId);
          if (!curLocDef) continue;
          for (const adjId of curLocDef.adjacentIds) {
            if (canMoveItemAlly(s, playerId, movableId, adjId, slotIdx).valid) {
              s = moveItemAlly(s, playerId, movableId, adjId, slotIdx);
              acted = true;
              break;
            }
          }
          if (acted) break;
        }
        if (acted) break;
        continue;
      }

      if (slot.type === ActionType.MOVE_HERO) {
        if (player.villainId === 'hook') {
          const freshPlayer = getPlayer(s, playerId);
          // Move Peter Pan toward Jolly Roger
          for (const [locId, ls] of Object.entries(freshPlayer.locationStates)) {
            const ppId = ls.heroCardInstIds.find(
              id => s.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN,
            );
            if (!ppId) continue;
            const plugin2 = getPlugin(freshPlayer.villainId);
            const curLocDef = plugin2.locations.find(l => l.id === locId);
            if (!curLocDef) continue;
            // Move toward jollyroger
            const adj = curLocDef.adjacentIds.find(a => a === HookLocationId.JOLLY_ROGER) ?? curLocDef.adjacentIds[0];
            if (adj && canMoveHero(s, playerId, ppId, adj, slotIdx).valid) {
              s = moveHero(s, playerId, ppId, adj, slotIdx);
              acted = true;
              break;
            }
          }
          if (acted) break;
        }
        continue;
      }

      if (slot.type === ActionType.FATE) {
        const oppIdx = (s.currentPlayerIndex + 1) % s.players.length;
        if (canFate(s, playerId, slotIdx).valid) {
          s = startFate(s, playerId, oppIdx, slotIdx);
          if (s.pendingFate) {
            const { revealedInstIds, targetPlayerIndex } = s.pendingFate;
            const oppPlayer = s.players[targetPlayerIndex];
            const oppPlugin = getPlugin(oppPlayer.villainId);

            // Choose best revealed card: prefer heroes, then items, then effects
            const heroCard  = revealedInstIds.find(id => s.allCards[id]?.cardType === CardType.HERO);
            const itemCard  = revealedInstIds.find(id => s.allCards[id]?.cardType === CardType.ITEM);
            const effectCard = revealedInstIds.find(id => s.allCards[id]?.cardType !== CardType.HERO && s.allCards[id]?.cardType !== CardType.ITEM);
            const chosen = heroCard ?? itemCard ?? effectCard ?? revealedInstIds[0];
            const chosenCard = s.allCards[chosen];

            // Valid fate locations: all unlocked locations
            const validFateLocs = oppPlugin.locations.filter(
              l => !oppPlayer.locationStates[l.id]?.isLocked,
            );
            const fallbackLoc = oppPlugin.locations.find(l => !oppPlayer.locationStates[l.id]?.isLocked);

            // For effects (no location needed) use any unlocked loc as placeholder
            if (chosenCard?.cardType !== CardType.HERO && chosenCard?.cardType !== CardType.ITEM) {
              const loc = fallbackLoc?.id ?? oppPlugin.locations[0].id;
              s = resolveFate(s, chosen, loc, {});
            } else {
              // Find best target location (prefer location with least allies to maximize disruption)
              const targetLocDef = validFateLocs.length > 0 ? validFateLocs[0] : fallbackLoc;
              const targetLoc = targetLocDef?.id ?? oppPlugin.locations[0].id;

              const fateCtx: { targetCardInstId?: CardInstId } = {};
              // If item needs to attach to a hero, find one
              if (chosenCard?.cardType === CardType.ITEM) {
                const heroAtLoc = oppPlayer.locationStates[targetLoc]?.heroCardInstIds[0];
                if (heroAtLoc) fateCtx.targetCardInstId = heroAtLoc;
                // If no hero at chosen loc, try locations with heroes
                if (!heroAtLoc) {
                  const locWithHero = validFateLocs.find(
                    l => oppPlayer.locationStates[l.id]?.heroCardInstIds.length > 0,
                  );
                  if (locWithHero) {
                    fateCtx.targetCardInstId = oppPlayer.locationStates[locWithHero.id].heroCardInstIds[0];
                    s = resolveFate(s, chosen, locWithHero.id, fateCtx);
                    acted = true;
                    break;
                  }
                }
              }
              s = resolveFate(s, chosen, targetLoc, fateCtx);
            }
          }
          acted = true;
          break;
        }
      }

      if (slot.type === ActionType.ACTIVATE_CARD) {
        const freshPlayer = getPlayer(s, playerId);
        for (const [, ls] of Object.entries(freshPlayer.locationStates)) {
          for (const cardId of ls.villainCardInstIds) {
            if (canActivateCard(s, playerId, cardId, slotIdx).valid) {
              const ctx: { targetLocationId?: LocationId; targetCardInstId?: CardInstId } = {};
              const card = s.allCards[cardId];
              if (card.effectIds.includes(EffectId.RAVEN_ACTIVATE)) {
                const plugin2 = getPlugin(freshPlayer.villainId);
                const locDef2 = plugin2.locations.find(l => l.id === card.locationId);
                if (locDef2?.adjacentIds[0]) ctx.targetLocationId = locDef2.adjacentIds[0];
              }
              s = activateCard(s, playerId, cardId, slotIdx, ctx);
              acted = true;
              break;
            }
          }
          if (acted) break;
        }
        if (acted) break;
        continue;
      }

      if (slot.type === ActionType.DISCARD) {
        const freshPlayer = getPlayer(s, playerId);
        if (freshPlayer.handInstIds.length > 0 && canDiscard(s, playerId, slotIdx).valid) {
          const toDiscard = freshPlayer.handInstIds.slice(0, 1);
          s = discardFromHand(s, playerId, toDiscard, slotIdx);
          acted = true;
          break;
        }
        break;
      }
    }

    if (acted) steps.push(s);
    if (!acted) break;
  }

  // DRAW phase
  if (s.turnPhase === TurnPhase.ACTIVATE) s = endActivatePhase(s);
  if (s.turnPhase === TurnPhase.DRAW) { s = drawCards(s, playerId); steps.push(s); }

  return steps;
}

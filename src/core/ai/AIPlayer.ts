import { ActionType, CardType, TurnPhase } from '../types';
import type { GameState, PlayerState, CardInstId, LocationId, PlayerId } from '../types';
import { getPlugin } from '../villains/registry';
import { getPlayer, getAvailableSlotIndices, getEffectiveStrength, getActionAtSlot } from '../engine/stateHelpers';
import {
  canPlayCard, canVanquish, canMoveItemAlly,
  canMoveHero, canFate, canActivateCard, canDiscard,
} from '../engine/RuleEngine';
import {
  movePawn, skipMove, gainPower, playCard, vanquish, moveItemAlly,
  moveHero, startFate, resolveFate, activateCard, discardFromHand,
  endActivatePhase, drawCards,
} from '../engine/GameEngine';

export interface AIDecision {
  action: string;
  apply: (state: GameState) => GameState;
}

// ─── SCORING ─────────────────────────────────────────────────────────────────

function scoreLocation(state: GameState, player: PlayerState, locId: LocationId): number {
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
        // Value more if we have cards we want to play
        score += player.handInstIds.length > 0 ? 3 : 1;
        // Extra score for curses if Maleficent
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
        // Hook: extra score for vanquishing Peter Pan at Jolly Roger
        if (player.villainId === 'hook') {
          const ppAtJolly = player.locationStates['jollyroger']?.heroCardInstIds.some(
            id => state.allCards[id]?.defId === 'hook_fate_peter_pan',
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
        // Hook: extra score if can move Peter Pan to Jolly Roger
        if (player.villainId === 'hook') {
          const ppExists = Object.values(player.locationStates).some(ls =>
            ls.heroCardInstIds.some(id => state.allCards[id]?.defId === 'hook_fate_peter_pan'),
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

function scoreCard(state: GameState, player: PlayerState, cardInstId: CardInstId): number {
  const card = state.allCards[cardInstId];
  if (!card) return 0;
  const effectiveCost = Math.max(0, card.baseCost + card.costModifier);
  if (player.power < effectiveCost) return -1;

  let score = 1;

  if (player.villainId === 'maleficent') {
    if (card.cardType === CardType.CURSE) {
      // Count which locations still need curses
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
      ls.heroCardInstIds.some(id => state.allCards[id]?.defId === 'hook_fate_peter_pan'),
    );
    const ppAtJolly = player.locationStates['jollyroger']?.heroCardInstIds.some(
      id => state.allCards[id]?.defId === 'hook_fate_peter_pan',
    );

    // Rival Digno: trae a Peter Pan al reino (cost 0, +2 power)
    if (['hook_v_rival_1', 'hook_v_rival_2', 'hook_v_rival_3'].includes(card.defId)) {
      score += ppInKingdom ? 2 : 15;
    }
    // Mapa de Nunca Jamás: desbloquea el Árbol del Ahorcado
    if (card.defId === 'hook_v_mapa') {
      score += player.locationStates['hangman']?.isLocked ? 12 : 0;
    }
    // Sr. Starkey: mueve un héroe, útil para acercar PP al Jolly Roger
    if (card.defId === 'hook_v_starkey') {
      score += ppInKingdom && !ppAtJolly ? 8 : 0;
    }
    if (card.cardType === CardType.ALLY) score += 3;
  }

  return score;
}

function pickBestPlayTarget(
  state: GameState,
  player: PlayerState,
  cardInstId: CardInstId,
): LocationId {
  const plugin = getPlugin(player.villainId);
  const card = state.allCards[cardInstId];

  // For curses: pick location without a curse
  if (card.cardType === CardType.CURSE) {
    const needsCurse = plugin.locations.find(loc => {
      const ls = player.locationStates[loc.id];
      return !ls.isLocked && !ls.villainCardInstIds.some(
        id => state.allCards[id]?.cardType === CardType.CURSE,
      );
    });
    if (needsCurse) return needsCurse.id;
  }

  // For allies: pick location with heroes to vanquish later
  if (card.cardType === CardType.ALLY) {
    const withHero = plugin.locations.find(loc => {
      const ls = player.locationStates[loc.id];
      return !ls.isLocked && ls.heroCardInstIds.length > 0;
    });
    if (withHero) return withHero.id;
  }

  // Default: pawn location or first unlocked
  const pawnLoc = player.locationStates[player.pawnLocationId];
  if (!pawnLoc?.isLocked) return player.pawnLocationId;
  return plugin.locations.find(l => !player.locationStates[l.id]?.isLocked)?.id
    ?? plugin.locations[0].id;
}

// ─── AI TURN EXECUTION ────────────────────────────────────────────────────────

export function runAITurn(state: GameState): GameState {
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
  }

  if (s.turnPhase !== TurnPhase.ACTIVATE) return s;

  // ACTIVATE phase — keep taking actions until none available
  let iterations = 0;
  while (s.turnPhase === TurnPhase.ACTIVATE && iterations++ < 20) {
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
        const bestCard = freshPlayer.handInstIds
          .filter(id => {
            const card = s.allCards[id];
            return card && freshPlayer.power >= Math.max(0, card.baseCost + card.costModifier);
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
        const ppAtJollyId = freshPlayer.locationStates['jollyroger']?.heroCardInstIds.find(
          id => s.allCards[id]?.defId === 'hook_fate_peter_pan',
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
              return a?.cardType === CardType.ALLY && a.effectIds.includes('hook_peloton_adj_vanquish');
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
        // Move a curse to fill a location missing one (Maleficent)
        if (player.villainId === 'maleficent') {
          const freshPlayer = getPlayer(s, playerId);
          const plugin2 = getPlugin(freshPlayer.villainId);
          for (const [locId, ls] of Object.entries(freshPlayer.locationStates)) {
            const curseId = ls.villainCardInstIds.find(
              id => s.allCards[id]?.cardType === CardType.CURSE,
            );
            if (!curseId) continue;
            const curLocDef = plugin2.locations.find(l => l.id === locId);
            if (!curLocDef) continue;
            const adjNeedsCurse = curLocDef.adjacentIds.find(adjId => {
              const adjLs = freshPlayer.locationStates[adjId];
              return adjLs && !adjLs.isLocked && !adjLs.villainCardInstIds.some(
                id => s.allCards[id]?.cardType === CardType.CURSE,
              );
            });
            if (adjNeedsCurse && canMoveItemAlly(s, playerId, curseId, adjNeedsCurse, slotIdx).valid) {
              s = moveItemAlly(s, playerId, curseId, adjNeedsCurse, slotIdx);
              acted = true;
              break;
            }
          }
          if (acted) break;
        }
        continue;
      }

      if (slot.type === ActionType.MOVE_HERO) {
        if (player.villainId === 'hook') {
          const freshPlayer = getPlayer(s, playerId);
          // Move Peter Pan toward Jolly Roger
          for (const [locId, ls] of Object.entries(freshPlayer.locationStates)) {
            const ppId = ls.heroCardInstIds.find(
              id => s.allCards[id]?.defId === 'hook_fate_peter_pan',
            );
            if (!ppId) continue;
            const plugin2 = getPlugin(freshPlayer.villainId);
            const curLocDef = plugin2.locations.find(l => l.id === locId);
            if (!curLocDef) continue;
            // Move toward jollyroger
            const adj = curLocDef.adjacentIds.find(a => a === 'jollyroger') ?? curLocDef.adjacentIds[0];
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
          // Resolve fate: pick the first card that can be played
          if (s.pendingFate) {
            const { revealedInstIds, targetPlayerIndex } = s.pendingFate;
            const oppPlayer = s.players[targetPlayerIndex];
            // Pick first available non-blocked location
            const oppPlugin = getPlugin(oppPlayer.villainId);
            const targetLoc = oppPlugin.locations.find(
              l => !oppPlayer.locationStates[l.id]?.isLocked,
            )?.id ?? oppPlugin.locations[0].id;

            const chosen = revealedInstIds[0];
            const fateCtx: { targetCardInstId?: CardInstId } = {};
            const chosenCard = s.allCards[chosen];
            if (chosenCard?.cardType === CardType.ITEM) {
              const heroAtLoc = oppPlayer.locationStates[targetLoc]?.heroCardInstIds[0];
              if (heroAtLoc) fateCtx.targetCardInstId = heroAtLoc;
            }
            s = resolveFate(s, chosen, targetLoc, fateCtx);
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
              if (card.effectIds.includes('mal_raven_activate')) {
                const plugin2 = getPlugin(freshPlayer.villainId);
                const locDef2 = plugin2.locations.find(l => l.id === card.locationId);
                if (locDef2?.adjacentIds[0]) ctx.targetLocationId = locDef2.adjacentIds[0];
              }
              if (card.effectIds.includes('hook_cannon_activate')) {
                const heroId = ls.heroCardInstIds[0];
                if (heroId) ctx.targetCardInstId = heroId;
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
        // Discard weakest cards
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

    if (!acted) break;
  }

  // DRAW phase
  if (s.turnPhase === TurnPhase.ACTIVATE) {
    s = endActivatePhase(s);
  }
  if (s.turnPhase === TurnPhase.DRAW) {
    s = drawCards(s, playerId);
  }

  return s;
}

function buildPlayCtx(
  state: GameState,
  playerId: PlayerId,
  cardInstId: CardInstId,
  _targetLocId: LocationId,
): { targetCardInstId?: CardInstId; auxiliaryInstIds?: CardInstId[]; targetLocationId?: LocationId } {
  const card = state.allCards[cardInstId];
  const ctx: { targetCardInstId?: CardInstId; targetLocationId?: LocationId } = {};

  // Conjuro Maligno: needs a curse + adjacent loc
  if (card.effectIds.includes('mal_conjuro_move_curse')) {
    const player = getPlayer(state, playerId);
    for (const [, ls] of Object.entries(player.locationStates)) {
      const curseId = ls.villainCardInstIds.find(
        id => state.allCards[id]?.cardType === CardType.CURSE,
      );
      if (curseId) { ctx.targetCardInstId = curseId; break; }
    }
  }

  // Espada de la Verdad: needs a hero to attach to
  if (card.effectIds.includes('mal_espada_on_play')) {
    const player = getPlayer(state, playerId);
    for (const ls of Object.values(player.locationStates)) {
      const heroId = ls.heroCardInstIds.find(
        id => state.allCards[id]?.attachedItemInstIds.length === 0,
      );
      if (heroId) { ctx.targetCardInstId = heroId; break; }
    }
  }

  // ¡A la orden, señor!: mover un aliado adyacente al Jolly Roger cuando PP está allí
  if (card.effectIds.includes('hook_a_la_orden')) {
    const player3 = getPlayer(state, playerId);
    const ppAtJolly3 = player3.locationStates['jollyroger']?.heroCardInstIds.some(
      id => state.allCards[id]?.defId === 'hook_fate_peter_pan',
    );
    if (ppAtJolly3) {
      const plugin3 = getPlugin(player3.villainId);
      // Buscar aliado en Skullrock (adyacente a JR)
      const skullrockLs = player3.locationStates['skullrock'];
      const allyId = skullrockLs?.villainCardInstIds.find(
        id => state.allCards[id]?.cardType === CardType.ALLY,
      );
      if (allyId) {
        const allyLoc = state.allCards[allyId]?.locationId;
        const allyLocDef = allyLoc ? plugin3.locations.find(l => l.id === allyLoc) : undefined;
        if (allyLocDef?.adjacentIds.includes('jollyroger')) {
          ctx.targetCardInstId = allyId;
          return { ...ctx, targetLocationId: 'jollyroger' };
        }
      }
    }
  }

  // Tormenta: needs a hero to move
  if (card.effectIds.includes('mal_tormenta_move_hero')) {
    const player = getPlayer(state, playerId);
    const plugin = getPlugin(player.villainId);
    for (const [locId, ls] of Object.entries(player.locationStates)) {
      if (ls.heroCardInstIds.length > 0) {
        const locDef = plugin.locations.find(l => l.id === locId);
        if (locDef?.adjacentIds[0]) {
          ctx.targetCardInstId = ls.heroCardInstIds[0];
          return { ...ctx };
        }
      }
    }
  }

  // Sr. Starkey: mover héroe; priorizar PP hacia Jolly Roger
  if (card.effectIds.includes('hook_starkey_move_hero')) {
    const player = getPlayer(state, playerId);
    const plugin = getPlugin(player.villainId);
    // Buscar Peter Pan primero
    let heroId: CardInstId | undefined;
    let heroLocId: LocationId | undefined;
    for (const [locId, ls] of Object.entries(player.locationStates)) {
      const ppId = ls.heroCardInstIds.find(id => state.allCards[id]?.defId === 'hook_fate_peter_pan');
      if (ppId) { heroId = ppId; heroLocId = locId; break; }
    }
    // Si no hay PP, coger el primer héroe disponible
    if (!heroId) {
      for (const [locId, ls] of Object.entries(player.locationStates)) {
        if (ls.heroCardInstIds.length > 0) { heroId = ls.heroCardInstIds[0]; heroLocId = locId; break; }
      }
    }
    if (heroId && heroLocId) {
      const locDef = plugin.locations.find(l => l.id === heroLocId);
      const adjs = locDef?.adjacentIds ?? [];
      // Priorizar el adyacente más cercano al Jolly Roger
      const dest = adjs.find(a => a === 'jollyroger')
        ?? adjs.find(a => !player.locationStates[a]?.isLocked)
        ?? adjs[0];
      if (dest) return { targetCardInstId: heroId, targetLocationId: dest };
    }
  }

  return ctx;
}

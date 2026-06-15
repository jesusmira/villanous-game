import { CardType, EffectTrigger } from '../../types';
import type { EffectDef } from '../../types';
import {
  getPlayer, updatePlayer, updateLocationState, updateCard,
  discardCardFromKingdom, addLog,
} from '../../engine/stateHelpers';
import { shuffle } from '../../utils/shuffle';
import { locations, HookLocationId, HookObjectiveStep } from './cards';

export const effects: EffectDef[] = [
  {
    id: 'hook_unlock_hangman',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Desbloquea el Árbol del Ahorcado',
    execute: (state, ctx) => {
      const player = getPlayer(state, ctx.actingPlayerId);
      if (!player.locationStates[HookLocationId.HANGMAN].isLocked) return state;
      let s = updateLocationState(state, ctx.actingPlayerId, HookLocationId.HANGMAN, { isLocked: false });
      s = updatePlayer(s, ctx.actingPlayerId, {
        completedObjectiveSteps: [
          ...getPlayer(s, ctx.actingPlayerId).completedObjectiveSteps,
          HookObjectiveStep.HANGMAN_UNLOCKED,
        ],
      });
      return addLog(s, '¡El Árbol del Ahorcado ha sido desbloqueado!');
    },
  },
  {
    id: 'hook_smee_jollyroger',
    trigger: EffectTrigger.CONTINUOUS,
    description: '+2 Fuerza si está en el Jolly Roger',
    execute: (s) => s,
    computeStrengthBonus: (_state, instId) => {
      const card = _state.allCards[instId];
      return card?.locationId === 'jollyroger' ? 2 : 0;
    },
  },
  {
    id: 'hook_juan_item_bonus',
    trigger: EffectTrigger.CONTINUOUS,
    description: '+1 Fuerza si tiene algún Objeto unido',
    execute: (s) => s,
    computeStrengthBonus: (state, instId) => {
      const card = state.allCards[instId];
      return (card?.attachedItemInstIds.length ?? 0) > 0 ? 1 : 0;
    },
  },
  {
    id: 'hook_miguel_hero_bonus',
    trigger: EffectTrigger.CONTINUOUS,
    description: '+1 Fuerza por cada ubicación del reino con un Héroe',
    execute: (s) => s,
    computeStrengthBonus: (state, instId) => {
      const card = state.allCards[instId];
      if (!card?.locationId) return 0;
      const player = getPlayer(state, card.ownerId);
      return Object.values(player.locationStates).filter(ls => ls.heroCardInstIds.length > 0).length;
    },
  },
  {
    id: 'hook_wendy_aura',
    trigger: EffectTrigger.CONTINUOUS,
    description: '+1 Fuerza si Wendy está en el reino',
    execute: (s) => s,
    computeStrengthBonus: (state, instId) => {
      const card = state.allCards[instId];
      if (!card?.locationId) return 0;
      const player = getPlayer(state, card.ownerId);
      const wendyPresent = Object.values(player.locationStates).some(ls =>
        ls.heroCardInstIds.some(id => state.allCards[id]?.defId === 'hook_f_wendy'),
      );
      return wendyPresent ? 1 : 0;
    },
  },
  {
    id: 'hook_obsesion_cond',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Reacción: revela tu mazo de Destino hasta un Héroe; juégalo o descártalo',
    execute: (s) => s,
    conditionTrigger: 'VANQUISH_4PLUS',
  },
  {
    id: 'hook_perspicaz_cond',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Reacción: juega un Aliado de tu mano de forma gratuita',
    execute: (s) => s,
    conditionTrigger: 'ALLY_4PLUS_STR',
  },
  {
    id: 'hook_require_two_allies',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Requiere al menos dos Aliados para ser derrotado',
    execute: (s) => s,
    requiresMultipleAlliesToVanquish: true,
  },
  {
    id: 'hook_burla_attach',
    trigger: EffectTrigger.ON_PLAY,
    requiresTargetCard: 'HERO',
    description: 'Se adjunta a un Héroe; Garfio debe derrotar primero a Héroes con Burla',
    execute: (state, ctx) => {
      if (!ctx.targetLocationId) return state;
      const burla = state.allCards[ctx.cardInstId];
      if (!burla) return state;
      const player = getPlayer(state, burla.ownerId);
      const locState = player.locationStates[ctx.targetLocationId];
      const heroId = ctx.targetCardInstId
        ?? locState.heroCardInstIds.find(id => id !== ctx.cardInstId);
      if (!heroId) return state;
      const hero = state.allCards[heroId];
      if (!hero) return state;
      let s = updateCard(state, ctx.cardInstId, { attachedToInstId: heroId });
      s = updateCard(s, heroId, {
        attachedItemInstIds: [...hero.attachedItemInstIds, ctx.cardInstId],
      });
      return addLog(s, `Burla adjunta a ${hero.name}: debe ser derrotado primero.`);
    },
  },
  {
    id: 'hook_tictac_hand_discard',
    trigger: EffectTrigger.ON_PAWN_ARRIVES,
    description: 'Si Garfio llega aquí, descarta su mano inmediatamente',
    execute: (state, ctx) => {
      const player = getPlayer(state, ctx.actingPlayerId);
      const s = updatePlayer(state, ctx.actingPlayerId, {
        villainDiscardInstIds: [...player.villainDiscardInstIds, ...player.handInstIds],
        handInstIds: [],
      });
      return addLog(s, `¡Tic Tac! ${player.name} descarta su mano.`);
    },
  },
  {
    id: 'hook_peter_pan_reveal',
    trigger: EffectTrigger.ON_FATE_REVEAL,
    description: 'Al ser revelado, se juega inmediatamente en el Árbol del Ahorcado',
    execute: (state, ctx) => {
      const peter = state.allCards[ctx.cardInstId];
      if (!peter) return state;
      const player = getPlayer(state, peter.ownerId);
      const hangman = player.locationStates[HookLocationId.HANGMAN];
      let s = updateLocationState(state, peter.ownerId, HookLocationId.HANGMAN, {
        heroCardInstIds: [...hangman.heroCardInstIds, ctx.cardInstId],
      });
      s = updateCard(s, ctx.cardInstId, { locationId: HookLocationId.HANGMAN });
      return addLog(s, '¡Peter Pan jugado inmediatamente en el Árbol del Ahorcado!');
    },
  },
  {
    id: 'hook_sable_attach',
    trigger: EffectTrigger.ON_PLAY,
    requiresTargetCard: 'ALLY',
    description: 'Únelo a un Aliado; ese Aliado obtiene +2 Fuerza',
    execute: (state, ctx) => {
      if (!ctx.targetCardInstId) return state;
      const target = state.allCards[ctx.targetCardInstId];
      if (!target || target.cardType !== CardType.ALLY) return state;
      let s = updateCard(state, ctx.cardInstId, { attachedToInstId: ctx.targetCardInstId, strengthModifier: 2 });
      s = updateCard(s, ctx.targetCardInstId, {
        attachedItemInstIds: [...target.attachedItemInstIds, ctx.cardInstId],
        strengthModifier: target.strengthModifier + 2,
      });
      return addLog(s, `Sable: +2 Fuerza a ${target.name}.`);
    },
  },
  {
    id: 'hook_polvo_attach',
    trigger: EffectTrigger.ON_PLAY,
    requiresTargetCard: 'HERO',
    description: 'Únelo a un Héroe; ese Héroe recibe +2 Fuerza',
    execute: (state, ctx) => {
      if (!ctx.targetCardInstId) return state;
      const target = state.allCards[ctx.targetCardInstId];
      if (!target || target.cardType !== CardType.HERO) return state;
      let s = updateCard(state, ctx.cardInstId, { attachedToInstId: ctx.targetCardInstId, strengthModifier: 2 });
      s = updateCard(s, ctx.targetCardInstId, {
        attachedItemInstIds: [...target.attachedItemInstIds, ctx.cardInstId],
        strengthModifier: target.strengthModifier + 2,
      });
      return addLog(s, `Polvo de Hada: +2 Fuerza a ${target.name}.`);
    },
  },
  {
    id: 'hook_a_la_orden',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Mueve un Aliado a una ubicación adyacente y le da +2 Fuerza este turno',
    execute: (state, ctx) => {
      const player = getPlayer(state, ctx.actingPlayerId);
      const allyId = ctx.targetCardInstId ?? (() => {
        for (const locState of Object.values(player.locationStates)) {
          const a = locState.villainCardInstIds.find(id => state.allCards[id]?.cardType === CardType.ALLY);
          if (a) return a;
        }
        return undefined;
      })();
      if (!allyId) return state;
      const ally = state.allCards[allyId];
      if (!ally?.locationId) return state;
      const locDef = locations.find(l => l.id === ally.locationId);
      if (!locDef) return state;
      // ctx.targetLocationId es la ubicación de juego de la carta, NO necesariamente
      // adyacente al aliado. Solo usarlo si es válido como destino (adyacente + no bloqueado).
      const playerForDest = getPlayer(state, ctx.actingPlayerId);
      const destLocId = (() => {
        const candidate = ctx.targetLocationId;
        if (
          candidate &&
          candidate !== ally.locationId &&
          locDef.adjacentIds.includes(candidate) &&
          !playerForDest.locationStates[candidate]?.isLocked
        ) return candidate;
        return locDef.adjacentIds.find(adjId => !playerForDest.locationStates[adjId]?.isLocked);
      })();
      if (!destLocId) return state;
      const srcLoc = getPlayer(state, ctx.actingPlayerId).locationStates[ally.locationId];
      let s = updateLocationState(state, ctx.actingPlayerId, ally.locationId, {
        villainCardInstIds: srcLoc.villainCardInstIds.filter(id => id !== allyId),
      });
      const destLoc = getPlayer(s, ctx.actingPlayerId).locationStates[destLocId];
      s = updateLocationState(s, ctx.actingPlayerId, destLocId, {
        villainCardInstIds: [...destLoc.villainCardInstIds, allyId],
      });
      s = updateCard(s, allyId, { locationId: destLocId, bonusThisTurn: (ally.bonusThisTurn ?? 0) + 2 });
      return addLog(s, `¡A la orden señor!: ${ally.name} movido a ${destLocId} con +2 Fuerza este turno.`);
    },
  },
  {
    id: 'hook_peloton_adj_vanquish',
    trigger: EffectTrigger.CONTINUOUS,
    description: 'Puede participar en Vencer desde una ubicación adyacente al Héroe',
    execute: (s) => s,
    canVanquishFromAdjacent: true,
  },
  {
    id: 'hook_rival_digno',
    trigger: EffectTrigger.ON_PLAY,
    description: '+2 Poder y juega el primer Héroe del mazo de Destino en la ubicación del peón',
    execute: (state, ctx) => {
      let s = updatePlayer(state, ctx.actingPlayerId, {
        power: getPlayer(state, ctx.actingPlayerId).power + 2,
      });
      if (getPlayer(s, ctx.actingPlayerId).fateDeckInstIds.length === 0) {
        const reshuffled = shuffle([...getPlayer(s, ctx.actingPlayerId).fateDiscardInstIds]);
        s = updatePlayer(s, ctx.actingPlayerId, { fateDeckInstIds: reshuffled, fateDiscardInstIds: [] });
        s = addLog(s, 'Rival Digno: mazo de Destino barajado.');
      }
      // Cut the deck at a random point before searching so the hero that comes
      // up is not always the same one across games.
      let deck = getPlayer(s, ctx.actingPlayerId).fateDeckInstIds;
      if (deck.length > 3) {
        const cut = 1 + Math.floor(Math.random() * (deck.length - 1));
        deck = [...deck.slice(cut), ...deck.slice(0, cut)];
        s = updatePlayer(s, ctx.actingPlayerId, { fateDeckInstIds: deck });
      }
      const heroIdx = deck.findIndex(id => s.allCards[id]?.cardType === CardType.HERO);
      if (heroIdx === -1) return addLog(s, 'Rival Digno: +2 Poder. No se encontró Héroe.');
      const heroId = deck[heroIdx];
      const toDiscard = deck.slice(0, heroIdx);
      const remaining = deck.slice(heroIdx + 1);
      s = updatePlayer(s, ctx.actingPlayerId, {
        fateDeckInstIds: remaining,
        fateDiscardInstIds: [...getPlayer(s, ctx.actingPlayerId).fateDiscardInstIds, ...toDiscard],
      });
      const hero = s.allCards[heroId];
      const destLocId = hero?.defId === 'hook_fate_peter_pan'
        ? HookLocationId.HANGMAN
        : getPlayer(s, ctx.actingPlayerId).pawnLocationId;
      const locState = getPlayer(s, ctx.actingPlayerId).locationStates[destLocId];
      s = updateLocationState(s, ctx.actingPlayerId, destLocId, {
        heroCardInstIds: [...locState.heroCardInstIds, heroId],
      });
      s = updateCard(s, heroId, { locationId: destLocId });
      return addLog(s, `Rival Digno: +2 Poder, ${hero?.name ?? 'Héroe'} jugado en ${destLocId}.`);
    },
  },
  {
    id: 'hook_demosles_susto',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Mira las 2 cartas superiores de tu mazo de Destino; descártalas o ponlas en el orden que quieras',
    execute: (state, ctx) => {
      let s = state;
      if (getPlayer(s, ctx.actingPlayerId).fateDeckInstIds.length === 0) {
        const reshuffled = shuffle([...getPlayer(s, ctx.actingPlayerId).fateDiscardInstIds]);
        s = updatePlayer(s, ctx.actingPlayerId, { fateDeckInstIds: reshuffled, fateDiscardInstIds: [] });
        s = addLog(s, 'Démosles un susto: mazo de Destino barajado.');
      }
      const player = getPlayer(s, ctx.actingPlayerId);
      const top2 = player.fateDeckInstIds.slice(0, 2);
      if (top2.length === 0) return addLog(s, 'Démosles un susto: mazo de Destino vacío.');
      s = updatePlayer(s, ctx.actingPlayerId, {
        fateDeckInstIds: player.fateDeckInstIds.slice(top2.length),
      });
      s = { ...s, pendingDemosles: { playerId: ctx.actingPlayerId, topCardIds: top2 } };
      return addLog(s, `Démosles un susto: revelando ${top2.length} carta(s).`);
    },
  },
  {
    id: 'hook_campanilla_discard_ally',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Descarta un Aliado de la ubicación de Campanilla',
    execute: (state, ctx) => {
      if (!ctx.targetLocationId) return state;
      const campanilla = state.allCards[ctx.cardInstId];
      if (!campanilla) return state;
      const locState = getPlayer(state, campanilla.ownerId).locationStates[ctx.targetLocationId];
      if (!locState) return state;
      const allyId = ctx.targetCardInstId
        ?? locState.villainCardInstIds.find(id => state.allCards[id]?.cardType === CardType.ALLY);
      if (!allyId) return state;
      const ally = state.allCards[allyId];
      if (!ally || ally.cardType !== CardType.ALLY) return state;
      return addLog(discardCardFromKingdom(state, allyId), `Campanilla descarta a ${ally.name}.`);
    },
  },
  {
    id: 'hook_gran_jaqueca',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Descarta un Objeto del Reino del Capitán Garfio',
    execute: (state, ctx) => {
      const card = state.allCards[ctx.cardInstId];
      if (!card) return state;
      const hookPlayer = getPlayer(state, card.ownerId);

      if (ctx.targetCardInstId) {
        const target = state.allCards[ctx.targetCardInstId];
        if (target?.cardType !== CardType.ITEM) return state;

        // Validate that the item belongs to the villain (is in villainCardInstIds), not a hero
        const itemBelongsToVillain = Object.values(hookPlayer.locationStates).some(ls =>
          ls.villainCardInstIds.includes(ctx.targetCardInstId!)
        );
        if (!itemBelongsToVillain) return state;

        return addLog(discardCardFromKingdom(state, ctx.targetCardInstId), `Gran Jaqueca descarta ${target.name}.`);
      }

      // Recoger todos los objetos del reino de Garfio.
      const allItems = Object.values(hookPlayer.locationStates)
        .flatMap(ls => ls.villainCardInstIds)
        .filter(id => state.allCards[id]?.cardType === CardType.ITEM);
      if (allItems.length === 0) return addLog(state, 'Gran Jaqueca: no hay Objetos en el Reino.');
      if (allItems.length === 1) {
        const item = state.allCards[allItems[0]];
        return addLog(discardCardFromKingdom(state, allItems[0]), `Gran Jaqueca descarta ${item?.name ?? 'Objeto'}.`);
      }
      // Varios objetos: el jugador elige (la IA resuelve automáticamente en gameStore).
      return { ...state, pendingJaqueca: { itemInstIds: allItems, actingPlayerId: ctx.actingPlayerId } };
    },
  },
  {
    id: 'hook_starkey_move_hero',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Mueve un Héroe del Reino a una ubicación adyacente desbloqueada',
    requiresTargetHeroAnywhere: true,
    requiresTargetLocation: true,
    execute: (state, ctx) => {
      const starkey = state.allCards[ctx.cardInstId];
      if (!starkey) return state;
      const player = getPlayer(state, starkey.ownerId);
      let heroId = ctx.targetCardInstId;
      if (!heroId) {
        for (const locState of Object.values(player.locationStates)) {
          if (locState.heroCardInstIds.length > 0) { heroId = locState.heroCardInstIds[0]; break; }
        }
      }
      if (!heroId) return state;
      const hero = state.allCards[heroId];
      if (!hero?.locationId) return state;
      const srcLocDef = locations.find(l => l.id === hero.locationId);
      if (!srcLocDef) return state;
      const destLocId = ctx.targetLocationId ?? srcLocDef.adjacentIds.find(
        adjId => !getPlayer(state, starkey.ownerId).locationStates[adjId]?.isLocked,
      );
      if (!destLocId) return state;
      const srcLoc = getPlayer(state, starkey.ownerId).locationStates[hero.locationId];
      let s = updateLocationState(state, starkey.ownerId, hero.locationId, {
        heroCardInstIds: srcLoc.heroCardInstIds.filter(id => id !== heroId),
      });
      const destLoc = getPlayer(s, starkey.ownerId).locationStates[destLocId];
      s = updateLocationState(s, starkey.ownerId, destLocId, {
        heroCardInstIds: [...destLoc.heroCardInstIds, heroId],
      });
      s = updateCard(s, heroId, { locationId: destLocId });
      return addLog(s, `Sr. Starkey mueve a ${hero.name} a ${destLocId}.`);
    },
  },
];

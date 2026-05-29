import { CardType, CardDeck, ActionType, EffectTrigger } from '../../types';
import type { VillainPlugin, EffectDef, CardDef, LocationDef, GameState, PlayerId } from '../../types';
import { getPlayer, updatePlayer, updateLocationState, updateCard, discardCardFromKingdom, addLog, shuffle } from '../../engine/stateHelpers';

// ─── EFFECTS ─────────────────────────────────────────────────────────────────

const effects: EffectDef[] = [
  {
    id: 'hook_unlock_hangman',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Desbloquea el Árbol del Ahorcado',
    execute: (state, ctx) => {
      const player = getPlayer(state, ctx.actingPlayerId);
      if (!player.locationStates['hangman'].isLocked) return state;
      let s = updateLocationState(state, ctx.actingPlayerId, 'hangman', { isLocked: false });
      s = updatePlayer(s, ctx.actingPlayerId, {
        completedObjectiveSteps: [
          ...getPlayer(s, ctx.actingPlayerId).completedObjectiveSteps,
          'HANGMAN_UNLOCKED',
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
        ls.heroCardInstIds.some(id => state.allCards[id]?.defId === 'hook_f_wendy')
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
      const hangman = player.locationStates['hangman'];
      let s = updateLocationState(state, peter.ownerId, 'hangman', {
        heroCardInstIds: [...hangman.heroCardInstIds, ctx.cardInstId],
      });
      s = updateCard(s, ctx.cardInstId, { locationId: 'hangman' });
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
      const destLocId = ctx.targetLocationId
        ?? locDef.adjacentIds.find(adjId => !getPlayer(state, ctx.actingPlayerId).locationStates[adjId]?.isLocked);
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
      // Reshuffle fate discard into deck if deck is empty
      if (getPlayer(s, ctx.actingPlayerId).fateDeckInstIds.length === 0) {
        const reshuffled = shuffle([...getPlayer(s, ctx.actingPlayerId).fateDiscardInstIds]);
        s = updatePlayer(s, ctx.actingPlayerId, { fateDeckInstIds: reshuffled, fateDiscardInstIds: [] });
        s = addLog(s, 'Rival Digno: mazo de Destino barajado.');
      }
      const deck = getPlayer(s, ctx.actingPlayerId).fateDeckInstIds;
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
        ? 'hangman'
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
      // Reshuffle fate discard into deck if deck is empty
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
      if (ctx.targetCardInstId) {
        const target = state.allCards[ctx.targetCardInstId];
        if (target?.cardType !== CardType.ITEM) return state;
        return addLog(discardCardFromKingdom(state, ctx.targetCardInstId), `Gran Jaqueca descarta ${target.name}.`);
      }
      const hookPlayer = getPlayer(state, card.ownerId);
      for (const locState of Object.values(hookPlayer.locationStates)) {
        const itemId = locState.villainCardInstIds.find(id => state.allCards[id]?.cardType === CardType.ITEM);
        if (itemId) {
          const item = state.allCards[itemId];
          return addLog(discardCardFromKingdom(state, itemId), `Gran Jaqueca descarta ${item?.name ?? 'Objeto'}.`);
        }
      }
      return addLog(state, 'Gran Jaqueca: no hay Objetos en el Reino.');
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
      // Use ctx.targetLocationId if provided, otherwise fall back to first adjacent unlocked
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

// ─── LOCATIONS ───────────────────────────────────────────────────────────────

const locations: LocationDef[] = [
  {
    id: 'jollyroger',
    name: 'Jolly Roger',
    actions: [
      { type: ActionType.GAIN_POWER, value: 1 },
      { type: ActionType.DISCARD },
      { type: ActionType.VANQUISH },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: ['skullrock'],
  },
  {
    id: 'skullrock',
    name: 'Roca Calavera',
    actions: [
      { type: ActionType.GAIN_POWER, value: 1 },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.FATE },
      { type: ActionType.DISCARD },
    ],
    adjacentIds: ['jollyroger', 'lagoon'],
  },
  {
    id: 'lagoon',
    name: 'Laguna de las Sirenas',
    actions: [
      { type: ActionType.PLAY_CARD },
      { type: ActionType.MOVE_ITEM_ALLY },
      { type: ActionType.GAIN_POWER, value: 3 },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: ['skullrock', 'hangman'],
  },
  {
    id: 'hangman',
    name: 'Árbol del Verdugo',
    actions: [
      { type: ActionType.FATE },
      { type: ActionType.GAIN_POWER, value: 2 },
      { type: ActionType.MOVE_HERO },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: ['lagoon'],
    startsLocked: true,
  },
];

// ─── VILLAIN CARDS ────────────────────────────────────────────────────────────

const villainCardDefs: CardDef[] = [
  // ¡A la orden, señor! ×2
  { id: 'hook_v_orden_1', name: '¡A la orden, señor!', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1, effectIds: ['hook_a_la_orden'], description: 'Mueve un Aliado a una ubicación adyacente. Ese Aliado recibe +2 Fuerza hasta el final del turno.' },
  { id: 'hook_v_orden_2', name: '¡A la orden, señor!', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1, effectIds: ['hook_a_la_orden'], description: 'Mueve un Aliado a una ubicación adyacente. Ese Aliado recibe +2 Fuerza hasta el final del turno.' },
  // Cañón ×2
  { id: 'hook_v_canon_1', name: 'Cañón', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 2, effectIds: [], grantsActionSlot: { type: ActionType.VANQUISH }, description: 'Esta ubicación ofrece una acción extra: Vencer.' },
  { id: 'hook_v_canon_2', name: 'Cañón', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 2, effectIds: [], grantsActionSlot: { type: ActionType.VANQUISH }, description: 'Esta ubicación ofrece una acción extra: Vencer.' },
  // Démosles un susto ×3
  { id: 'hook_v_susto_1', name: 'Démosles un susto', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1, effectIds: ['hook_demosles_susto'], description: 'Mira las dos cartas de arriba de tu mazo de Destino. Descártalas o ponlas en el orden que quieras.' },
  { id: 'hook_v_susto_2', name: 'Démosles un susto', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1, effectIds: ['hook_demosles_susto'], description: 'Mira las dos cartas de arriba de tu mazo de Destino. Descártalas o ponlas en el orden que quieras.' },
  { id: 'hook_v_susto_3', name: 'Démosles un susto', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1, effectIds: ['hook_demosles_susto'], description: 'Mira las dos cartas de arriba de tu mazo de Destino. Descártalas o ponlas en el orden que quieras.' },
  // Espadachín ×3
  { id: 'hook_v_espadachin_1', name: 'Espadachín', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1, strength: 2, effectIds: [], description: 'Sin Habilidad adicional.' },
  { id: 'hook_v_espadachin_2', name: 'Espadachín', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1, strength: 2, effectIds: [], description: 'Sin Habilidad adicional.' },
  { id: 'hook_v_espadachin_3', name: 'Espadachín', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1, strength: 2, effectIds: [], description: 'Sin Habilidad adicional.' },
  // El Estuche de Garfio ×2
  { id: 'hook_v_estuche_1', name: 'El Estuche de Garfio', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 2, effectIds: [], grantsActionSlot: { type: ActionType.GAIN_POWER, value: 1 }, description: 'Esta ubicación ofrece una acción extra: Ganar Poder (+1).' },
  { id: 'hook_v_estuche_2', name: 'El Estuche de Garfio', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 2, effectIds: [], grantsActionSlot: { type: ActionType.GAIN_POWER, value: 1 }, description: 'Esta ubicación ofrece una acción extra: Ganar Poder (+1).' },
  // Mapa de Nunca Jamás ×1
  { id: 'hook_v_mapa', name: 'Mapa de Nunca Jamás', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 4, effectIds: ['hook_unlock_hangman'], description: 'Desbloquea el Árbol del Ahorcado al jugarlo. Puedes descartarlo en lugar de pagar el Precio de un Objeto.' },
  // Matón Pirata ×4
  { id: 'hook_v_maton_1', name: 'Matón Pirata', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 3, strength: 4, effectIds: [], description: 'Sin Habilidad adicional.' },
  { id: 'hook_v_maton_2', name: 'Matón Pirata', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 3, strength: 4, effectIds: [], description: 'Sin Habilidad adicional.' },
  // Mecanismo Ingenioso ×1
  { id: 'hook_v_mecanismo', name: 'Mecanismo Ingenioso', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 2, effectIds: [], grantsActionSlot: { type: ActionType.MOVE_HERO }, description: 'Esta ubicación ofrece una acción extra: Mover un Héroe.' },
  // Obsesión ×2
  { id: 'hook_v_obsesion_1', name: 'Obsesión', type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0, effectIds: ['hook_obsesion_cond'], description: 'Cuando otro jugador derrote un Héroe de Fuerza 4+, revela tu mazo de Destino hasta un Héroe. Juégalo o descártalo.' },
  { id: 'hook_v_obsesion_2', name: 'Obsesión', type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0, effectIds: ['hook_obsesion_cond'], description: 'Cuando otro jugador derrote un Héroe de Fuerza 4+, revela tu mazo de Destino hasta un Héroe. Juégalo o descártalo.' },
  // Sable ×2
  { id: 'hook_v_sable_1', name: 'Sable', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1, effectIds: ['hook_sable_attach'], description: 'Únelo a un Aliado. Ese Aliado obtiene +2 Fuerza.' },
  { id: 'hook_v_sable_2', name: 'Sable', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1, effectIds: ['hook_sable_attach'], description: 'Únelo a un Aliado. Ese Aliado obtiene +2 Fuerza.' },
  // Pelotón de Abordaje ×3
  { id: 'hook_v_peloton_1', name: 'Pelotón de Abordaje', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0, strength: 2, effectIds: ['hook_peloton_adj_vanquish'], description: 'Al Vencer puede actuar desde su ubicación o una adyacente.' },
  { id: 'hook_v_peloton_2', name: 'Pelotón de Abordaje', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0, strength: 2, effectIds: ['hook_peloton_adj_vanquish'], description: 'Al Vencer puede actuar desde su ubicación o una adyacente.' },
  { id: 'hook_v_peloton_3', name: 'Pelotón de Abordaje', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0, strength: 2, effectIds: ['hook_peloton_adj_vanquish'], description: 'Al Vencer puede actuar desde su ubicación o una adyacente.' },
  // Perspicaz ×2
  { id: 'hook_v_perspicaz_1', name: 'Perspicaz', type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0, effectIds: ['hook_perspicaz_cond'], description: 'Si otro jugador tiene un Aliado de Fuerza 4+, puedes jugar un Aliado de tu mano de forma gratuita.' },
  { id: 'hook_v_perspicaz_2', name: 'Perspicaz', type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0, effectIds: ['hook_perspicaz_cond'], description: 'Si otro jugador tiene un Aliado de Fuerza 4+, puedes jugar un Aliado de tu mano de forma gratuita.' },
  // Rival Digno ×3
  { id: 'hook_v_rival_1', name: 'Rival Digno', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0, effectIds: ['hook_rival_digno'], description: 'Recibes 2 Monedas de Poder. Revela tu mazo de Destino hasta un Héroe. Juégalo y descarta el resto.' },
  { id: 'hook_v_rival_2', name: 'Rival Digno', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0, effectIds: ['hook_rival_digno'], description: 'Recibes 2 Monedas de Poder. Revela tu mazo de Destino hasta un Héroe. Juégalo y descarta el resto.' },
  { id: 'hook_v_rival_3', name: 'Rival Digno', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0, effectIds: ['hook_rival_digno'], description: 'Recibes 2 Monedas de Poder. Revela tu mazo de Destino hasta un Héroe. Juégalo y descarta el resto.' },
  // Sr. Smee ×1
  { id: 'hook_v_smee', name: 'Sr. Smee', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 2, strength: 2, effectIds: ['hook_smee_jollyroger'], description: 'Obtiene +2 Fuerza si está en el Jolly Roger.' },
  // Sr. Starkey ×1
  { id: 'hook_v_starkey', name: 'Sr. Starkey', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 2, strength: 2, effectIds: ['hook_starkey_move_hero'], description: 'Al jugarlo, puedes mover un Héroe a una ubicación adyacente.' },
];

// ─── FATE CARDS ───────────────────────────────────────────────────────────────

const fateCardDefs: CardDef[] = [
  // Burla ×2
  { id: 'hook_f_burla_1', name: 'Burla', type: CardType.ITEM, deck: CardDeck.FATE, villainId: 'hook', cost: 0, effectIds: ['hook_burla_attach'], description: 'Únela a un Héroe. Garfio debe derrotar primero a los Héroes con Burla.' },
  { id: 'hook_f_burla_2', name: 'Burla', type: CardType.ITEM, deck: CardDeck.FATE, villainId: 'hook', cost: 0, effectIds: ['hook_burla_attach'], description: 'Únela a un Héroe. Garfio debe derrotar primero a los Héroes con Burla.' },
  // Campanilla ×1
  { id: 'hook_f_campanilla', name: 'Campanilla', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 2, effectIds: ['hook_campanilla_discard_ally', 'hook_wendy_aura'], description: 'Al jugarla, puedes descartar un Aliado de su ubicación.' },
  // Gran Jaqueca ×2
  { id: 'hook_f_jaqueca_1', name: 'Gran Jaqueca', type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'hook', cost: 0, effectIds: ['hook_gran_jaqueca'], description: 'Descarta un Objeto del Reino del Capitán Garfio.' },
  { id: 'hook_f_jaqueca_2', name: 'Gran Jaqueca', type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'hook', cost: 0, effectIds: ['hook_gran_jaqueca'], description: 'Descarta un Objeto del Reino del Capitán Garfio.' },
  // Juan ×1
  { id: 'hook_f_juan', name: 'Juan', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 2, effectIds: ['hook_juan_item_bonus', 'hook_wendy_aura'], description: '+1 Fuerza si tiene algún Objeto unido.' },
  // Miguel ×1
  { id: 'hook_f_miguel', name: 'Miguel', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 1, effectIds: ['hook_miguel_hero_bonus', 'hook_wendy_aura'], description: '+1 Fuerza por cada ubicación del Reino de Garfio que tenga un Héroe.' },
  // Niños Perdidos ×2
  { id: 'hook_f_ninos_1', name: 'Niños Perdidos', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 4, effectIds: ['hook_wendy_aura', 'hook_require_two_allies'], description: 'Para derrotarlos se necesitan al menos dos Aliados.' },
  { id: 'hook_f_ninos_2', name: 'Niños Perdidos', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 4, effectIds: ['hook_wendy_aura', 'hook_require_two_allies'], description: 'Para derrotarlos se necesitan al menos dos Aliados.' },
  // Peter Pan ×1 — ID conservado para el seguimiento de la condición de victoria
  { id: 'hook_fate_peter_pan', name: 'Peter Pan', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 8, effectIds: ['hook_wendy_aura', 'hook_peter_pan_reveal'], description: 'Al ser revelado se juega inmediatamente en el Árbol del Ahorcado (incluso si está bloqueado).' },
  // Polvo de Hada ×3
  { id: 'hook_f_polvo_1', name: 'Polvo de Hada', type: CardType.ITEM, deck: CardDeck.FATE, villainId: 'hook', cost: 0, effectIds: ['hook_polvo_attach'], description: 'Únelo a un Héroe. Ese Héroe recibe +2 Fuerza.' },
  { id: 'hook_f_polvo_2', name: 'Polvo de Hada', type: CardType.ITEM, deck: CardDeck.FATE, villainId: 'hook', cost: 0, effectIds: ['hook_polvo_attach'], description: 'Únelo a un Héroe. Ese Héroe recibe +2 Fuerza.' },
  { id: 'hook_f_polvo_3', name: 'Polvo de Hada', type: CardType.ITEM, deck: CardDeck.FATE, villainId: 'hook', cost: 0, effectIds: ['hook_polvo_attach'], description: 'Únelo a un Héroe. Ese Héroe recibe +2 Fuerza.' },
  // Tic Tac ×1
  { id: 'hook_f_tictac', name: 'Tic Tac', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 5, effectIds: ['hook_wendy_aura', 'hook_tictac_hand_discard'], description: 'Si Garfio se mueve a la ubicación de Tic Tac, debe descartar su mano inmediatamente.' },
  // Wendy ×1 — aura handled by hook_wendy_aura on the other heroes
  { id: 'hook_f_wendy', name: 'Wendy', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 3, effectIds: [], description: 'Todos los demás Héroes del Reino reciben +1 Fuerza.' },
];

// ─── WIN CONDITION ────────────────────────────────────────────────────────────

function checkWinCondition(state: GameState, playerId: PlayerId): boolean {
  const player = getPlayer(state, playerId);
  return (
    player.completedObjectiveSteps.includes('PETER_PAN_DEFEATED_AT_JOLLYROGER') &&
    player.completedObjectiveSteps.includes('HANGMAN_UNLOCKED')
  );
}

// ─── PLUGIN EXPORT ────────────────────────────────────────────────────────────

export const hookPlugin: VillainPlugin = {
  id: 'hook',
  name: 'Capitán Garfio',
  color: '#8b1a1a',
  locations,
  villainCardDefs,
  fateCardDefs,
  effects,
  startingPower: 0,
  startingLocationId: 'jollyroger',
  handSize: 4,
  checkWinCondition,
};

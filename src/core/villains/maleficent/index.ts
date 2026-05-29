import { CardType, CardDeck, ActionType, EffectTrigger } from '../../types';
import type { VillainPlugin, EffectDef, CardDef, LocationDef, GameState, PlayerId } from '../../types';
import {
  getPlayer, updatePlayer, updateLocationState, updateCard,
  discardCardFromKingdom, addLog, getEffectiveStrength,
} from '../../engine/stateHelpers';

// ─── EFFECTS ─────────────────────────────────────────────────────────────────

const effects: EffectDef[] = [
  {
    id: 'mal_sinister_minion_bonus',
    trigger: EffectTrigger.CONTINUOUS,
    description: '+1 Fuerza si hay una Maldición en su ubicación',
    execute: (s) => s,
    computeStrengthBonus: (state, instId) => {
      const card = state.allCards[instId];
      if (!card?.locationId) return 0;
      const player = getPlayer(state, card.ownerId);
      const locState = player.locationStates[card.locationId];
      const hasCurse = locState.villainCardInstIds.some(
        id => state.allCards[id]?.cardType === CardType.CURSE,
      );
      return hasCurse ? 1 : 0;
    },
  },
  {
    id: 'mal_raven_activate',
    trigger: EffectTrigger.ACTIVATED,
    requiresTargetLocation: true,
    description: 'Mueve al Cuervo a una ubicación adyacente y realiza una acción allí (no FATE)',
    execute: (state, ctx) => {
      if (!ctx.targetLocationId) return state;
      const card = state.allCards[ctx.cardInstId];
      if (!card?.locationId) return state;
      const cur = getPlayer(state, ctx.actingPlayerId).locationStates[card.locationId];
      let s = updateLocationState(state, ctx.actingPlayerId, card.locationId, {
        villainCardInstIds: cur.villainCardInstIds.filter(id => id !== ctx.cardInstId),
      });
      const target = getPlayer(s, ctx.actingPlayerId).locationStates[ctx.targetLocationId];
      s = updateLocationState(s, ctx.actingPlayerId, ctx.targetLocationId, {
        villainCardInstIds: [...target.villainCardInstIds, ctx.cardInstId],
      });
      s = updateCard(s, ctx.cardInstId, { locationId: ctx.targetLocationId });
      s = { ...s, pendingCuervo: { playerId: ctx.actingPlayerId, locationId: ctx.targetLocationId } };
      return addLog(s, `El Cuervo se mueve a ${ctx.targetLocationId}.`);
    },
  },
  {
    id: 'mal_fauna_discard_curse',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Descarta una Maldición (Sueño Sin Sueños) de la ubicación donde se juega Fauna',
    execute: (state, ctx) => {
      if (!ctx.targetLocationId) return state;
      const player = getPlayer(state, ctx.actingPlayerId);
      const locState = player.locationStates[ctx.targetLocationId];
      const curseId = locState.villainCardInstIds.find(
        id => state.allCards[id]?.cardType === CardType.CURSE,
      );
      if (!curseId) return state;
      return addLog(discardCardFromKingdom(state, curseId), 'Fauna descarta una Maldición.');
    },
  },
  {
    id: 'mal_risueno_bonus',
    trigger: EffectTrigger.CONTINUOUS,
    description: '+1 Fuerza por cada Héroe en su ubicación',
    execute: (s) => s,
    computeStrengthBonus: (state, instId) => {
      const card = state.allCards[instId];
      if (!card?.locationId) return 0;
      const player = getPlayer(state, card.ownerId);
      return player.locationStates[card.locationId]?.heroCardInstIds.length ?? 0;
    },
  },
  {
    id: 'mal_espada_on_play',
    trigger: EffectTrigger.ON_PLAY,
    requiresTargetCard: 'HERO',
    description: 'Únela a un Héroe; ese Héroe recibe +2 de Fuerza',
    execute: (state, ctx) => {
      if (!ctx.targetCardInstId) return state;
      const hero = state.allCards[ctx.targetCardInstId];
      if (!hero) return state;
      let s = updateCard(state, ctx.cardInstId, {
        attachedToInstId: ctx.targetCardInstId,
        strengthModifier: 2,
      });
      s = updateCard(s, ctx.targetCardInstId, {
        attachedItemInstIds: [...hero.attachedItemInstIds, ctx.cardInstId],
        strengthModifier: hero.strengthModifier + 2,
      });
      return addLog(s, 'Espada de la Verdad: +2 Fuerza al Héroe.');
    },
  },
  {
    id: 'mal_aurora_reveal',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Revela la carta superior del mazo de Destino; si es Héroe, juégalo aquí',
    execute: (state, ctx) => {
      if (!ctx.targetLocationId) return state;
      const aurora = state.allCards[ctx.cardInstId];
      if (!aurora) return state;
      const malfPlayer = getPlayer(state, aurora.ownerId);
      if (malfPlayer.fateDeckInstIds.length === 0) return state;
      const topId = malfPlayer.fateDeckInstIds[0];
      const topCard = state.allCards[topId];
      if (!topCard) return state;
      let s = updatePlayer(state, aurora.ownerId, {
        fateDeckInstIds: malfPlayer.fateDeckInstIds.slice(1),
      });
      if (topCard.cardType === CardType.HERO) {
        const locState = getPlayer(s, aurora.ownerId).locationStates[ctx.targetLocationId];
        s = updateLocationState(s, aurora.ownerId, ctx.targetLocationId, {
          heroCardInstIds: [...locState.heroCardInstIds, topId],
        });
        s = updateCard(s, topId, { locationId: ctx.targetLocationId });
        return addLog(s, `Aurora revela ${topCard.name} y lo juega.`);
      }
      s = updatePlayer(s, aurora.ownerId, {
        fateDeckInstIds: [topId, ...getPlayer(s, aurora.ownerId).fateDeckInstIds],
      });
      return addLog(s, `Aurora revela ${topCard.name} (no Héroe), devuelve al mazo.`);
    },
  },
  {
    id: 'mal_felipe_discard_allies',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Descarta todos los Aliados de la ubicación del Príncipe Felipe',
    execute: (state, ctx) => {
      if (!ctx.targetLocationId) return state;
      const card = state.allCards[ctx.cardInstId];
      if (!card) return state;
      const locState = getPlayer(state, card.ownerId).locationStates[ctx.targetLocationId];
      const allyIds = locState.villainCardInstIds.filter(
        id => state.allCards[id]?.cardType === CardType.ALLY,
      );
      if (allyIds.length === 0) return state;
      let s = state;
      for (const allyId of allyIds) s = discardCardFromKingdom(s, allyId);
      return addLog(s, `Príncipe Felipe descarta ${allyIds.length} Aliado(s).`);
    },
  },
  {
    id: 'mal_estefano_move_pawn',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Mueve a Maléfica a la ubicación con más Héroes',
    execute: (state, ctx) => {
      const card = state.allCards[ctx.cardInstId];
      if (!card) return state;
      const player = getPlayer(state, card.ownerId);
      const best = Object.values(player.locationStates)
        .sort((a, b) => b.heroCardInstIds.length - a.heroCardInstIds.length)[0];
      if (!best || best.id === player.pawnLocationId) return state;
      const s = updatePlayer(state, card.ownerId, { pawnLocationId: best.id });
      return addLog(s, `Rey Estéfano mueve a Maléfica a ${best.id}.`);
    },
  },
  {
    id: 'mal_huberto_move_allies',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Mueve un Aliado de cada ubicación adyacente a la de Rey Huberto',
    execute: (state, ctx) => {
      if (!ctx.targetLocationId) return state;
      const card = state.allCards[ctx.cardInstId];
      if (!card) return state;
      const locDef = locations.find(l => l.id === ctx.targetLocationId);
      if (!locDef) return state;
      let s = state;
      for (const adjId of locDef.adjacentIds) {
        const adjLoc = getPlayer(s, card.ownerId).locationStates[adjId];
        if (!adjLoc) continue;
        const allyId = adjLoc.villainCardInstIds.find(
          id => s.allCards[id]?.cardType === CardType.ALLY,
        );
        if (!allyId) continue;
        const updAdj = getPlayer(s, card.ownerId).locationStates[adjId];
        s = updateLocationState(s, card.ownerId, adjId, {
          villainCardInstIds: updAdj.villainCardInstIds.filter(id => id !== allyId),
        });
        const updDest = getPlayer(s, card.ownerId).locationStates[ctx.targetLocationId];
        s = updateLocationState(s, card.ownerId, ctx.targetLocationId, {
          villainCardInstIds: [...updDest.villainCardInstIds, allyId],
        });
        s = updateCard(s, allyId, { locationId: ctx.targetLocationId });
      }
      return addLog(s, `Rey Huberto reagrupa Aliados en ${ctx.targetLocationId}.`);
    },
  },
  {
    id: 'mal_una_vez_suenos',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Descarta una Maldición de una ubicación con al menos un Héroe',
    execute: (state, ctx) => {
      const card = state.allCards[ctx.cardInstId];
      if (!card) return state;
      if (ctx.targetCardInstId) {
        const target = state.allCards[ctx.targetCardInstId];
        if (target?.cardType !== CardType.CURSE || !target.locationId) return state;
        const locState = getPlayer(state, card.ownerId).locationStates[target.locationId];
        if (!locState || locState.heroCardInstIds.length === 0) return state;
        return addLog(discardCardFromKingdom(state, ctx.targetCardInstId), 'Una vez en sueños: Maldición descartada.');
      }
      const player = getPlayer(state, card.ownerId);
      for (const locState of Object.values(player.locationStates)) {
        if (locState.heroCardInstIds.length === 0) continue;
        const curseId = locState.villainCardInstIds.find(
          id => state.allCards[id]?.cardType === CardType.CURSE,
        );
        if (curseId) return addLog(discardCardFromKingdom(state, curseId), 'Una vez en sueños: Maldición descartada.');
      }
      return state;
    },
  },
  {
    id: 'mal_forma_dragon',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Derrota a un Héroe de Fuerza 3 o inferior; si eres objetivo de Destino antes de tu próximo turno, ganas 3 Poder',
    execute: (state, ctx) => {
      const player = getPlayer(state, ctx.actingPlayerId);
      let heroId = ctx.targetCardInstId;
      if (!heroId) {
        for (const locState of Object.values(player.locationStates)) {
          const h = locState.heroCardInstIds.find(id => getEffectiveStrength(state, id) <= 3);
          if (h) { heroId = h; break; }
        }
      }
      if (!heroId) return addLog(state, 'Forma de Dragón: no hay Héroe de Fuerza ≤3.');
      const hero = state.allCards[heroId];
      if (!hero || getEffectiveStrength(state, heroId) > 3) return state;
      let s = discardCardFromKingdom(state, heroId);
      s = updatePlayer(s, ctx.actingPlayerId, { dragonActive: true });
      return addLog(s, `Forma de Dragón derrota a ${hero.name}. Maléfica está en alerta.`);
    },
  },
  {
    id: 'mal_sueno_hero_debuff',
    trigger: EffectTrigger.CONTINUOUS,
    description: 'Marcador: los héroes en esta ubicación reciben -2 Fuerza (evaluado por mal_sueno_victim)',
    execute: (s) => s,
  },
  {
    id: 'mal_sueno_victim',
    trigger: EffectTrigger.CONTINUOUS,
    description: '-2 Fuerza si hay un Sueño Sin Sueños en esta ubicación',
    execute: (s) => s,
    computeStrengthBonus: (state, instId) => {
      const card = state.allCards[instId];
      if (!card?.locationId) return 0;
      const player = getPlayer(state, card.ownerId);
      const locState = player.locationStates[card.locationId];
      const hasSueno = locState.villainCardInstIds.some(
        id => state.allCards[id]?.effectIds.includes('mal_sueno_hero_debuff'),
      );
      return hasSueno ? -2 : 0;
    },
  },
  {
    id: 'mal_sueno_on_ally_placed',
    trigger: EffectTrigger.ON_ALLY_PLACED,
    description: 'Se descarta cuando se juega un Aliado en esta ubicación',
    execute: (state, ctx) => discardCardFromKingdom(state, ctx.cardInstId),
  },
  {
    id: 'mal_fuego_verde_effect',
    trigger: EffectTrigger.ON_PAWN_ARRIVES,
    description: 'Se descarta cuando Maléfica llega a esta ubicación; bloquea héroes',
    blocksHeroPlay: true,
    execute: (state, ctx) => discardCardFromKingdom(state, ctx.cardInstId),
  },
  {
    id: 'mal_primavera_block_curse',
    trigger: EffectTrigger.ON_PLAY,
    description: 'No se pueden jugar Maldiciones en esta ubicación',
    execute: (s) => s,
    blocksCursePlay: true,
  },
  {
    id: 'mal_rueca_power',
    trigger: EffectTrigger.ON_HERO_PLAYED_HERE,
    description: 'Gana Poder igual a la Fuerza del Héroe jugado aquí',
    execute: (state, ctx) => {
      if (!ctx.targetCardInstId) return state;
      const rueca = state.allCards[ctx.cardInstId];
      if (!rueca) return state;
      const heroStr = getEffectiveStrength(state, ctx.targetCardInstId);
      const owner = getPlayer(state, rueca.ownerId);
      return addLog(
        updatePlayer(state, rueca.ownerId, { power: owner.power + heroStr }),
        `Rueca: ${owner.name} gana ${heroStr} de Poder.`,
      );
    },
  },
  {
    id: 'mal_cetro_cost_reduce',
    trigger: EffectTrigger.CONTINUOUS,
    description: '-1 al coste de Efectos y Maldiciones si Maléfica está en esta ubicación',
    execute: (s) => s,
    computePlayCostModifier: (state, playerId, cardToPlay, effectCardInstId, _targetLocationId) => {
      if (cardToPlay.cardType !== CardType.EFFECT && cardToPlay.cardType !== CardType.CURSE) return 0;
      const cetro = state.allCards[effectCardInstId];
      if (!cetro?.locationId) return 0;
      return getPlayer(state, playerId).pawnLocationId === cetro.locationId ? -1 : 0;
    },
  },
  {
    id: 'mal_espada_cost',
    trigger: EffectTrigger.CONTINUOUS,
    description: '+2 al coste de Maldiciones en la ubicación del Héroe portador',
    execute: (s) => s,
    computePlayCostModifier: (_state, _playerId, cardToPlay, effectCardInstId, targetLocationId) => {
      if (cardToPlay.cardType !== CardType.CURSE) return 0;
      const espada = _state.allCards[effectCardInstId];
      if (!espada?.locationId) return 0;
      return espada.locationId === targetLocationId ? 2 : 0;
    },
  },
  {
    id: 'mal_desaparecer',
    trigger: EffectTrigger.ON_PLAY,
    description: 'En el próximo turno puedes permanecer en tu ubicación actual',
    execute: (state, ctx) => {
      const s = updatePlayer(state, ctx.actingPlayerId, { skipNextMove: true });
      return addLog(s, `${getPlayer(s, ctx.actingPlayerId).name} puede permanecer en su ubicación el próximo turno.`);
    },
  },
  {
    id: 'mal_selva_curse',
    trigger: EffectTrigger.ON_HERO_PLAYED_HERE,
    description: 'Se descarta cuando se juega un Héroe aquí. Bloquea Héroes de Fuerza < 4.',
    execute: (state, ctx) => addLog(discardCardFromKingdom(state, ctx.cardInstId), 'Selva de Mortales Espinos descartada.'),
    heroMinStrengthRequired: 4,
  },
  {
    id: 'mal_flora_reveal_hand',
    trigger: EffectTrigger.ON_PLAY,
    description: 'La mano de Maléfica queda al descubierto mientras Flora esté en el Reino',
    execute: (state, ctx) => {
      const flora = state.allCards[ctx.cardInstId];
      if (!flora) return state;
      return addLog(state, `Flora: La mano de ${getPlayer(state, flora.ownerId).name} está al descubierto.`);
    },
  },
  {
    id: 'mal_malicia_cond',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Reacción: derrota un Héroe de Fuerza ≤4 en tu Reino',
    execute: (s) => s,
    conditionTrigger: 'VANQUISH_4PLUS',
  },
  {
    id: 'mal_tirania_cond',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Reacción: roba 3 cartas y descarta 3',
    execute: (s) => s,
    conditionTrigger: 'ALLY_3PLUS',
  },
  {
    id: 'mal_require_two_allies',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Requiere al menos dos Aliados para ser derrotado',
    execute: (s) => s,
    requiresMultipleAlliesToVanquish: true,
  },
];

// ─── LOCATIONS ───────────────────────────────────────────────────────────────

const locations: LocationDef[] = [
  {
    id: 'montanas',
    name: 'Montañas Prohibidas',
    actions: [
      { type: ActionType.MOVE_ITEM_ALLY },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.GAIN_POWER, value: 1 },
      { type: ActionType.FATE },
    ],
    adjacentIds: ['cabana'],
  },
  {
    id: 'cabana',
    name: 'La Cabaña de Briar Rose',
    actions: [
      { type: ActionType.GAIN_POWER, value: 2 },
      { type: ActionType.MOVE_ITEM_ALLY },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.DISCARD },
    ],
    adjacentIds: ['montanas', 'bosque'],
  },
  {
    id: 'bosque',
    name: 'El Bosque',
    actions: [
      { type: ActionType.DISCARD },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.GAIN_POWER, value: 3 },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: ['cabana', 'castillo'],
  },
  {
    id: 'castillo',
    name: 'El Castillo del Rey Stefan',
    actions: [
      { type: ActionType.GAIN_POWER, value: 1 },
      { type: ActionType.FATE },
      { type: ActionType.VANQUISH },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: ['bosque'],
  },
];

// ─── VILLAIN CARDS ────────────────────────────────────────────────────────────

const villainCardDefs: CardDef[] = [
  // El Cuervo ×1
  { id: 'mal_v_cuervo', name: 'El Cuervo', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, strength: 1, activationCost: 0, effectIds: ['mal_raven_activate'], description: 'ACTIVAR: muévelo a una ubicación adyacente y lleva a cabo una de las acciones disponibles. No puede realizar acciones Destino.' },
  // Rueca ×1
  { id: 'mal_v_rueca', name: 'Rueca', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 1, effectIds: ['mal_rueca_power'], description: 'Si un Héroe es jugado en esta ubicación, recibes una cantidad de Poder equivalente a la Fuerza de ese Héroe.' },
  // Cetro ×1
  { id: 'mal_v_cetro', name: 'Cetro', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 1, effectIds: ['mal_cetro_cost_reduce'], description: 'Si Maléfica está en esta ubicación, el coste de jugar un Efecto o una Maldición se reduce en 1.' },
  // Sueño Sin Sueños ×2
  { id: 'mal_v_sueno_1', name: 'Sueño Sin Sueños', type: CardType.CURSE, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, effectIds: ['mal_sueno_hero_debuff', 'mal_sueno_on_ally_placed'], description: 'Los Héroes de esta ubicación reciben -2 Fuerza. Se descarta cuando se juegue un Aliado aquí.' },
  { id: 'mal_v_sueno_2', name: 'Sueño Sin Sueños', type: CardType.CURSE, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, effectIds: ['mal_sueno_hero_debuff', 'mal_sueno_on_ally_placed'], description: 'Los Héroes de esta ubicación reciben -2 Fuerza. Se descarta cuando se juegue un Aliado aquí.' },
  // Malicia ×2
  { id: 'mal_v_malicia_1', name: 'Malicia', type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 0, effectIds: ['mal_malicia_cond'], description: 'Cuando otro jugador derrote un Héroe de Fuerza 4+, puedes derrotar un Héroe de Fuerza 4 o inferior.' },
  { id: 'mal_v_malicia_2', name: 'Malicia', type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 0, effectIds: ['mal_malicia_cond'], description: 'Cuando otro jugador derrote un Héroe de Fuerza 4+, puedes derrotar un Héroe de Fuerza 4 o inferior.' },
  // Tiranía ×2
  { id: 'mal_v_tirania_1', name: 'Tiranía', type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 0, effectIds: ['mal_tirania_cond'], description: 'Cuando otro jugador tenga 3+ Aliados en su Reino, puedes robar 3 cartas y descartar 3.' },
  { id: 'mal_v_tirania_2', name: 'Tiranía', type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 0, effectIds: ['mal_tirania_cond'], description: 'Cuando otro jugador tenga 3+ Aliados en su Reino, puedes robar 3 cartas y descartar 3.' },
  // Desaparecer ×3
  { id: 'mal_v_desaparecer_1', name: 'Desaparecer', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 0, effectIds: ['mal_desaparecer'], description: 'En tu próximo turno Maléfica no necesita moverse a una nueva ubicación.' },
  { id: 'mal_v_desaparecer_2', name: 'Desaparecer', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 0, effectIds: ['mal_desaparecer'], description: 'En tu próximo turno Maléfica no necesita moverse a una nueva ubicación.' },
  { id: 'mal_v_desaparecer_3', name: 'Desaparecer', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 0, effectIds: ['mal_desaparecer'], description: 'En tu próximo turno Maléfica no necesita moverse a una nueva ubicación.' },
  // Esbirro Risueño ×3
  { id: 'mal_v_risueno_1', name: 'Esbirro Risueño', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 1, strength: 1, effectIds: ['mal_risueno_bonus'], description: '+1 Fuerza por cada Héroe en su ubicación.' },
  { id: 'mal_v_risueno_2', name: 'Esbirro Risueño', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 1, strength: 1, effectIds: ['mal_risueno_bonus'], description: '+1 Fuerza por cada Héroe en su ubicación.' },
  { id: 'mal_v_risueno_3', name: 'Esbirro Risueño', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 1, strength: 1, effectIds: ['mal_risueno_bonus'], description: '+1 Fuerza por cada Héroe en su ubicación.' },
  // Esbirro Salvaje ×3
  { id: 'mal_v_salvaje_1', name: 'Esbirro Salvaje', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, strength: 4, effectIds: [], description: 'Sin Habilidad adicional.' },
  { id: 'mal_v_salvaje_2', name: 'Esbirro Salvaje', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, strength: 4, effectIds: [], description: 'Sin Habilidad adicional.' },
  { id: 'mal_v_salvaje_3', name: 'Esbirro Salvaje', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, strength: 4, effectIds: [], description: 'Sin Habilidad adicional.' },
  // Esbirro Siniestro ×3
  { id: 'mal_v_siniestro_1', name: 'Esbirro Siniestro', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 2, strength: 3, effectIds: ['mal_sinister_minion_bonus'], description: '+1 Fuerza si hay alguna Maldición en su ubicación.' },
  { id: 'mal_v_siniestro_2', name: 'Esbirro Siniestro', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 2, strength: 3, effectIds: ['mal_sinister_minion_bonus'], description: '+1 Fuerza si hay alguna Maldición en su ubicación.' },
  { id: 'mal_v_siniestro_3', name: 'Esbirro Siniestro', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 2, strength: 3, effectIds: ['mal_sinister_minion_bonus'], description: '+1 Fuerza si hay alguna Maldición en su ubicación.' },
  // Forma de Dragón ×3
  { id: 'mal_v_dragon_1', name: 'Forma de Dragón', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, effectIds: ['mal_forma_dragon'], description: 'Derrota a un Héroe de Fuerza 3 o inferior. Si eres blanco de Destino antes de tu próximo turno, ganas 3 Monedas de Poder.' },
  { id: 'mal_v_dragon_2', name: 'Forma de Dragón', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, effectIds: ['mal_forma_dragon'], description: 'Derrota a un Héroe de Fuerza 3 o inferior. Si eres blanco de Destino antes de tu próximo turno, ganas 3 Monedas de Poder.' },
  { id: 'mal_v_dragon_3', name: 'Forma de Dragón', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, effectIds: ['mal_forma_dragon'], description: 'Derrota a un Héroe de Fuerza 3 o inferior. Si eres blanco de Destino antes de tu próximo turno, ganas 3 Monedas de Poder.' },
  // Fuego Verde ×3
  { id: 'mal_v_fuego_1', name: 'Fuego Verde', type: CardType.CURSE, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, effectIds: ['mal_fuego_verde_effect'], description: 'No se pueden jugar Héroes en esta ubicación. Se descarta si Maléfica se mueve aquí.' },
  { id: 'mal_v_fuego_2', name: 'Fuego Verde', type: CardType.CURSE, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, effectIds: ['mal_fuego_verde_effect'], description: 'No se pueden jugar Héroes en esta ubicación. Se descarta si Maléfica se mueve aquí.' },
  { id: 'mal_v_fuego_3', name: 'Fuego Verde', type: CardType.CURSE, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, effectIds: ['mal_fuego_verde_effect'], description: 'No se pueden jugar Héroes en esta ubicación. Se descarta si Maléfica se mueve aquí.' },
  // Selva de Mortales Espinos (carta) ×2
  { id: 'mal_v_selva_1', name: 'Selva de Mortales Espinos', type: CardType.CURSE, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 2, effectIds: ['mal_selva_curse'], description: 'Los Héroes deben tener Fuerza 4+ para jugarse aquí. Se descarta cuando se juegue un Héroe en esta ubicación.' },
  { id: 'mal_v_selva_2', name: 'Selva de Mortales Espinos', type: CardType.CURSE, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 2, effectIds: ['mal_selva_curse'], description: 'Los Héroes deben tener Fuerza 4+ para jugarse aquí. Se descarta cuando se juegue un Héroe en esta ubicación.' },
  { id: 'mal_v_selva_3', name: 'Selva de Mortales Espinos', type: CardType.CURSE, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 2, effectIds: ['mal_selva_curse'], description: 'Los Héroes deben tener Fuerza 4+ para jugarse aquí. Se descarta cuando se juegue un Héroe en esta ubicación.' },
];

// ─── FATE CARDS ───────────────────────────────────────────────────────────────

const fateCardDefs: CardDef[] = [
  // Aurora ×1
  { id: 'mal_f_aurora', name: 'Aurora', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 4, effectIds: ['mal_aurora_reveal', 'mal_sueno_victim'], description: 'Al jugarla, revela la carta superior del mazo de Destino de Maléfica. Si es un Héroe, juégalo. Si no, devuélvelo arriba.' },
  // Espada de la Verdad ×3
  { id: 'mal_f_espada_1', name: 'Espada de la Verdad', type: CardType.ITEM, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, effectIds: ['mal_espada_on_play', 'mal_espada_cost'], description: 'Únela a un Héroe sin Objeto. Ese Héroe recibe +2 Fuerza. El coste de Maldiciones en esa ubicación aumenta en +2.' },
  { id: 'mal_f_espada_2', name: 'Espada de la Verdad', type: CardType.ITEM, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, effectIds: ['mal_espada_on_play', 'mal_espada_cost'], description: 'Únela a un Héroe sin Objeto. Ese Héroe recibe +2 Fuerza. El coste de Maldiciones en esa ubicación aumenta en +2.' },
  { id: 'mal_f_espada_3', name: 'Espada de la Verdad', type: CardType.ITEM, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, effectIds: ['mal_espada_on_play', 'mal_espada_cost'], description: 'Únela a un Héroe sin Objeto. Ese Héroe recibe +2 Fuerza. El coste de Maldiciones en esa ubicación aumenta en +2.' },
  // Fauna ×1
  { id: 'mal_f_fauna', name: 'Fauna', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 2, effectIds: ['mal_fauna_discard_curse', 'mal_sueno_victim'], description: 'Al jugarla, puedes descartar Sueño Sin Sueños de la ubicación donde la juegues.' },
  // Flora ×1
  { id: 'mal_f_flora', name: 'Flora', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 3, effectIds: ['mal_flora_reveal_hand', 'mal_sueno_victim'], description: 'Maléfica debe revelar su mano. Hasta que Flora sea derrotada, Maléfica juega con las cartas visibles.' },
  // Guardias ×3
  { id: 'mal_f_guardias_1', name: 'Guardias', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 3, effectIds: ['mal_sueno_victim', 'mal_require_two_allies'], description: 'Para derrotarlos se deben utilizar al menos dos Aliados.' },
  { id: 'mal_f_guardias_2', name: 'Guardias', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 3, effectIds: ['mal_sueno_victim', 'mal_require_two_allies'], description: 'Para derrotarlos se deben utilizar al menos dos Aliados.' },
  { id: 'mal_f_guardias_3', name: 'Guardias', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 3, effectIds: ['mal_sueno_victim', 'mal_require_two_allies'], description: 'Para derrotarlos se deben utilizar al menos dos Aliados.' },
  // Primavera ×1
  { id: 'mal_f_primavera', name: 'Primavera', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 4, effectIds: ['mal_sueno_victim', 'mal_primavera_block_curse'], description: 'No se pueden jugar Maldiciones en la ubicación de Primavera.' },
  // Príncipe Felipe ×1
  { id: 'mal_f_felipe', name: 'Príncipe Felipe', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 5, effectIds: ['mal_felipe_discard_allies', 'mal_sueno_victim'], description: 'Al jugarlo, puedes descartar todos los Aliados de su ubicación.' },
  // Rey Estéfano ×1
  { id: 'mal_f_estefano', name: 'Rey Estéfano', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 5, effectIds: ['mal_estefano_move_pawn', 'mal_sueno_victim'], description: 'Al jugarlo, puedes mover a Maléfica a cualquier ubicación.' },
  // Rey Huberto ×1
  { id: 'mal_f_huberto', name: 'Rey Huberto', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 3, effectIds: ['mal_huberto_move_allies', 'mal_sueno_victim'], description: 'Al jugarlo, puedes mover un Aliado de cada ubicación adyacente a la ubicación del Rey Huberto.' },
  // Una vez en sueños ×2
  { id: 'mal_f_suenos_1', name: 'Una vez en sueños', type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, effectIds: ['mal_una_vez_suenos'], description: 'Descarta una Maldición de una ubicación del Reino de Maléfica que tenga un Héroe.' },
  { id: 'mal_f_suenos_2', name: 'Una vez en sueños', type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, effectIds: ['mal_una_vez_suenos'], description: 'Descarta una Maldición de una ubicación del Reino de Maléfica que tenga un Héroe.' },
];

// ─── WIN CONDITION ────────────────────────────────────────────────────────────

function checkWinCondition(state: GameState, playerId: PlayerId): boolean {
  const player = getPlayer(state, playerId);
  for (const locId of Object.keys(player.locationStates)) {
    const locState = player.locationStates[locId];
    const hasCurse = locState.villainCardInstIds.some(
      id => state.allCards[id]?.cardType === CardType.CURSE,
    );
    if (!hasCurse) return false;
  }
  return true;
}

// ─── PLUGIN EXPORT ────────────────────────────────────────────────────────────

export const maleficentPlugin: VillainPlugin = {
  id: 'maleficent',
  name: 'Maléfica',
  color: '#4a0080',
  locations,
  villainCardDefs,
  fateCardDefs,
  effects,
  startingPower: 0,
  startingLocationId: 'montanas',
  handSize: 4,
  checkWinCondition,
};

import { CardType, EffectTrigger } from '../../types';
import type { EffectDef } from '../../types';
import {
  getPlayer, updatePlayer, updateLocationState, updateCard,
  discardCardFromKingdom, addLog, getEffectiveStrength, shuffle,
} from '../../engine/stateHelpers';
import { locations } from './cards';

export const effects: EffectDef[] = [
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
    description: 'Mueve al Cuervo a cualquier ubicación y realiza una acción allí (no FATE)',
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
      // Fauna is a fate card — ownerId is the target villain (Maleficent), not actingPlayerId
      const card = state.allCards[ctx.cardInstId];
      if (!card) return state;
      const player = getPlayer(state, card.ownerId);
      const locState = player.locationStates[ctx.targetLocationId];
      if (!locState) return state;
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
    description: 'Revela la carta superior del mazo de Destino; si es Héroe, elige dónde colocarlo',
    execute: (state, ctx) => {
      const aurora = state.allCards[ctx.cardInstId];
      if (!aurora) return state;
      let s = state;
      let malfPlayer = getPlayer(s, aurora.ownerId);

      // Si el mazo está vacío pero hay descarte, barajar y recargar
      if (malfPlayer.fateDeckInstIds.length === 0 && malfPlayer.fateDiscardInstIds.length > 0) {
        s = updatePlayer(s, aurora.ownerId, {
          fateDeckInstIds: shuffle(malfPlayer.fateDiscardInstIds),
          fateDiscardInstIds: [],
        });
        s = addLog(s, 'Se barajea el descarte de Destino.');
        malfPlayer = getPlayer(s, aurora.ownerId);
      }

      // Si aún así no hay cartas, salir
      if (malfPlayer.fateDeckInstIds.length === 0) return s;
      const topId = malfPlayer.fateDeckInstIds[0];
      const topCard = s.allCards[topId];
      if (!topCard) return s;
      s = updatePlayer(s, aurora.ownerId, {
        fateDeckInstIds: malfPlayer.fateDeckInstIds.slice(1),
      });
      if (topCard.cardType === CardType.HERO) {
        s = addLog(s, `Aurora revela ${topCard.name}. Elige una ubicación.`);
        return {
          ...s,
          pendingAuroraHero: {
            heroInstId: topId,
            targetPlayerId: aurora.ownerId,
            actingPlayerId: ctx.actingPlayerId,
            isHero: true,
          },
        };
      }
      // No-héroe: devuelve al mazo y muestra brevemente la carta
      s = updatePlayer(s, aurora.ownerId, {
        fateDeckInstIds: [topId, ...getPlayer(s, aurora.ownerId).fateDeckInstIds],
      });
      s = addLog(s, `Aurora revela ${topCard.name} (no Héroe), devuelve al mazo.`);
      return {
        ...s,
        pendingAuroraHero: {
          heroInstId: topId,
          targetPlayerId: aurora.ownerId,
          actingPlayerId: ctx.actingPlayerId,
          isHero: false,
        },
      };
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
      const best = Object.entries(player.locationStates)
        .filter(([locId]) => locId !== player.pawnLocationId)
        .sort(([, a], [, b]) => b.heroCardInstIds.length - a.heroCardInstIds.length)[0];
      if (!best) return state;
      const [bestLocId] = best;
      const s = updatePlayer(state, card.ownerId, { pawnLocationId: bestLocId });
      return addLog(s, `Rey Estéfano mueve a Maléfica a ${bestLocId}.`);
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
    requiresTargetCard: 'CURSE',
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

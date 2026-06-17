import { CardType, EffectTrigger } from '../../types';
import type {
  EffectDef, GameState, PlayerId, CardInstId, CardInst,
} from '../../types';
import { EffectId, CardDefId } from '../effectIds';
import {
  getPlayer, updatePlayer, updateLocationState, updateCard, addLog, applyPowerGain,
  moveAttachedItems, discardCardFromKingdom,
} from '../../engine/stateHelpers';
import { JhonLocationId } from './cards';

export const effects: EffectDef[] = [

  // Robin Hood — CONTINUOUS: -1 to all PJ power gains
  {
    id: EffectId.JHON_ROBIN_POWER_MOD,
    trigger: EffectTrigger.CONTINUOUS,
    description: 'Reduce las ganancias de Poder del Príncipe Juan en -1.',
    execute: (s) => s,
    computePowerGainModifier: (state, playerId, cardInstId): number => {
      if (state.allCards[cardInstId]?.defId !== CardDefId.JHON_ROBIN_HOOD) return 0;
      const player = getPlayer(state, playerId);
      const inKingdom = Object.values(player.locationStates).some(ls =>
        ls.heroCardInstIds.includes(cardInstId),
      );
      return inKingdom ? -1 : 0;
    },
  },

  // Alan-a-Dale receiver — placed on all OTHER heroes: +1 str if Alan in kingdom
  {
    id: EffectId.JHON_ALAN_CHECK,
    trigger: EffectTrigger.CONTINUOUS,
    description: '+1 Fuerza si Alan-a-Dale está en el Reino.',
    execute: (s) => s,
    computeStrengthBonus: (state, cardInstId): number => {
      const card = state.allCards[cardInstId];
      if (!card?.ownerId) return 0;
      const player = getPlayer(state, card.ownerId);
      const alanPresent = Object.values(player.locationStates).some(ls =>
        ls.heroCardInstIds.some(id => state.allCards[id]?.defId === CardDefId.JHON_ALAN_A_DALE),
      );
      return alanPresent ? 1 : 0;
    },
  },

  // Lelo receiver — placed on OTHER allies at same location: +1 str if Lelo is there
  {
    id: EffectId.JHON_LELO_CHECK,
    trigger: EffectTrigger.CONTINUOUS,
    description: '+1 Fuerza si Lelo está en la misma ubicación.',
    execute: (s) => s,
    computeStrengthBonus: (state, cardInstId): number => {
      const card = state.allCards[cardInstId];
      if (!card?.locationId || !card.ownerId) return 0;
      const locState = getPlayer(state, card.ownerId).locationStates[card.locationId];
      if (!locState) return 0;
      return locState.villainCardInstIds.some(
        id => id !== cardInstId && state.allCards[id]?.defId === CardDefId.JHON_LELO,
      ) ? 1 : 0;
    },
  },

  // Tiro Listo receiver — placed on OTHER allies at same location: -1 str if Tiro is there
  {
    id: EffectId.JHON_TIRO_CHECK,
    trigger: EffectTrigger.CONTINUOUS,
    description: '-1 Fuerza si Tiro Listo está en la misma ubicación.',
    execute: (s) => s,
    computeStrengthBonus: (state, cardInstId): number => {
      const card = state.allCards[cardInstId];
      if (!card?.locationId || !card.ownerId) return 0;
      const locState = getPlayer(state, card.ownerId).locationStates[card.locationId];
      if (!locState) return 0;
      return locState.villainCardInstIds.some(
        id => id !== cardInstId && state.allCards[id]?.defId === CardDefId.JHON_TIRO_LISTO,
      ) ? -1 : 0;
    },
  },

  // Corona del Rey Ricardo — CONTINUOUS: -1 to all play costs if PJ is at this location
  {
    id: EffectId.JHON_CORONA_COST,
    trigger: EffectTrigger.CONTINUOUS,
    description: '-1 al coste de todas las cartas si el Príncipe Juan está aquí.',
    execute: (s) => s,
    computePlayCostModifier: (
      state: GameState,
      playerId: PlayerId,
      _cardToPlay: CardInst,
      effectCardInstId: CardInstId,
    ): number => {
      const coronaCard = state.allCards[effectCardInstId];
      if (!coronaCard?.locationId) return 0;
      return getPlayer(state, playerId).pawnLocationId === coronaCard.locationId ? -1 : 0;
    },
  },

  // Orden de Búsqueda — ON_HERO_PLAYED_HERE: +2 power
  {
    id: EffectId.JHON_ORDEN_POWER,
    trigger: EffectTrigger.ON_HERO_PLAYED_HERE,
    description: 'Recibe 2 Monedas de Poder cuando se juegue un Héroe en esta ubicación.',
    execute: (state, ctx): GameState => {
      const ordenCard = state.allCards[ctx.cardInstId];
      if (!ordenCard) return state;
      const s = applyPowerGain(state, ordenCard.ownerId, 2);
      return addLog(s, `Orden de Búsqueda: ${getPlayer(s, ordenCard.ownerId).name} gana 2 de Poder.`);
    },
  },

  // Arqueros Lobo — CONTINUOUS: can vanquish from adjacent
  {
    id: EffectId.JHON_ARQUERO_ADJ,
    trigger: EffectTrigger.CONTINUOUS,
    description: 'Puede usarse para derrotar a un Héroe en una ubicación adyacente.',
    execute: (s) => s,
    canVanquishFromAdjacent: true,
  },

  // Sheriff de Nottingham — marcador CONTINUOUS (permite detectar la carta)
  {
    id: EffectId.JHON_SHERIF,
    trigger: EffectTrigger.CONTINUOUS,
    description: 'Antes de mover al Príncipe Juan, muévelo a una ubicación adyacente y recibe 1 Moneda si hay Héroes allí.',
    execute: (s) => s,
  },

  // Sir Hiss — marcador CONTINUOUS: si el peón está en su ubicación, destapa una casilla.
  // La lógica vive en getCoveredSlotIndices (slotHelpers); aquí solo se declara el efecto.
  {
    id: EffectId.JHON_HISS,
    trigger: EffectTrigger.CONTINUOUS,
    description: 'Si el Príncipe Juan está en su ubicación, puedes realizar una acción tapada.',
    execute: (s) => s,
  },

  // Cobardía condition — ALLY_3PLUS trigger (stub)
  {
    id: EffectId.JHON_COBARDIA_COND,
    trigger: EffectTrigger.CONTINUOUS,
    description: 'Si otro jugador tiene 3+ Aliados, juega un Aliado de tu mano gratis.',
    execute: (s) => s,
    conditionTrigger: 'ALLY_3PLUS',
  },

  // Apreciados Impuestos — ON_PLAY: +1 power per hero in kingdom
  {
    id: EffectId.JHON_IMPUESTOS,
    trigger: EffectTrigger.ON_PLAY,
    description: 'Recibe 1 Moneda de Poder por cada Héroe en tu Reino.',
    execute: (state, ctx): GameState => {
      const player = getPlayer(state, ctx.actingPlayerId);
      const heroCount = Object.values(player.locationStates)
        .reduce((sum, ls) => sum + ls.heroCardInstIds.length, 0);
      if (heroCount === 0) return state;
      const s = applyPowerGain(state, ctx.actingPlayerId, heroCount);
      return addLog(s, `Apreciados Impuestos: +${heroCount} Poder.`);
    },
  },

  // Little John — ON_PLAY: take up to 4 power from PJ, store on card
  {
    id: EffectId.JHON_LITTLE_JOHN,
    trigger: EffectTrigger.ON_PLAY,
    description: 'Coge hasta 4 Monedas al Príncipe Juan y ponlas sobre Little John.',
    execute: (state, ctx): GameState => {
      const ljCard = state.allCards[ctx.cardInstId];
      if (!ljCard) return state;
      const pjId = ljCard.ownerId;
      const pj = getPlayer(state, pjId);
      const amount = Math.min(4, pj.power);
      if (amount <= 0) return addLog(state, 'Little John: el Príncipe Juan no tiene Monedas.');
      let s = updatePlayer(state, pjId, { power: pj.power - amount });
      s = updateCard(s, ctx.cardInstId, { storedPower: amount });
      return addLog(s, `Little John: coge ${amount} Moneda(s) al Príncipe Juan.`);
    },
  },

  // Robar a los Ricos — ON_PLAY: take up to 4 power from PJ, store on a target Hero.
  // Cuando ese Héroe sea derrotado, las Monedas vuelven al Príncipe Juan: ya cubierto por
  // onVanquish (resolvers), que devuelve `storedPower` de CUALQUIER Héroe, no solo Little John.
  {
    id: EffectId.JHON_ROBAR_RICOS,
    trigger: EffectTrigger.ON_PLAY,
    description: 'Coge hasta 4 Monedas al Príncipe Juan y ponlas sobre un Héroe.',
    execute: (state, ctx): GameState => {
      const card = state.allCards[ctx.cardInstId];
      if (!card) return state;
      const pjId = card.ownerId;

      // Usa el Héroe target indicado; si no hay, el primero disponible en el Reino.
      let heroId = ctx.targetCardInstId;
      if (!heroId || state.allCards[heroId]?.cardType !== CardType.HERO) {
        const player = getPlayer(state, pjId);
        for (const ls of Object.values(player.locationStates)) {
          heroId = ls.heroCardInstIds[0];
          if (heroId) break;
        }
      }
      // Sin Héroe al que ponerle las Monedas, la carta se descarta sin efecto: ya se jugó.
      if (!heroId) return addLog(state, 'Robar a los Ricos: no hay Héroes disponibles.');

      const pj = getPlayer(state, pjId);
      const amount = Math.min(4, pj.power);
      if (amount <= 0) return addLog(state, 'Robar a los Ricos: el Príncipe Juan no tiene Monedas.');
      let s = updatePlayer(state, pjId, { power: pj.power - amount });
      const hero = state.allCards[heroId];
      s = updateCard(s, heroId, { storedPower: (hero?.storedPower ?? 0) + amount });
      return addLog(s, `Robar a los Ricos: coge ${amount} Moneda(s) y las pone sobre ${hero?.name}.`);
    },
    requiresTargetCard: 'HERO',
  },

  // Arco con Flechas — ON_PLAY: attach to an ally (+1 strength)
  {
    id: EffectId.JHON_ARCO_ATTACH,
    trigger: EffectTrigger.ON_PLAY,
    description: 'Únelo a un Aliado. El Aliado recibe +1 Fuerza.',
    execute: (state, ctx): GameState => {
      const { cardInstId, targetCardInstId } = ctx;
      // Sin Aliado al que unirse, el Objeto se descarta: ya se jugó y pagó su coste.
      if (!targetCardInstId) return discardCardFromKingdom(state, cardInstId);
      const target = state.allCards[targetCardInstId];
      if (!target || target.cardType !== CardType.ALLY) return discardCardFromKingdom(state, cardInstId);
      let s = updateCard(state, cardInstId, { attachedToInstId: targetCardInstId, strengthModifier: 1 });
      s = updateCard(s, targetCardInstId, {
        attachedItemInstIds: [...target.attachedItemInstIds, cardInstId],
        strengthModifier: target.strengthModifier + 1,
      });
      return addLog(s, `Arco con Flechas unido a ${target.name} (+1 Fuerza).`);
    },
    requiresTargetCard: 'ALLY',
  },

  // Flecha Dorada — ON_PLAY: attach to an ally; on vanquish with it, +2 power (see vanquish())
  {
    id: EffectId.JHON_FLECHA_ATTACH,
    trigger: EffectTrigger.ON_PLAY,
    description: 'Únela a un Aliado. Cuando ese Aliado derrote a un Héroe, recibe 2 Monedas de Poder.',
    execute: (state, ctx): GameState => {
      const { cardInstId, targetCardInstId } = ctx;
      // Sin Aliado al que unirse, el Objeto se descarta: ya se jugó y pagó su coste.
      if (!targetCardInstId) return discardCardFromKingdom(state, cardInstId);
      const target = state.allCards[targetCardInstId];
      if (!target || target.cardType !== CardType.ALLY) return discardCardFromKingdom(state, cardInstId);
      let s = updateCard(state, cardInstId, { attachedToInstId: targetCardInstId });
      s = updateCard(s, targetCardInstId, {
        attachedItemInstIds: [...target.attachedItemInstIds, cardInstId],
      });
      return addLog(s, `Flecha Dorada unida a ${target.name}.`);
    },
    requiresTargetCard: 'ALLY',
  },

  // Encarcelamiento — ON_PLAY: move a hero to La Prisión
  {
    id: EffectId.JHON_ENCARCELAMIENTO,
    trigger: EffectTrigger.ON_PLAY,
    description: 'Mueve un Héroe a La Prisión.',
    execute: (state, ctx): GameState => {
      const player = getPlayer(state, ctx.actingPlayerId);

      // Use provided target hero; otherwise pick first hero not already in prison
      let heroId = ctx.targetCardInstId;
      if (!heroId || state.allCards[heroId]?.cardType !== CardType.HERO) {
        for (const [locId, ls] of Object.entries(player.locationStates)) {
          if (locId === JhonLocationId.PRISON) continue;
          heroId = ls.heroCardInstIds[0];
          if (heroId) break;
        }
      }
      if (!heroId) return addLog(state, 'Encarcelamiento: no hay Héroes disponibles.');

      const hero = state.allCards[heroId];
      if (!hero?.locationId || hero.locationId === JhonLocationId.PRISON) return state;

      const srcLoc = getPlayer(state, ctx.actingPlayerId).locationStates[hero.locationId];
      let s = updateLocationState(state, ctx.actingPlayerId, hero.locationId, {
        heroCardInstIds: srcLoc.heroCardInstIds.filter(id => id !== heroId),
      });
      const dest = getPlayer(s, ctx.actingPlayerId).locationStates[JhonLocationId.PRISON];
      s = updateLocationState(s, ctx.actingPlayerId, JhonLocationId.PRISON, {
        heroCardInstIds: [...dest.heroCardInstIds, heroId],
      });
      s = updateCard(s, heroId, { locationId: JhonLocationId.PRISON });
      // Los Objetos adjuntos viajan con su portador.
      s = moveAttachedItems(s, heroId, JhonLocationId.PRISON);
      return addLog(s, `Encarcelamiento: ${hero.name} movido/a a La Prisión.`);
    },
    requiresTargetCard: 'HERO',
  },
];

import { CardType, EffectTrigger } from '../../types';
import type { EffectDef, CardInstId } from '../../types';
import {
  getPlayer, updatePlayer, updateLocationState, updateCard,
  discardCardFromKingdom, moveAttachedItems, addLog, getEffectiveStrength,
  applyMenguarToggle, applyPowerGain,
} from '../../engine/stateHelpers';
import { getPlugin } from '../registry';
import { shuffle } from '../../utils/shuffle';

/** Prefijos de defId de los 4 Soldados Naipe — El Rey descuenta el Precio de cualquiera de ellos. */
const SOLDADO_PREFIXES = ['queen_v_treboles', 'queen_v_rombos', 'queen_v_corazones', 'queen_v_picas'];
const SOLDADO_TOGGLE_ID = 'queen_soldado_toggle';

/** Marca establecida cuando "Efectúa el tiro" tiene éxito — leída por checkWinCondition. */
export const QUEEN_SHOT_SUCCESSFUL_STEP = 'SHOT_SUCCESSFUL';

export const effects: EffectDef[] = [
  // ── Soldados Naipe ↔ Postigo ────────────────────────────────────────────────
  {
    id: SOLDADO_TOGGLE_ID,
    trigger: EffectTrigger.ACTIVATED,
    description: 'Convierte este Soldado Naipe en un Postigo, o de Postigo en Soldado Naipe.',
    execute: (state, ctx) => {
      const card = state.allCards[ctx.cardInstId];
      if (!card) return state;
      const s = updateCard(state, ctx.cardInstId, { isWicket: !card.isWicket });
      return addLog(s, card.isWicket ? `${card.name} vuelve a ser Soldado Naipe.` : `${card.name} se convierte en Postigo.`);
    },
  },
  {
    id: 'queen_el_rey_discount',
    trigger: EffectTrigger.CONTINUOUS,
    description: 'El Precio de los Soldados Naipe se reduce en -1 Moneda de Poder.',
    execute: (s) => s,
    computePlayCostModifier: (_state, _playerId, cardToPlay) =>
      SOLDADO_PREFIXES.some(prefix => cardToPlay.defId.startsWith(prefix)) ? -1 : 0,
  },
  {
    id: 'queen_tweedle_survives',
    trigger: EffectTrigger.CONTINUOUS,
    description: 'No se descarta cuando es utilizado para derrotar a un Héroe.',
    execute: (s) => s,
    survivesVanquish: true,
  },

  // ── ¡Que le corten la cabeza! ────────────────────────────────────────────────
  {
    id: 'queen_cabeza',
    trigger: EffectTrigger.ON_PLAY,
    requiresTargetCard: 'HERO',
    description: 'Derrota a un Héroe de Fuerza 4 o inferior.',
    execute: (state, ctx) => {
      const player = getPlayer(state, ctx.actingPlayerId);
      let heroId = ctx.targetCardInstId;
      if (!heroId) {
        for (const locState of Object.values(player.locationStates)) {
          const h = locState.heroCardInstIds.find(id => getEffectiveStrength(state, id) <= 4);
          if (h) { heroId = h; break; }
        }
      }
      if (!heroId) return addLog(state, '¡Que le corten la cabeza!: no hay Héroe de Fuerza ≤4.');
      const hero = state.allCards[heroId];
      if (!hero || getEffectiveStrength(state, heroId) > 4) return state;
      return addLog(discardCardFromKingdom(state, heroId), `¡Que le corten la cabeza!: ${hero.name} derrotado.`);
    },
  },

  // ── Efectúa el tiro ──────────────────────────────────────────────────────────
  {
    id: 'queen_efectua_el_tiro',
    trigger: EffectTrigger.ON_PLAY,
    requiresAllLocationsHaveWicket: true,
    description: 'Revela 5 cartas del mazo de Villano; si su Precio total es menor que la Fuerza total de tus Postigos, ganas la partida.',
    execute: (state, ctx) => {
      const playerId = ctx.actingPlayerId;
      let deck = [...getPlayer(state, playerId).villainDeckInstIds];
      let discard = [...getPlayer(state, playerId).villainDiscardInstIds];
      const revealed: CardInstId[] = [];
      for (let i = 0; i < 5; i++) {
        if (deck.length === 0) {
          if (discard.length === 0) break;
          deck = shuffle(discard);
          discard = [];
        }
        revealed.push(deck.shift()!);
      }
      let s = updatePlayer(state, playerId, { villainDeckInstIds: deck, villainDiscardInstIds: discard });

      const totalCost = revealed.reduce(
        (sum, id) => sum + (s.allCards[id]?.baseCost ?? 0) + (s.allCards[id]?.costModifier ?? 0), 0,
      );
      const wicketStrength = Object.values(getPlayer(s, playerId).locationStates)
        .flatMap(ls => ls.villainCardInstIds)
        .filter(id => s.allCards[id]?.isWicket)
        .reduce((sum, id) => sum + getEffectiveStrength(s, id), 0);

      const won = revealed.length > 0 && totalCost < wicketStrength;
      if (won) {
        s = updatePlayer(s, playerId, {
          completedObjectiveSteps: [...getPlayer(s, playerId).completedObjectiveSteps, QUEEN_SHOT_SUCCESSFUL_STEP],
        });
        s = addLog(s, `¡Efectúa el tiro! Precio total ${totalCost} < Fuerza de Postigos ${wicketStrength}. ¡Victoria!`);
      } else {
        s = updatePlayer(s, playerId, {
          villainDiscardInstIds: [...getPlayer(s, playerId).villainDiscardInstIds, ...revealed],
        });
        s = addLog(s, `Efectúa el tiro: Precio total ${totalCost} ≥ Fuerza de Postigos ${wicketStrength}. Cartas descartadas.`);
      }
      // El resultado ya se aplicó arriba — esto solo deja las cartas visibles para que el
      // jugador pueda revisarlas antes de continuar.
      return { ...s, pendingShotReveal: { actingPlayerId: playerId, revealedInstIds: revealed, totalCost, wicketStrength, won } };
    },
  },

  // ── Por orden de la Reina ────────────────────────────────────────────────────
  {
    id: 'queen_por_orden',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Convierte hasta dos Soldados Naipe en Postigos.',
    execute: (state, ctx) => {
      const player = getPlayer(state, ctx.actingPlayerId);
      const eligible = Object.values(player.locationStates)
        .flatMap(ls => ls.villainCardInstIds)
        .filter(id => state.allCards[id]?.effectIds.includes(SOLDADO_TOGGLE_ID) && !state.allCards[id]?.isWicket);
      if (eligible.length === 0) return addLog(state, 'Por orden de la Reina: no hay Soldados Naipe que convertir.');
      return {
        ...state,
        pendingWicketPick: {
          actingPlayerId: ctx.actingPlayerId, kind: 'TO_WICKET',
          sourceCardInstId: ctx.cardInstId, eligibleInstIds: eligible, max: 2,
        },
      };
    },
  },

  // ── Menguar ──────────────────────────────────────────────────────────────────
  {
    id: 'queen_menguar',
    trigger: EffectTrigger.ON_PLAY,
    requiresTargetCard: 'HERO',
    description: 'Mengua a un Héroe o devuelve a su tamaño normal a un Héroe agrandado.',
    execute: (state, ctx) => {
      if (!ctx.targetCardInstId) return addLog(state, 'Menguar: no hay Héroe al que aplicarlo.');
      const hero = state.allCards[ctx.targetCardInstId];
      if (!hero) return state;
      return addLog(applyMenguarToggle(state, ctx.actingPlayerId, ctx.targetCardInstId), `Menguar aplicado a ${hero.name}.`);
    },
  },

  // ── Feliz No Cumpleaños ──────────────────────────────────────────────────────
  {
    id: 'queen_no_cumple',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Recibe 1 Moneda de Poder por cada Aliado que haya en tu Reino.',
    execute: (state, ctx) => {
      const player = getPlayer(state, ctx.actingPlayerId);
      const allyCount = Object.values(player.locationStates)
        .flatMap(ls => ls.villainCardInstIds)
        .filter(id => state.allCards[id]?.cardType === CardType.ALLY).length;
      if (allyCount === 0) return addLog(state, 'Feliz No Cumpleaños: no hay Aliados en el Reino.');
      const s = applyPowerGain(state, ctx.actingPlayerId, allyCount);
      return addLog(s, `Feliz No Cumpleaños: ${getPlayer(s, ctx.actingPlayerId).name} gana ${allyCount} de Poder.`);
    },
  },

  // ── Condiciones ──────────────────────────────────────────────────────────────
  {
    id: 'queen_furia_cond',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Reacción: mengua hasta dos Héroes rivales.',
    execute: (s) => s,
    conditionTrigger: 'VANQUISH_4PLUS',
  },
  {
    id: 'queen_juicio_cond',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Reacción: recibe 3 Monedas de Poder.',
    execute: (s) => s,
    conditionTrigger: 'ALLY_3PLUS',
  },

  // ── Lanza ────────────────────────────────────────────────────────────────────
  {
    id: 'queen_lanza_attach',
    trigger: EffectTrigger.ON_PLAY,
    requiresTargetCard: 'ALLY',
    description: 'Únela a un Aliado; ese Aliado recibe +1 Fuerza.',
    execute: (state, ctx) => {
      // Sin Aliado al que unirse, el Objeto se descarta: ya se jugó y pagó su coste.
      if (!ctx.targetCardInstId) return discardCardFromKingdom(state, ctx.cardInstId);
      const target = state.allCards[ctx.targetCardInstId];
      if (!target || target.cardType !== CardType.ALLY) return discardCardFromKingdom(state, ctx.cardInstId);
      let s = updateCard(state, ctx.cardInstId, { attachedToInstId: ctx.targetCardInstId, strengthModifier: 1 });
      s = updateCard(s, ctx.targetCardInstId, {
        attachedItemInstIds: [...target.attachedItemInstIds, ctx.cardInstId],
        strengthModifier: target.strengthModifier + 1,
      });
      return addLog(s, `Lanza: +1 Fuerza a ${target.name}.`);
    },
  },

  // ── Reloj ────────────────────────────────────────────────────────────────────
  {
    id: 'queen_reloj_activate',
    trigger: EffectTrigger.ACTIVATED,
    description: 'Gana 1 Moneda de Poder por cada Postigo que tengas en tu Reino.',
    execute: (state, ctx) => {
      const player = getPlayer(state, ctx.actingPlayerId);
      const wicketCount = Object.values(player.locationStates)
        .flatMap(ls => ls.villainCardInstIds)
        .filter(id => state.allCards[id]?.isWicket).length;
      if (wicketCount === 0) return addLog(state, 'Reloj: no hay Postigos en el Reino.');
      const s = applyPowerGain(state, ctx.actingPlayerId, wicketCount);
      return addLog(s, `Reloj: ${getPlayer(s, ctx.actingPlayerId).name} gana ${wicketCount} de Poder.`);
    },
  },

  // ── Cartas de Destino ────────────────────────────────────────────────────────
  {
    id: 'queen_agrandar',
    trigger: EffectTrigger.ON_PLAY,
    requiresTargetCard: 'HERO',
    description: 'Agranda a un Héroe o devuelve a su estado normal a un Héroe menguado.',
    execute: (state, ctx) => {
      if (!ctx.targetCardInstId) return addLog(state, 'Agrandar: no hay Héroe al que aplicarlo.');
      const hero = state.allCards[ctx.targetCardInstId];
      if (!hero) return state;

      // Si ya estaba Menguado, Agrandar simplemente lo revierte a la normalidad (no depende de
      // su ubicación).
      if (hero.isShrunk) {
        return addLog(updateCard(state, ctx.targetCardInstId, { isShrunk: false }), `Agrandar revierte a ${hero.name}.`);
      }
      if (!hero.locationId) return state;

      // Si no, agranda: hay que elegir a qué ubicación adyacente y casilla también tapará.
      const plugin = getPlugin(hero.villainId);
      const locDef = plugin.locations.find(l => l.id === hero.locationId);
      const eligible = (locDef?.adjacentIds ?? []).flatMap(adjLocId => {
        const adjDef = plugin.locations.find(l => l.id === adjLocId);
        return (adjDef?.actions ?? []).map((_, slotIndex) => ({ locationId: adjLocId, slotIndex }));
      });
      if (eligible.length === 0) return addLog(state, `Agrandar: ${hero.name} no tiene ubicaciones adyacentes.`);
      return {
        ...addLog(state, `Agrandar: elige a qué ubicación adyacente y casilla tapará ${hero.name}.`),
        pendingEnlargeTarget: { actingPlayerId: ctx.actingPlayerId, heroInstId: ctx.targetCardInstId, eligible },
      };
    },
  },
  {
    id: 'queen_llego_tarde',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Escoge y juega un Héroe de Fuerza 3 o inferior de la pila de descartes de Destino.',
    execute: (state, ctx) => {
      const card = state.allCards[ctx.cardInstId];
      if (!card) return state;
      const owner = getPlayer(state, card.ownerId);
      const heroId = owner.fateDiscardInstIds.find(
        id => state.allCards[id]?.cardType === CardType.HERO && getEffectiveStrength(state, id) <= 3,
      );
      if (!heroId) return addLog(state, '¡Llego tarde! ¡Llego tarde!: no hay Héroe de Fuerza ≤3 en el descarte.');
      const s = updatePlayer(state, card.ownerId, {
        fateDiscardInstIds: owner.fateDiscardInstIds.filter(id => id !== heroId),
      });
      return {
        ...addLog(s, `${state.allCards[heroId]?.name} encontrado. Elige una ubicación.`),
        pendingAuroraHero: { heroInstId: heroId, targetPlayerId: card.ownerId, actingPlayerId: ctx.actingPlayerId, isHero: true },
      };
    },
  },
  {
    id: 'queen_mome_raths',
    trigger: EffectTrigger.ON_PLAY,
    requiresTargetCard: 'ALLY',
    description: 'Mueve un Aliado a cualquier ubicación.',
    execute: (state, ctx) => {
      // La ubicación donde se "suelta" esta carta de Destino (ctx.targetLocationId) se reutiliza
      // como destino del Aliado — no hay restricción de adyacencia en el texto de la carta.
      if (!ctx.targetCardInstId || !ctx.targetLocationId) return state;
      const ally = state.allCards[ctx.targetCardInstId];
      if (!ally?.locationId || ally.locationId === ctx.targetLocationId) return state;
      const owner = getPlayer(state, ally.ownerId);
      if (owner.locationStates[ctx.targetLocationId]?.isLocked) return state;
      const src = owner.locationStates[ally.locationId];
      let s = updateLocationState(state, ally.ownerId, ally.locationId, {
        villainCardInstIds: src.villainCardInstIds.filter(id => id !== ctx.targetCardInstId),
      });
      const dest = getPlayer(s, ally.ownerId).locationStates[ctx.targetLocationId];
      s = updateLocationState(s, ally.ownerId, ctx.targetLocationId, {
        villainCardInstIds: [...dest.villainCardInstIds, ctx.targetCardInstId!],
      });
      s = updateCard(s, ctx.targetCardInstId, { locationId: ctx.targetLocationId });
      s = moveAttachedItems(s, ctx.targetCardInstId, ctx.targetLocationId);
      return addLog(s, `Mome Raths: ${ally.name} movido a ${ctx.targetLocationId}.`);
    },
  },
  {
    id: 'queen_alicia_block',
    trigger: EffectTrigger.CONTINUOUS,
    description: 'Mientras esté en el Reino, no se pueden mover Aliados ni Objetos.',
    execute: (s) => s,
    blocksMoveItemAlly: true,
  },
  {
    id: 'queen_conejo_activation_cost',
    trigger: EffectTrigger.CONTINUOUS,
    description: 'El Precio de Activación de los Soldados Naipe/Postigos aumenta en +1 Moneda de Poder.',
    execute: (s) => s,
    computeActivationCostModifier: (_state, _playerId, cardToActivate) =>
      cardToActivate.effectIds.includes(SOLDADO_TOGGLE_ID) ? 1 : 0,
  },
  {
    id: 'queen_dodo_block_wicket',
    trigger: EffectTrigger.CONTINUOUS,
    description: 'Los Soldados Naipe en su misma ubicación no pueden convertirse en Postigo.',
    execute: (s) => s,
    blocksActivationAtLocation: (cardToActivate) => cardToActivate.effectIds.includes(SOLDADO_TOGGLE_ID),
  },
  {
    id: 'queen_liron_immune',
    trigger: EffectTrigger.CONTINUOUS,
    description: 'No puede ser Menguado.',
    execute: (s) => s,
    immuneToShrink: true,
  },
  {
    id: 'queen_liebre_bonus',
    trigger: EffectTrigger.CONTINUOUS,
    description: '+2 Fuerza si el Sombrerero Loco está en el Reino de la Reina de Corazones.',
    execute: (s) => s,
    computeStrengthBonus: (state, instId) => {
      const card = state.allCards[instId];
      if (!card) return 0;
      const player = getPlayer(state, card.ownerId);
      const present = Object.values(player.locationStates).some(ls =>
        ls.heroCardInstIds.some(id => state.allCards[id]?.defId === 'queen_f_sombrerero'),
      );
      return present ? 2 : 0;
    },
  },
  {
    id: 'queen_sombrerero_bonus',
    trigger: EffectTrigger.CONTINUOUS,
    description: '+2 Fuerza si la Liebre de Marzo está en el Reino de la Reina de Corazones.',
    execute: (s) => s,
    computeStrengthBonus: (state, instId) => {
      const card = state.allCards[instId];
      if (!card) return 0;
      const player = getPlayer(state, card.ownerId);
      const present = Object.values(player.locationStates).some(ls =>
        ls.heroCardInstIds.some(id => state.allCards[id]?.defId === 'queen_f_liebre'),
      );
      return present ? 2 : 0;
    },
  },
  {
    id: 'queen_oruga_debuff',
    trigger: EffectTrigger.CONTINUOUS,
    description: 'Todos los Aliados en su ubicación reciben -1 Fuerza.',
    execute: (s) => s,
    computeStrengthBonus: (state, instId) => {
      const ally = state.allCards[instId];
      if (!ally || ally.cardType !== CardType.ALLY || !ally.locationId) return 0;
      const player = getPlayer(state, ally.ownerId);
      const hasOruga = player.locationStates[ally.locationId]?.heroCardInstIds.some(
        id => state.allCards[id]?.defId === 'queen_f_oruga',
      );
      return hasOruga ? -1 : 0;
    },
  },
  {
    id: 'queen_madriguera',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Si Alicia está en el Reino, descarta un Aliado de su ubicación. Si no, encuentra a Alicia y juégala.',
    execute: (state, ctx) => {
      const card = state.allCards[ctx.cardInstId];
      if (!card) return state;
      const owner = getPlayer(state, card.ownerId);
      const aliciaId = Object.values(owner.locationStates)
        .flatMap(ls => ls.heroCardInstIds)
        .find(id => state.allCards[id]?.defId === 'queen_f_alicia');

      if (aliciaId) {
        const alicia = state.allCards[aliciaId];
        const locState = owner.locationStates[alicia!.locationId!];
        const allyId = locState?.villainCardInstIds.find(id => state.allCards[id]?.cardType === CardType.ALLY);
        if (!allyId) return addLog(state, 'Madriguera del Conejo: no hay Aliado en la ubicación de Alicia.');
        return addLog(discardCardFromKingdom(state, allyId), `Madriguera del Conejo: ${state.allCards[allyId]?.name} descartado.`);
      }

      // Alicia no está en el Reino: buscarla (descarte de Destino o mazo) y jugarla donde se
      // soltó esta carta.
      if (!ctx.targetLocationId) return state;
      let aliciaFoundId = owner.fateDiscardInstIds.find(id => state.allCards[id]?.defId === 'queen_f_alicia');
      let s = state;
      if (aliciaFoundId) {
        s = updatePlayer(s, card.ownerId, {
          fateDiscardInstIds: owner.fateDiscardInstIds.filter(id => id !== aliciaFoundId),
        });
      } else {
        aliciaFoundId = owner.fateDeckInstIds.find(id => state.allCards[id]?.defId === 'queen_f_alicia');
        if (aliciaFoundId) {
          s = updatePlayer(s, card.ownerId, {
            fateDeckInstIds: shuffle(owner.fateDeckInstIds.filter(id => id !== aliciaFoundId)),
          });
        }
      }
      if (!aliciaFoundId) return addLog(state, 'Madriguera del Conejo: Alicia no está disponible.');
      const destLocState = getPlayer(s, card.ownerId).locationStates[ctx.targetLocationId];
      s = updateLocationState(s, card.ownerId, ctx.targetLocationId, {
        heroCardInstIds: [...destLocState.heroCardInstIds, aliciaFoundId],
      });
      s = updateCard(s, aliciaFoundId, { locationId: ctx.targetLocationId });
      return addLog(s, `Madriguera del Conejo: Alicia encontrada y jugada en ${ctx.targetLocationId}.`);
    },
  },
  {
    id: 'queen_rison_on_play',
    trigger: EffectTrigger.ON_PLAY,
    description: 'Al jugarlo, puedes convertir hasta dos Postigos en Soldados Naipe.',
    execute: (state, ctx) => {
      const card = state.allCards[ctx.cardInstId];
      if (!card) return state;
      const owner = getPlayer(state, card.ownerId);
      const eligible = Object.values(owner.locationStates)
        .flatMap(ls => ls.villainCardInstIds)
        .filter(id => state.allCards[id]?.isWicket);
      if (eligible.length === 0) return addLog(state, 'Gato Risón: no hay Postigos que convertir.');
      return {
        ...state,
        pendingWicketPick: {
          actingPlayerId: ctx.actingPlayerId, kind: 'TO_SOLDADO',
          sourceCardInstId: ctx.cardInstId, eligibleInstIds: eligible, max: 2,
        },
      };
    },
  },
  {
    id: 'queen_rison_on_discard',
    trigger: EffectTrigger.CONTINUOUS,
    description: 'Cuando sea derrotado, la Reina de Corazones puede convertir hasta dos Soldados Naipe en Postigos (ver onHeroDiscarded).',
    execute: (s) => s,
  },
];

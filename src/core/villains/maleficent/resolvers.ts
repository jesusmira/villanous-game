import { CardType, ActionType } from '../../types';
import type {
  GameState, CardInstId, LocationId, PlayerId,
  ConditionCtx, ConditionHandler,
} from '../../types';
import {
  getPlayer, updatePlayer, updateLocationState, updateCard,
  discardCardFromKingdom, moveAttachedItems, addLog, getEffectiveStrength, computeKingdomCostMod, checkWin,
} from '../../engine/stateHelpers';
import { runEffects } from '../../engine/EffectEngine';
import { getPlugin } from '../registry';
import { EffectId } from '../effectIds';
import { shuffle } from '../../utils/shuffle';

// ─── CONDITION HANDLERS ───────────────────────────────────────────────────────

function handleMalicia(s: GameState, _reactingPlayerId: PlayerId, ctx: ConditionCtx): GameState {
  if (ctx.targetCardInstId) {
    const heroStr = getEffectiveStrength(s, ctx.targetCardInstId);
    const heroName = s.allCards[ctx.targetCardInstId]?.name ?? '?';
    if (heroStr <= 4) {
      s = discardCardFromKingdom(s, ctx.targetCardInstId);
      s = addLog(s, `Malicia: ${heroName} (Fuerza ${heroStr}) derrotado.`);
    }
  }
  return s;
}

function handleTirania(s: GameState, reactingPlayerId: PlayerId, ctx: ConditionCtx): GameState {
  let deck = [...getPlayer(s, reactingPlayerId).villainDeckInstIds];
  if (deck.length < 3) {
    const reshuffled = shuffle([...getPlayer(s, reactingPlayerId).villainDiscardInstIds]);
    deck = [...deck, ...reshuffled];
    s = updatePlayer(s, reactingPlayerId, { villainDiscardInstIds: [] });
  }
  const drawn = deck.splice(0, Math.min(3, deck.length));
  s = updatePlayer(s, reactingPlayerId, {
    handInstIds: [...getPlayer(s, reactingPlayerId).handInstIds, ...drawn],
    villainDeckInstIds: deck,
  });
  s = addLog(s, `Tiranía: ${getPlayer(s, reactingPlayerId).name} roba ${drawn.length} carta(s).`);
  if (ctx.discardInstIds && ctx.discardInstIds.length > 0) {
    const toDiscard = ctx.discardInstIds.slice(0, 3);
    s = updatePlayer(s, reactingPlayerId, {
      handInstIds: getPlayer(s, reactingPlayerId).handInstIds.filter(id => !toDiscard.includes(id)),
      villainDiscardInstIds: [...getPlayer(s, reactingPlayerId).villainDiscardInstIds, ...toDiscard],
    });
    s = addLog(s, `Tiranía: ${getPlayer(s, reactingPlayerId).name} descarta ${toDiscard.length} carta(s).`);
  }
  return s;
}

function handleObsesion(s: GameState, reactingPlayerId: PlayerId, ctx: ConditionCtx): GameState {
  let fateDeck = [...getPlayer(s, reactingPlayerId).fateDeckInstIds];
  let fateDiscard = [...getPlayer(s, reactingPlayerId).fateDiscardInstIds];
  if (fateDeck.length === 0 && fateDiscard.length > 0) {
    fateDeck = shuffle(fateDiscard);
    fateDiscard = [];
  }
  let foundHeroId: CardInstId | null = null;
  const toFateDiscard: CardInstId[] = [];
  for (const id of [...fateDeck]) {
    fateDeck = fateDeck.filter(x => x !== id);
    if (s.allCards[id]?.cardType === CardType.HERO) {
      foundHeroId = id;
      break;
    } else {
      toFateDiscard.push(id);
    }
  }
  fateDiscard = [...fateDiscard, ...toFateDiscard];
  s = updatePlayer(s, reactingPlayerId, { fateDeckInstIds: fateDeck, fateDiscardInstIds: fateDiscard });

  if (foundHeroId) {
    const opponentId = s.players.find(p => p.id !== reactingPlayerId)!.id;
    if (ctx.playHero && ctx.targetLocationId) {
      const locState = getPlayer(s, opponentId).locationStates[ctx.targetLocationId];
      s = updateLocationState(s, opponentId, ctx.targetLocationId, {
        heroCardInstIds: [...locState.heroCardInstIds, foundHeroId],
      });
      s = updateCard(s, foundHeroId, { locationId: ctx.targetLocationId });
      s = runEffects(s, foundHeroId, 'ON_PLAY', {
        actingPlayerId: reactingPlayerId,
        cardInstId: foundHeroId,
        targetLocationId: ctx.targetLocationId,
      });
      s = addLog(s, `Obsesión: ${s.allCards[foundHeroId]?.name} jugado en el Reino de ${getPlayer(s, opponentId).name}.`);
      const obsLocAfter = getPlayer(s, opponentId).locationStates[ctx.targetLocationId];
      for (const cId of [...obsLocAfter.villainCardInstIds]) {
        s = runEffects(s, cId, 'ON_HERO_PLAYED_HERE', {
          actingPlayerId: reactingPlayerId,
          cardInstId: cId,
          targetCardInstId: foundHeroId,
          targetLocationId: ctx.targetLocationId,
        });
      }
    } else {
      s = updatePlayer(s, reactingPlayerId, {
        fateDiscardInstIds: [...getPlayer(s, reactingPlayerId).fateDiscardInstIds, foundHeroId],
      });
      s = addLog(s, `Obsesión: ${s.allCards[foundHeroId]?.name} descartado.`);
    }
  } else {
    s = addLog(s, 'Obsesión: No se encontró ningún Héroe en el mazo de Destino.');
  }
  return s;
}

function handlePerspicaz(s: GameState, reactingPlayerId: PlayerId, ctx: ConditionCtx): GameState {
  if (ctx.allyInstId && ctx.targetLocationId) {
    const ally = s.allCards[ctx.allyInstId];
    if (ally && ally.cardType === CardType.ALLY) {
      s = updatePlayer(s, reactingPlayerId, {
        handInstIds: getPlayer(s, reactingPlayerId).handInstIds.filter(id => id !== ctx.allyInstId),
      });
      const locState = getPlayer(s, reactingPlayerId).locationStates[ctx.targetLocationId];
      s = updateLocationState(s, reactingPlayerId, ctx.targetLocationId, {
        villainCardInstIds: [...locState.villainCardInstIds, ctx.allyInstId],
      });
      s = updateCard(s, ctx.allyInstId, { locationId: ctx.targetLocationId });
      s = runEffects(s, ctx.allyInstId, 'ON_PLAY', {
        actingPlayerId: reactingPlayerId,
        cardInstId: ctx.allyInstId,
        targetLocationId: ctx.targetLocationId,
      });
      s = addLog(s, `Perspicaz: ${ally.name} jugado gratis en ${ctx.targetLocationId}.`);
      const locAfter = getPlayer(s, reactingPlayerId).locationStates[ctx.targetLocationId];
      for (const cId of [...locAfter.villainCardInstIds]) {
        if (cId === ctx.allyInstId) continue;
        s = runEffects(s, cId, 'ON_ALLY_PLACED', {
          actingPlayerId: reactingPlayerId, cardInstId: cId,
          targetCardInstId: ctx.allyInstId, targetLocationId: ctx.targetLocationId,
        });
      }
    }
  }
  return s;
}

export const conditionHandlers: Record<string, ConditionHandler> = {
  [EffectId.MALICIA_COND]:   handleMalicia,
  [EffectId.TIRANIA_COND]:   handleTirania,
  [EffectId.OBSESION_COND]:  handleObsesion,
  [EffectId.PERSPICAZ_COND]: handlePerspicaz,
};

// ─── RESOLVE CUERVO ──────────────────────────────────────────────────────────

/** Acción que el Cuervo lleva a cabo en su ubicación de destino, y los datos que necesita. */
export interface CuervoResolutionParams {
  targetLocationId?: LocationId;
  cardInstId?: CardInstId;
  targetCardInstId?: CardInstId;
  allyInstIds?: CardInstId[];
  cardInstIds?: CardInstId[];
  amountOverride?: number;
}

export function resolveCuervo(
  state: GameState,
  action: ActionType,
  params: CuervoResolutionParams = {},
): GameState {
  if (!state.pendingCuervo) return state;
  const { playerId, locationId } = state.pendingCuervo;
  let s: GameState = { ...state, pendingCuervo: undefined };

  const plugin = getPlugin(getPlayer(s, playerId).villainId);
  const locDef = plugin.locations.find(l => l.id === locationId);

  switch (action) {
    case ActionType.GAIN_POWER: {
      const gainSlot = locDef?.actions.find(a => a.type === ActionType.GAIN_POWER);
      const amount = params.amountOverride ?? gainSlot?.value ?? 2;
      s = updatePlayer(s, playerId, { power: getPlayer(s, playerId).power + amount });
      s = addLog(s, `El Cuervo: ${getPlayer(s, playerId).name} gana ${amount} de Poder.`);
      break;
    }
    case ActionType.PLAY_CARD: {
      if (!params.cardInstId || !params.targetLocationId) break;
      const card = s.allCards[params.cardInstId];
      if (!card) break;
      const cost = Math.max(0, card.baseCost + card.costModifier + computeKingdomCostMod(s, playerId, card, params.targetLocationId));
      if (getPlayer(s, playerId).power < cost) break;
      s = updatePlayer(s, playerId, {
        power: getPlayer(s, playerId).power - cost,
        handInstIds: getPlayer(s, playerId).handInstIds.filter(id => id !== params.cardInstId),
      });
      const locState = getPlayer(s, playerId).locationStates[params.targetLocationId];
      if (card.cardType === CardType.HERO) {
        s = updateLocationState(s, playerId, params.targetLocationId, {
          heroCardInstIds: [...locState.heroCardInstIds, params.cardInstId],
        });
      } else {
        s = updateLocationState(s, playerId, params.targetLocationId, {
          villainCardInstIds: [...locState.villainCardInstIds, params.cardInstId],
        });
      }
      s = updateCard(s, params.cardInstId, { locationId: params.targetLocationId });
      s = addLog(s, `El Cuervo: ${card.name} jugado en ${params.targetLocationId}.`);
      s = runEffects(s, params.cardInstId, 'ON_PLAY', {
        actingPlayerId: playerId,
        cardInstId: params.cardInstId,
        targetLocationId: params.targetLocationId,
        targetCardInstId: params.targetCardInstId,
      });
      if (card.cardType === CardType.EFFECT || card.cardType === CardType.CONDITION) {
        s = discardCardFromKingdom(s, params.cardInstId);
      }
      break;
    }
    case ActionType.VANQUISH: {
      if (!params.cardInstId || !params.allyInstIds || params.allyInstIds.length === 0) break;
      const hero = s.allCards[params.cardInstId];
      if (!hero) break;
      const heroStr = getEffectiveStrength(s, params.cardInstId);
      const totalAllyStr = params.allyInstIds.reduce((sum, id) => sum + getEffectiveStrength(s, id), 0);
      if (totalAllyStr < heroStr) {
        s = addLog(s, 'El Cuervo: Fuerza insuficiente para vencer al Héroe.');
        break;
      }
      // Descartar (no mover) cada Aliado usado: discardCardFromKingdom ya cascada sus Objetos
      // adjuntos y limpia el pile correcto — antes esto se reimplementaba a mano sin esa cascada.
      for (const allyId of params.allyInstIds) {
        s = discardCardFromKingdom(s, allyId);
      }
      s = discardCardFromKingdom(s, params.cardInstId);
      s = addLog(s, `El Cuervo: ${hero.name} derrotado.`);
      break;
    }
    case ActionType.MOVE_ITEM_ALLY: {
      if (!params.cardInstId || !params.targetLocationId) break;
      const card = s.allCards[params.cardInstId];
      if (!card?.locationId) break;
      const src = getPlayer(s, playerId).locationStates[card.locationId];
      s = updateLocationState(s, playerId, card.locationId, {
        villainCardInstIds: src.villainCardInstIds.filter(id => id !== params.cardInstId),
      });
      const dest = getPlayer(s, playerId).locationStates[params.targetLocationId];
      s = updateLocationState(s, playerId, params.targetLocationId, {
        villainCardInstIds: [...dest.villainCardInstIds, params.cardInstId],
      });
      s = updateCard(s, params.cardInstId, { locationId: params.targetLocationId });
      // Los Objetos adjuntos viajan con su portador.
      s = moveAttachedItems(s, params.cardInstId, params.targetLocationId);
      s = addLog(s, `El Cuervo: ${card.name} movido a ${params.targetLocationId}.`);
      break;
    }
    case ActionType.MOVE_HERO: {
      if (!params.cardInstId || !params.targetLocationId) break;
      const hero = s.allCards[params.cardInstId];
      if (!hero?.locationId) break;
      const src = getPlayer(s, playerId).locationStates[hero.locationId];
      s = updateLocationState(s, playerId, hero.locationId, {
        heroCardInstIds: src.heroCardInstIds.filter(id => id !== params.cardInstId),
      });
      const dest = getPlayer(s, playerId).locationStates[params.targetLocationId];
      s = updateLocationState(s, playerId, params.targetLocationId, {
        heroCardInstIds: [...dest.heroCardInstIds, params.cardInstId],
      });
      s = updateCard(s, params.cardInstId, { locationId: params.targetLocationId });
      // Los Objetos adjuntos viajan con su portador.
      s = moveAttachedItems(s, params.cardInstId, params.targetLocationId);
      s = addLog(s, `El Cuervo: ${hero.name} movido a ${params.targetLocationId}.`);
      break;
    }
    case ActionType.DISCARD: {
      if (!params.cardInstIds || params.cardInstIds.length === 0) break;
      const toDiscard = params.cardInstIds.filter(id => getPlayer(s, playerId).handInstIds.includes(id));
      s = updatePlayer(s, playerId, {
        handInstIds: getPlayer(s, playerId).handInstIds.filter(id => !toDiscard.includes(id)),
        villainDiscardInstIds: [...getPlayer(s, playerId).villainDiscardInstIds, ...toDiscard],
      });
      s = addLog(s, `El Cuervo: ${toDiscard.length} carta(s) descartada(s).`);
      break;
    }
    default:
      break;
  }

  return checkWin(s);
}

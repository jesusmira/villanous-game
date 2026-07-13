import { CardType } from '../../types';
import type { GameState, PlayerId, CardInstId, LocationId, PlayCardCtx, ActivateCardCtx } from '../../types';
import { getPlugin } from '../../villains/registry';
import { EffectId } from '../../villains/effectIds';
import { runEffects } from '../EffectEngine';
import {
  getPlayer, updatePlayer, updateLocationState, updateCard,
  discardCardFromKingdom, moveAttachedItems, addLog, checkWin, getEffectiveStrength, computeKingdomCostMod,
  applyPowerGain, heroBlockedFromLocation,
} from '../stateHelpers';
import { getActionAtSlot } from '../slotHelpers';
import { checkConditions, firePawnArrivalIfMoved } from './_helpers';

function checkAllyConditions(state: GameState, playerId: PlayerId): GameState {
  let s = state;
  const allies = Object.values(getPlayer(s, playerId).locationStates)
    .flatMap(ls => ls.villainCardInstIds)
    .filter(id => s.allCards[id]?.cardType === CardType.ALLY);
  if (allies.length >= 3) s = checkConditions(s, 'ALLY_3PLUS', playerId);
  if (!s.pendingCondition && allies.some(id => getEffectiveStrength(s, id) >= 4)) {
    s = checkConditions(s, 'ALLY_4PLUS_STR', playerId);
  }
  return s;
}

export function gainPower(
  state: GameState,
  playerId: PlayerId,
  slotIndex: number,
  amountOverride?: number,
): GameState {
  const player = getPlayer(state, playerId);
  const rawAmount = amountOverride !== undefined
    ? amountOverride
    : (getActionAtSlot(state, playerId, slotIndex)?.value ?? 2);
  let s = applyPowerGain(state, playerId, rawAmount);
  const gained = getPlayer(s, playerId).power - player.power;
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };
  return addLog(s, `${player.name} gana ${gained} de Poder.`);
}

export function playCard(
  state: GameState,
  playerId: PlayerId,
  cardInstId: CardInstId,
  slotIndex: number,
  targetLocationId: LocationId,
  ctx: PlayCardCtx = {},
): GameState {
  const player = getPlayer(state, playerId);
  const card = state.allCards[cardInstId];

  // Mapa de Nunca Jamás: discard it instead of paying for an Item
  const usingMapa = !!(ctx.mapaInstId && card.cardType === CardType.ITEM);
  const kingdomCostMod = usingMapa ? 0 : computeKingdomCostMod(state, playerId, card, targetLocationId);
  const effectiveCost = usingMapa ? 0 : Math.max(0, card.baseCost + card.costModifier + kingdomCostMod);

  let s = updatePlayer(state, playerId, {
    power: player.power - effectiveCost,
    handInstIds: player.handInstIds.filter(id => id !== cardInstId),
  });

  if (usingMapa && ctx.mapaInstId) {
    s = discardCardFromKingdom(s, ctx.mapaInstId);
    s = addLog(s, 'Mapa de Nunca Jamás descartado para pagar el Objeto.');
  }

  const locState = getPlayer(s, playerId).locationStates[targetLocationId];
  if (card.cardType === CardType.HERO) {
    s = updateLocationState(s, playerId, targetLocationId, {
      heroCardInstIds: [...locState.heroCardInstIds, cardInstId],
    });
  } else {
    s = updateLocationState(s, playerId, targetLocationId, {
      villainCardInstIds: [...locState.villainCardInstIds, cardInstId],
    });
  }
  s = updateCard(s, cardInstId, { locationId: targetLocationId });
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };
  s = addLog(s, `${player.name} juega ${card.name} en ${targetLocationId}.`);

  const statePreEffects = s;
  s = runEffects(s, cardInstId, 'ON_PLAY', { actingPlayerId: playerId, cardInstId, targetLocationId, ...ctx });
  s = firePawnArrivalIfMoved(statePreEffects, s);

  if (card.cardType === CardType.EFFECT || card.cardType === CardType.CONDITION) {
    s = discardCardFromKingdom(s, cardInstId);
  }

  if (card.cardType === CardType.ALLY) {
    const locAfter = getPlayer(s, playerId).locationStates[targetLocationId];
    for (const cId of [...locAfter.villainCardInstIds]) {
      if (cId === cardInstId) continue;
      s = runEffects(s, cId, 'ON_ALLY_PLACED', {
        actingPlayerId: playerId, cardInstId: cId, targetCardInstId: cardInstId, targetLocationId,
      });
    }
    s = checkAllyConditions(s, playerId);
  }

  return checkWin(s);
}

export function vanquish(
  state: GameState,
  playerId: PlayerId,
  heroInstId: CardInstId,
  allyInstIds: CardInstId[],
  slotIndex: number,
): GameState {
  return executeVanquish(state, playerId, heroInstId, allyInstIds, slotIndex);
}

/** Vencer gratuito (sin consumir casilla de acción) — p. ej. el de Trampa del Príncipe Juan. */
export function vanquishFree(
  state: GameState,
  playerId: PlayerId,
  heroInstId: CardInstId,
  allyInstIds: CardInstId[],
): GameState {
  return executeVanquish(state, playerId, heroInstId, allyInstIds);
}

function executeVanquish(
  state: GameState,
  playerId: PlayerId,
  heroInstId: CardInstId,
  allyInstIds: CardInstId[],
  slotIndex?: number,
): GameState {
  const hero = state.allCards[heroInstId];
  const heroLocId = hero.locationId!;
  const heroStr = getEffectiveStrength(state, heroInstId);

  const hasAttachedBurla = (id: CardInstId) =>
    state.allCards[id]?.attachedItemInstIds.some(
      itemId => state.allCards[itemId]?.effectIds.includes(EffectId.BURLA_ATTACH),
    ) ?? false;
  const otherBurlaHero = getPlayer(state, playerId).locationStates[heroLocId].heroCardInstIds.find(
    id => id !== heroInstId && hasAttachedBurla(id),
  );
  if (otherBurlaHero && !hasAttachedBurla(heroInstId)) {
    return addLog(state, '¡Debes derrotar primero a los Héroes con Burla!');
  }

  let s = state;
  const flechaAllyCount = allyInstIds.filter(allyId =>
    state.allCards[allyId]?.attachedItemInstIds.some(
      itemId => state.allCards[itemId]?.effectIds.includes(EffectId.JHON_FLECHA_ATTACH),
    ),
  ).length;
  if (flechaAllyCount > 0) {
    s = applyPowerGain(s, playerId, flechaAllyCount * 2);
    s = addLog(s, `Flecha Dorada: ${getPlayer(s, playerId).name} recibe ${flechaAllyCount * 2} Moneda(s) de Poder.`);
  }
  for (const allyId of allyInstIds) {
    const arcoId = s.allCards[allyId]?.attachedItemInstIds.find(
      itemId => s.allCards[itemId]?.effectIds.includes(EffectId.JHON_ARCO_ATTACH),
    );
    if (arcoId) {
      s = discardCardFromKingdom(s, arcoId);
      s = addLog(s, `Arco con Flechas se descarta en lugar de ${s.allCards[allyId]?.name}.`);
    } else {
      s = discardCardFromKingdom(s, allyId);
    }
  }

  const plugin = getPlugin(getPlayer(s, playerId).villainId);
  if (plugin.onVanquish) s = plugin.onVanquish(s, playerId, heroInstId, heroLocId);

  s = discardCardFromKingdom(s, heroInstId);
  if (plugin.onHeroDiscarded) s = plugin.onHeroDiscarded(s, playerId, heroInstId);
  if (slotIndex !== undefined) {
    s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };
  }
  s = addLog(s, `${getPlayer(s, playerId).name} derrota a ${hero.name}.`);

  for (const cId of [...(getPlayer(s, playerId).locationStates[heroLocId]?.villainCardInstIds ?? [])]) {
    s = runEffects(s, cId, 'ON_VANQUISH', {
      actingPlayerId: playerId, cardInstId: cId, targetCardInstId: heroInstId, targetLocationId: heroLocId,
    });
  }

  if (heroStr >= 4) s = checkConditions(s, 'VANQUISH_4PLUS', playerId);

  return checkWin(s);
}

export function moveItemAlly(
  state: GameState,
  playerId: PlayerId,
  cardInstId: CardInstId,
  targetLocationId: LocationId,
  slotIndex: number,
): GameState {
  const card = state.allCards[cardInstId];
  const srcLocId = card.locationId!;
  const srcLocState = getPlayer(state, playerId).locationStates[srcLocId];
  let s = updateLocationState(state, playerId, srcLocId, {
    villainCardInstIds: srcLocState.villainCardInstIds.filter(id => id !== cardInstId),
  });
  const destLocState = getPlayer(s, playerId).locationStates[targetLocationId];
  s = updateLocationState(s, playerId, targetLocationId, {
    villainCardInstIds: [...destLocState.villainCardInstIds, cardInstId],
  });
  s = updateCard(s, cardInstId, { locationId: targetLocationId });
  // Los Objetos adjuntos viajan con su portador.
  s = moveAttachedItems(s, cardInstId, targetLocationId);
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };
  s = addLog(s, `${card.name} movido/a a ${targetLocationId}.`);
  if (getPlayer(s, playerId).pawnLocationId === targetLocationId) {
    s = runEffects(s, cardInstId, 'ON_PAWN_ARRIVES', { actingPlayerId: playerId, cardInstId, targetLocationId });
  }
  return s;
}

export function moveHero(
  state: GameState,
  playerId: PlayerId,
  heroInstId: CardInstId,
  targetLocationId: LocationId,
  slotIndex: number,
): GameState {
  const hero = state.allCards[heroInstId];
  // Guardia defensiva (la validación vive en canMoveHero): Lady Kluck no entra en La Prisión.
  if (heroBlockedFromLocation(state, heroInstId, targetLocationId)) {
    return addLog(state, `${hero.name} no puede moverse a esa ubicación.`);
  }
  const srcLocId = hero.locationId!;
  const src = getPlayer(state, playerId).locationStates[srcLocId];
  let s = updateLocationState(state, playerId, srcLocId, {
    heroCardInstIds: src.heroCardInstIds.filter(id => id !== heroInstId),
  });
  const dest = getPlayer(s, playerId).locationStates[targetLocationId];
  s = updateLocationState(s, playerId, targetLocationId, {
    heroCardInstIds: [...dest.heroCardInstIds, heroInstId],
  });
  s = updateCard(s, heroInstId, { locationId: targetLocationId });
  // Los Objetos adjuntos (Burla, Polvo de Hada, etc.) viajan con el Héroe.
  s = moveAttachedItems(s, heroInstId, targetLocationId);
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };
  return addLog(s, `${hero.name} movido/a a ${targetLocationId}.`);
}

export function activateCard(
  state: GameState,
  playerId: PlayerId,
  cardInstId: CardInstId,
  slotIndex: number,
  ctx: ActivateCardCtx = {},
): GameState {
  const player = getPlayer(state, playerId);
  const card = state.allCards[cardInstId];
  let s = updatePlayer(state, playerId, { power: player.power - (card.activationCost ?? 0) });
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };
  s = runEffects(s, cardInstId, 'ACTIVATED', { actingPlayerId: playerId, cardInstId, ...ctx });
  return addLog(s, `${player.name} activa ${card.name}.`);
}

export function discardFromHand(
  state: GameState,
  playerId: PlayerId,
  cardInstIds: CardInstId[],
  slotIndex: number,
): GameState {
  const player = getPlayer(state, playerId);
  const toDiscard = cardInstIds.filter(id => player.handInstIds.includes(id));
  let s = updatePlayer(state, playerId, {
    handInstIds: player.handInstIds.filter(id => !toDiscard.includes(id)),
    villainDiscardInstIds: [...player.villainDiscardInstIds, ...toDiscard],
  });
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };
  return addLog(s, `${player.name} descarta ${toDiscard.length} carta(s).`);
}

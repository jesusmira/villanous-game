import { CardType } from '../../types';
import type { GameState, PlayerId, CardInstId, LocationId } from '../../types';
import { getEffectDef } from '../../villains/registry';
import { runEffects } from '../EffectEngine';
import { shuffle } from '../../utils/shuffle';
import {
  getPlayer, updatePlayer, updateLocationState, updateCard,
  discardCardFromKingdom, addLog, checkWin, getEffectiveStrength,
  heroBlockedFromLocation,
} from '../stateHelpers';
import { getActionAtSlot } from '../slotHelpers';
import { firePawnArrivalIfMoved } from './_helpers';

export function placeHeroInKingdom(
  state: GameState,
  heroInstId: CardInstId,
  targetPlayerId: PlayerId,
  targetLocationId: LocationId,
  actingPlayerId: PlayerId,
): GameState {
  let s = state;
  const locState = getPlayer(s, targetPlayerId).locationStates[targetLocationId];
  s = updateLocationState(s, targetPlayerId, targetLocationId, {
    heroCardInstIds: [...locState.heroCardInstIds, heroInstId],
  });
  s = updateCard(s, heroInstId, { locationId: targetLocationId });
  const locAfter = getPlayer(s, targetPlayerId).locationStates[targetLocationId];
  for (const cId of [...locAfter.villainCardInstIds]) {
    s = runEffects(s, cId, 'ON_HERO_PLAYED_HERE', {
      actingPlayerId, cardInstId: cId, targetCardInstId: heroInstId, targetLocationId,
    });
  }
  return s;
}

export function startFate(
  state: GameState,
  actingPlayerId: PlayerId,
  targetPlayerIndex: number,
  slotIndex: number,
): GameState {
  const revealCount = getActionAtSlot(state, actingPlayerId, slotIndex)?.value ?? 2;
  const targetPlayer = state.players[targetPlayerIndex];

  let s = state;
  if (targetPlayer.fateDeckInstIds.length === 0) {
    const reshuffled = shuffle([...targetPlayer.fateDiscardInstIds]);
    s = updatePlayer(s, targetPlayer.id, { fateDeckInstIds: reshuffled, fateDiscardInstIds: [] });
    s = addLog(s, 'Mazo de Destino barajado.');
  }

  let revealedCards = getPlayer(s, targetPlayer.id).fateDeckInstIds.slice(0, revealCount);
  s = updatePlayer(s, targetPlayer.id, {
    fateDeckInstIds: getPlayer(s, targetPlayer.id).fateDeckInstIds.slice(revealCount),
  });
  for (const revId of [...revealedCards]) {
    s = runEffects(s, revId, 'ON_FATE_REVEAL', { actingPlayerId, cardInstId: revId });
  }
  const autoPlayedInstIds = revealedCards.filter(id => !!s.allCards[id]?.locationId);
  revealedCards = revealedCards.filter(id => !s.allCards[id]?.locationId);
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };

  const targetAfter = getPlayer(s, targetPlayer.id);
  if (targetAfter.dragonActive) {
    s = updatePlayer(s, targetPlayer.id, { power: targetAfter.power + 3, dragonActive: false });
    s = addLog(s, `Forma de Dragón: ${targetAfter.name} gana 3 de Poder al ser objetivo de Destino.`);
  }

  s = { ...s, pendingFate: { actingPlayerId, targetPlayerIndex, revealedInstIds: revealedCards, autoPlayedInstIds } };
  return addLog(s, `${getPlayer(s, actingPlayerId).name} usa Destino contra ${targetPlayer.name}.`);
}

export function resolveFate(
  state: GameState,
  chosenInstId: CardInstId,
  targetLocationId: LocationId,
  ctx: Partial<{ targetCardInstId: CardInstId }> = {},
): GameState {
  if (!state.pendingFate) return state;
  const { actingPlayerId, targetPlayerIndex, revealedInstIds } = state.pendingFate;
  const targetPlayer = state.players[targetPlayerIndex];

  // Lady Kluck: no puede ser JUGADA en La Prisión. Se rechaza la resolución (pendingFate
  // queda intacto) para que quien resuelve elija otra ubicación — a diferencia de los
  // bloqueos de ubicación (Fuego Verde), aquí la carta NO se descarta.
  const chosen = state.allCards[chosenInstId];
  if (chosen?.cardType === CardType.HERO && heroBlockedFromLocation(state, chosenInstId, targetLocationId)) {
    return addLog(state, `${chosen.name} no puede jugarse en esa ubicación — elige otra.`);
  }

  const discarded = revealedInstIds.filter(id => id !== chosenInstId);
  let s = updatePlayer(state, targetPlayer.id, {
    fateDiscardInstIds: [...targetPlayer.fateDiscardInstIds, ...discarded],
  });
  s = { ...s, pendingFate: undefined };

  const card = s.allCards[chosenInstId];
  if (!card) return s;

  if (card.cardType === CardType.HERO) {
    const targetLocCheck = getPlayer(s, targetPlayer.id).locationStates[targetLocationId];

    const heroBlocked = targetLocCheck.villainCardInstIds.some(id =>
      s.allCards[id]?.effectIds.some(effId => getEffectDef(effId)?.blocksHeroPlay),
    );
    if (heroBlocked) {
      s = updatePlayer(s, targetPlayer.id, {
        fateDiscardInstIds: [...getPlayer(s, targetPlayer.id).fateDiscardInstIds, chosenInstId],
      });
      return addLog(s, `${card.name} no puede jugarse aquí (ubicación bloqueada).`);
    }

    const minStrReq = targetLocCheck.villainCardInstIds.reduce((max, cId) => {
      for (const effId of (s.allCards[cId]?.effectIds ?? [])) {
        const eff = getEffectDef(effId);
        if (eff?.heroMinStrengthRequired) return Math.max(max, eff.heroMinStrengthRequired);
      }
      return max;
    }, 0);
    if (minStrReq > 0 && getEffectiveStrength(s, chosenInstId) < minStrReq) {
      s = updatePlayer(s, targetPlayer.id, {
        fateDiscardInstIds: [...getPlayer(s, targetPlayer.id).fateDiscardInstIds, chosenInstId],
      });
      return addLog(s, `${card.name} no puede jugarse aquí (requiere Fuerza ≥ ${minStrReq}).`);
    }

    s = placeHeroInKingdom(s, chosenInstId, targetPlayer.id, targetLocationId, actingPlayerId);
    s = addLog(s, `${card.name} juegado en el Reino de ${targetPlayer.name}.`);
  } else {
    const locState = getPlayer(s, targetPlayer.id).locationStates[targetLocationId];
    if (card.cardType === CardType.ITEM) {
      s = updateLocationState(s, targetPlayer.id, targetLocationId, {
        villainCardInstIds: [...locState.villainCardInstIds, chosenInstId],
      });
      s = updateCard(s, chosenInstId, { locationId: targetLocationId });
    } else {
      s = updateCard(s, chosenInstId, { locationId: targetLocationId });
    }
    s = addLog(s, `${card.name} jugado contra ${targetPlayer.name}.`);
  }

  const statePreFateEffects = s;
  s = runEffects(s, chosenInstId, 'ON_PLAY', { actingPlayerId, cardInstId: chosenInstId, targetLocationId, ...ctx });
  s = firePawnArrivalIfMoved(statePreFateEffects, s);

  if (card.cardType === CardType.EFFECT) s = discardCardFromKingdom(s, chosenInstId);

  return checkWin(s);
}

export function resolveAuroraHero(state: GameState, targetLocationId: LocationId): GameState {
  const pending = state.pendingAuroraHero;
  if (!pending) return state;
  const { heroInstId, targetPlayerId } = pending;
  const hero = state.allCards[heroInstId];
  if (!hero) return { ...state, pendingAuroraHero: undefined };

  let s: GameState = { ...state, pendingAuroraHero: undefined };
  const locState = getPlayer(s, targetPlayerId).locationStates[targetLocationId];

  // Fuego Verde: heroes can't be placed here
  const heroBlocked = locState.villainCardInstIds.some(id =>
    s.allCards[id]?.effectIds.some(effId => getEffectDef(effId)?.blocksHeroPlay),
  );
  if (heroBlocked) {
    s = updatePlayer(s, targetPlayerId, {
      fateDiscardInstIds: [...getPlayer(s, targetPlayerId).fateDiscardInstIds, heroInstId],
    });
    return addLog(s, `${hero.name} no puede jugarse aquí (ubicación bloqueada).`);
  }

  // Selva: hero needs minimum strength
  const minStrReq = locState.villainCardInstIds.reduce((max, cId) => {
    for (const effId of (s.allCards[cId]?.effectIds ?? [])) {
      const eff = getEffectDef(effId);
      if (eff?.heroMinStrengthRequired) return Math.max(max, eff.heroMinStrengthRequired);
    }
    return max;
  }, 0);
  if (minStrReq > 0 && getEffectiveStrength(s, heroInstId) < minStrReq) {
    s = updatePlayer(s, targetPlayerId, {
      fateDiscardInstIds: [...getPlayer(s, targetPlayerId).fateDiscardInstIds, heroInstId],
    });
    return addLog(s, `${hero.name} no puede jugarse aquí (requiere Fuerza ≥ ${minStrReq}).`);
  }

  s = placeHeroInKingdom(s, heroInstId, targetPlayerId, targetLocationId, pending.actingPlayerId);
  s = addLog(s, `${hero.name} colocado en ${targetLocationId}.`);
  s = runEffects(s, heroInstId, 'ON_PLAY', {
    actingPlayerId: pending.actingPlayerId, cardInstId: heroInstId, targetLocationId,
  });
  return s;
}

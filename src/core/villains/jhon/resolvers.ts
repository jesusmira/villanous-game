import { CardType } from '../../types';
import type {
  GameState, PlayerId, CardInstId, LocationId, ConditionCtx,
} from '../../types';
import { EffectId, CardDefId } from '../effectIds';
import {
  getPlayer, updatePlayer, updateLocationState, updateCard, addLog,
} from '../../engine/stateHelpers';
import { runEffects } from '../../engine/EffectEngine';
import { shuffle } from '../../utils/shuffle';

// ── Find Robin Hood anywhere and play him at targetLocId ──────────────────────
function findAndPlayRobinHood(
  state: GameState,
  playerId: PlayerId,
  targetLocId: LocationId,
): GameState {
  const player = getPlayer(state, playerId);

  // 1. Kingdom
  for (const [locId, locState] of Object.entries(player.locationStates)) {
    const heroId = locState.heroCardInstIds.find(
      id => state.allCards[id]?.defId === CardDefId.JHON_ROBIN_HOOD,
    );
    if (heroId) {
      let s = updateLocationState(state, playerId, locId, {
        heroCardInstIds: locState.heroCardInstIds.filter(id => id !== heroId),
      });
      const dest = getPlayer(s, playerId).locationStates[targetLocId];
      s = updateLocationState(s, playerId, targetLocId, {
        heroCardInstIds: [...dest.heroCardInstIds, heroId],
      });
      s = updateCard(s, heroId, { locationId: targetLocId });
      return addLog(s, `Robin Hood movido a ${targetLocId}.`);
    }
  }

  // 2. Fate discard
  let heroId = player.fateDiscardInstIds.find(
    id => state.allCards[id]?.defId === CardDefId.JHON_ROBIN_HOOD,
  );
  if (heroId) {
    let s = updatePlayer(state, playerId, {
      fateDiscardInstIds: player.fateDiscardInstIds.filter(id => id !== heroId),
    });
    const dest = getPlayer(s, playerId).locationStates[targetLocId];
    s = updateLocationState(s, playerId, targetLocId, {
      heroCardInstIds: [...dest.heroCardInstIds, heroId],
    });
    s = updateCard(s, heroId, { locationId: targetLocId });
    return addLog(s, `Robin Hood encontrado y jugado en ${targetLocId}.`);
  }

  // 3. Fate deck (reshuffle after)
  heroId = player.fateDeckInstIds.find(
    id => state.allCards[id]?.defId === CardDefId.JHON_ROBIN_HOOD,
  );
  if (heroId) {
    const newDeck = shuffle(player.fateDeckInstIds.filter(id => id !== heroId));
    let s = updatePlayer(state, playerId, { fateDeckInstIds: newDeck });
    const dest = getPlayer(s, playerId).locationStates[targetLocId];
    s = updateLocationState(s, playerId, targetLocId, {
      heroCardInstIds: [...dest.heroCardInstIds, heroId],
    });
    s = updateCard(s, heroId, { locationId: targetLocId });
    return addLog(s, `Robin Hood encontrado en el mazo y jugado en ${targetLocId}.`);
  }

  return state;
}

// ── Cobardía condition handler ────────────────────────────────────────────────
function handleCobardia(s: GameState, reactingPlayerId: PlayerId, ctx: ConditionCtx): GameState {
  if (!ctx.allyInstId || !ctx.targetLocationId) return s;
  const ally = s.allCards[ctx.allyInstId];
  if (!ally || ally.cardType !== CardType.ALLY) return s;
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
  return addLog(s, `Cobardía: ${ally.name} jugado gratis en ${ctx.targetLocationId}.`);
}

export const conditionHandlers = {
  [EffectId.JHON_COBARDIA_COND]: handleCobardia,
};

// ── onVanquish: Lady Marian → find Robin Hood; Little John → return stored power ──
export function onVanquish(
  state: GameState,
  _playerId: PlayerId,
  heroInstId: CardInstId,
  heroLocId: LocationId,
): GameState {
  const hero = state.allCards[heroInstId];
  let s = state;
  if (hero?.defId === CardDefId.JHON_LADY_MARIAN) {
    s = findAndPlayRobinHood(s, hero.ownerId, heroLocId);
  }
  if (hero?.storedPower && hero.storedPower > 0) {
    const pj = getPlayer(s, hero.ownerId);
    s = updatePlayer(s, hero.ownerId, { power: pj.power + hero.storedPower });
    s = addLog(s, `Little John devuelve ${hero.storedPower} Moneda(s) al Príncipe Juan.`);
  }
  return s;
}

// ── onHeroDiscarded: Toby returns to fate deck ────────────────────────────────
export function onHeroDiscarded(
  state: GameState,
  playerId: PlayerId,
  heroInstId: CardInstId,
): GameState {
  const hero = state.allCards[heroInstId];
  if (hero?.defId !== CardDefId.JHON_TOBY) return state;
  const player = getPlayer(state, playerId);
  const newDiscard = player.fateDiscardInstIds.filter(id => id !== heroInstId);
  const newDeck = shuffle([...player.fateDeckInstIds, heroInstId]);
  const s = updatePlayer(state, playerId, {
    fateDiscardInstIds: newDiscard,
    fateDeckInstIds: newDeck,
  });
  return addLog(s, 'Toby vuelve al mazo de Destino.');
}

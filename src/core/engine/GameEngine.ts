import { TurnPhase, CardType, CardDeck, ActionType } from '../types';
import type {
  GameState, PlayerState, CardInst, CardInstId, LocationId,
  PlayerId, GameSetupOptions, ConditionTriggerType,
} from '../types';
import { getPlugin, getEffectDef } from '../villains/registry';
import { runEffects } from './EffectEngine';
import {
  getPlayer, updatePlayer, updateLocationState, updateCard,
  discardCardFromKingdom, addLog, shuffle, getEffectiveStrength, getActionAtSlot,
  computeKingdomCostMod,
} from './stateHelpers';

// ─── INITIALIZATION ───────────────────────────────────────────────────────────

export function createInitialState(options: GameSetupOptions): GameState {
  const p1Id = 'player_0';
  const p2Id = 'player_1';
  const plugin1 = getPlugin(options.player1.villainId);
  const plugin2 = getPlugin(options.player2.villainId);

  const allCards: Record<CardInstId, CardInst> = {};
  let counter = 0;

  function makeInsts(plugin: ReturnType<typeof getPlugin>, ownerId: PlayerId) {
    return [...plugin.villainCardDefs, ...plugin.fateCardDefs].map(def => {
      const instId = `c${counter++}`;
      const inst: CardInst = {
        instId,
        defId: def.id,
        ownerId,
        villainId: def.villainId,
        deck: def.deck,
        cardType: def.type,
        name: def.name,
        baseCost: def.cost,
        baseStrength: def.strength,
        effectIds: def.effectIds,
        activationCost: def.activationCost,
        grantsActionSlot: def.grantsActionSlot,
        locationId: undefined,
        attachedToInstId: undefined,
        attachedItemInstIds: [],
        strengthModifier: 0,
        costModifier: 0,
        bonusThisTurn: 0,
      };
      allCards[instId] = inst;
      return instId;
    });
  }

  const p1AllInstIds = makeInsts(plugin1, p1Id);
  const p2AllInstIds = makeInsts(plugin2, p2Id);

  function split(instIds: string[], plugin: ReturnType<typeof getPlugin>, ownerId: PlayerId) {
    const villain = shuffle(
      instIds.filter(id => allCards[id].deck === CardDeck.VILLAIN && allCards[id].ownerId === ownerId),
    );
    const fate = shuffle(
      instIds.filter(id => allCards[id].deck === CardDeck.FATE && allCards[id].ownerId === ownerId),
    );
    const hand = villain.splice(0, plugin.handSize);
    return { villain, fate, hand };
  }

  const p1Split = split([...p1AllInstIds, ...p2AllInstIds], plugin1, p1Id);
  const p2Split = split([...p1AllInstIds, ...p2AllInstIds], plugin2, p2Id);

  function makeLocStates(plugin: ReturnType<typeof getPlugin>) {
    const map: PlayerState['locationStates'] = {};
    for (const loc of plugin.locations) {
      map[loc.id] = {
        id: loc.id,
        isLocked: !!loc.startsLocked,
        villainCardInstIds: [],
        heroCardInstIds: [],
      };
    }
    return map;
  }

  const player1: PlayerState = {
    id: p1Id,
    name: options.player1.name,
    villainId: options.player1.villainId,
    power: plugin1.startingPower,
    pawnLocationId: plugin1.startingLocationId,
    handInstIds: p1Split.hand,
    villainDeckInstIds: p1Split.villain,
    villainDiscardInstIds: [],
    fateDeckInstIds: p1Split.fate,
    fateDiscardInstIds: [],
    locationStates: makeLocStates(plugin1),
    isAI: options.player1.isAI,
    completedObjectiveSteps: [],
  };

  const player2: PlayerState = {
    id: p2Id,
    name: options.player2.name,
    villainId: options.player2.villainId,
    power: plugin2.startingPower + 1, // 2nd player compensation
    pawnLocationId: plugin2.startingLocationId,
    handInstIds: p2Split.hand,
    villainDeckInstIds: p2Split.villain,
    villainDiscardInstIds: [],
    fateDeckInstIds: p2Split.fate,
    fateDiscardInstIds: [],
    locationStates: makeLocStates(plugin2),
    isAI: options.player2.isAI,
    completedObjectiveSteps: [],
  };

  return {
    players: [player1, player2],
    currentPlayerIndex: 0,
    turnPhase: TurnPhase.MOVE,
    winner: null,
    allCards,
    roundNumber: 1,
    usedActionSlotIndices: [],
    pendingFate: undefined,
    log: ['¡La partida ha comenzado!'],
  };
}

// ─── CHECK WIN ────────────────────────────────────────────────────────────────

export function checkWin(state: GameState): GameState {
  for (const player of state.players) {
    const plugin = getPlugin(player.villainId);
    if (plugin.checkWinCondition(state, player.id)) {
      return addLog({ ...state, winner: player.id }, `¡${player.name} ha ganado!`);
    }
  }
  return state;
}

// ─── CHECK CONDITIONS ─────────────────────────────────────────────────────────

function checkConditions(
  state: GameState,
  trigger: ConditionTriggerType,
  actingPlayerId: PlayerId,
): GameState {
  if (state.pendingCondition) return state;
  const reactingPlayer = state.players.find(p => p.id !== actingPlayerId);
  if (!reactingPlayer) return state;
  const eligible = reactingPlayer.handInstIds.filter(id => {
    const card = state.allCards[id];
    if (!card || card.cardType !== CardType.CONDITION) return false;
    return card.effectIds.some(effId => getEffectDef(effId)?.conditionTrigger === trigger);
  });
  if (eligible.length === 0) return state;
  return {
    ...state,
    pendingCondition: {
      reactingPlayerId: reactingPlayer.id,
      triggerType: trigger,
      eligibleCardInstIds: eligible,
    },
  };
}

// ─── MOVE PAWN ────────────────────────────────────────────────────────────────

export function movePawn(
  state: GameState,
  playerId: PlayerId,
  locationId: LocationId,
): GameState {
  let s = updatePlayer(state, playerId, { pawnLocationId: locationId, skipNextMove: false, dragonActive: false });
  s = addLog(s, `${getPlayer(s, playerId).name} se mueve a ${locationId}.`);
  // Run ON_PAWN_ARRIVES on all cards at new location (villain + hero, e.g. Fuego Verde, Tic Tac)
  const arrivedLoc = getPlayer(s, playerId).locationStates[locationId];
  for (const cardId of [
    ...arrivedLoc.villainCardInstIds,
    ...arrivedLoc.heroCardInstIds,
  ]) {
    s = runEffects(s, cardId, 'ON_PAWN_ARRIVES', {
      actingPlayerId: playerId, cardInstId: cardId, targetLocationId: locationId,
    });
  }
  s = { ...s, turnPhase: TurnPhase.ACTIVATE, usedActionSlotIndices: [] };
  s = checkWin(s);
  return s;
}

// ─── GAIN POWER ───────────────────────────────────────────────────────────────

export function gainPower(
  state: GameState,
  playerId: PlayerId,
  slotIndex: number,
  amountOverride?: number,
): GameState {
  const player = getPlayer(state, playerId);
  let amount: number;
  if (amountOverride !== undefined) {
    amount = amountOverride;
  } else {
    amount = getActionAtSlot(state, playerId, slotIndex)?.value ?? 2;
  }
  let s = updatePlayer(state, playerId, { power: player.power + amount });
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };
  return addLog(s, `${player.name} gana ${amount} de Poder.`);
}

export function skipMove(state: GameState, playerId: PlayerId): GameState {
  let s = updatePlayer(state, playerId, { skipNextMove: false, dragonActive: false });
  s = { ...s, turnPhase: TurnPhase.ACTIVATE, usedActionSlotIndices: [] };
  return addLog(s, `${getPlayer(state, playerId).name} permanece en ${getPlayer(state, playerId).pawnLocationId}.`);
}

// ─── PLAY CARD ────────────────────────────────────────────────────────────────

export function playCard(
  state: GameState,
  playerId: PlayerId,
  cardInstId: CardInstId,
  slotIndex: number,
  targetLocationId: LocationId,
  ctx: Partial<{ targetCardInstId: CardInstId; auxiliaryInstIds: CardInstId[]; mapaInstId: CardInstId }> = {},
): GameState {
  const player = getPlayer(state, playerId);
  const card = state.allCards[cardInstId];

  // Check if curses are blocked at target location (e.g. Primavera)
  if (card.cardType === CardType.CURSE) {
    const locHeroes = player.locationStates[targetLocationId].heroCardInstIds;
    const curseBlocked = locHeroes.some(id =>
      state.allCards[id]?.effectIds.some(effId => getEffectDef(effId)?.blocksCursePlay),
    );
    if (curseBlocked) return addLog(state, 'No se puede jugar una Maldición aquí (Primavera).');
  }

  // Mapa de Nunca Jamás: discard it instead of paying for an Item
  const usingMapa = !!(ctx.mapaInstId && card.cardType === CardType.ITEM);

  const kingdomCostMod = usingMapa ? 0 : computeKingdomCostMod(state, playerId, card, targetLocationId);
  const effectiveCost = usingMapa ? 0 : Math.max(0, card.baseCost + card.costModifier + kingdomCostMod);

  // Deduct power (0 if using Mapa)
  let s = updatePlayer(state, playerId, {
    power: player.power - effectiveCost,
    handInstIds: player.handInstIds.filter(id => id !== cardInstId),
  });

  // Discard Mapa from kingdom
  if (usingMapa && ctx.mapaInstId) {
    s = discardCardFromKingdom(s, ctx.mapaInstId);
    s = addLog(s, 'Mapa de Nunca Jamás descartado para pagar el Objeto.');
  }

  // Place in kingdom
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

  // Run ON_PLAY effects
  s = runEffects(s, cardInstId, 'ON_PLAY', {
    actingPlayerId: playerId,
    cardInstId,
    targetLocationId,
    ...ctx,
  });

  // Discard EFFECT and CONDITION cards immediately after their ON_PLAY effects fire
  if (card.cardType === CardType.EFFECT || card.cardType === CardType.CONDITION) {
    s = discardCardFromKingdom(s, cardInstId);
  }

  // Run ON_ALLY_PLACED on other villain cards at location (e.g. Sueño Sin Sueños discards)
  if (card.cardType === CardType.ALLY) {
    const locAfter = getPlayer(s, playerId).locationStates[targetLocationId];
    for (const cId of [...locAfter.villainCardInstIds]) {
      if (cId === cardInstId) continue;
      s = runEffects(s, cId, 'ON_ALLY_PLACED', {
        actingPlayerId: playerId, cardInstId: cId,
        targetCardInstId: cardInstId, targetLocationId,
      });
    }
  }

  // Trigger ally-based conditions
  if (card.cardType === CardType.ALLY) {
    const allLocStates = Object.values(getPlayer(s, playerId).locationStates);
    const allyCount = allLocStates
      .flatMap(ls => ls.villainCardInstIds)
      .filter(id => s.allCards[id]?.cardType === CardType.ALLY).length;
    if (allyCount >= 3) {
      s = checkConditions(s, 'ALLY_3PLUS', playerId);
    }
    if (!s.pendingCondition) {
      const allyStr = getEffectiveStrength(s, cardInstId);
      if (allyStr >= 4) {
        s = checkConditions(s, 'ALLY_4PLUS_STR', playerId);
      }
    }
  }

  s = checkWin(s);
  return s;
}

// ─── VANQUISH ─────────────────────────────────────────────────────────────────

export function vanquish(
  state: GameState,
  playerId: PlayerId,
  heroInstId: CardInstId,
  allyInstIds: CardInstId[],
  slotIndex: number,
): GameState {
  const hero = state.allCards[heroInstId];
  const heroLocId = hero.locationId!;
  const heroStr = getEffectiveStrength(state, heroInstId);

  // Enforce 2-ally minimum (e.g. Niños Perdidos, Guardias)
  if (hero.effectIds.some(effId => getEffectDef(effId)?.requiresMultipleAlliesToVanquish) && allyInstIds.length < 2) {
    return addLog(state, `${hero.name} requiere al menos dos Aliados para ser derrotado.`);
  }

  // Enforce Burla priority: defeat heroes with Burla before others
  const hasAttachedBurla = (id: CardInstId) =>
    state.allCards[id]?.attachedItemInstIds.some(
      itemId => state.allCards[itemId]?.effectIds.includes('hook_burla_attach'),
    ) ?? false;
  const initialLocState = getPlayer(state, playerId).locationStates[heroLocId];
  const otherBurlaHero = initialLocState.heroCardInstIds.find(
    id => id !== heroInstId && hasAttachedBurla(id),
  );
  if (otherBurlaHero && !hasAttachedBurla(heroInstId)) {
    return addLog(state, '¡Debes derrotar primero a los Héroes con Burla!');
  }

  let s = state;

  // Discard allies
  for (const allyId of allyInstIds) {
    const player = getPlayer(s, playerId);
    const locState = player.locationStates[heroLocId];
    s = updateLocationState(s, playerId, heroLocId, {
      villainCardInstIds: locState.villainCardInstIds.filter(id => id !== allyId),
    });
    s = updatePlayer(s, playerId, {
      villainDiscardInstIds: [...getPlayer(s, playerId).villainDiscardInstIds, allyId],
    });
    s = updateCard(s, allyId, { locationId: undefined });
  }

  // Check if Hook defeats Peter Pan at Jolly Roger
  if (
    hero.defId === 'hook_fate_peter_pan' &&
    heroLocId === 'jollyroger' &&
    getPlayer(s, playerId).villainId === 'hook'
  ) {
    s = updatePlayer(s, playerId, {
      completedObjectiveSteps: [
        ...getPlayer(s, playerId).completedObjectiveSteps,
        'PETER_PAN_DEFEATED_AT_JOLLYROGER',
      ],
    });
  }

  // Discard hero
  s = discardCardFromKingdom(s, heroInstId);
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };
  s = addLog(s, `${getPlayer(s, playerId).name} derrota a ${hero.name}.`);

  // Trigger VANQUISH_4PLUS conditions
  if (heroStr >= 4) {
    s = checkConditions(s, 'VANQUISH_4PLUS', playerId);
  }

  return checkWin(s);
}

// ─── MOVE ITEM / ALLY ─────────────────────────────────────────────────────────

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
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };
  return addLog(s, `${card.name} movido/a a ${targetLocationId}.`);
}

// ─── MOVE HERO ────────────────────────────────────────────────────────────────

export function moveHero(
  state: GameState,
  playerId: PlayerId,
  heroInstId: CardInstId,
  targetLocationId: LocationId,
  slotIndex: number,
): GameState {
  const hero = state.allCards[heroInstId];
  const srcLocId = hero.locationId!;
  const player = getPlayer(state, playerId);

  const src = player.locationStates[srcLocId];
  let s = updateLocationState(state, playerId, srcLocId, {
    heroCardInstIds: src.heroCardInstIds.filter(id => id !== heroInstId),
  });
  const dest = getPlayer(s, playerId).locationStates[targetLocationId];
  s = updateLocationState(s, playerId, targetLocationId, {
    heroCardInstIds: [...dest.heroCardInstIds, heroInstId],
  });
  s = updateCard(s, heroInstId, { locationId: targetLocationId });
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };
  return addLog(s, `${hero.name} movido/a a ${targetLocationId}.`);
}

// ─── ACTIVATE CARD ────────────────────────────────────────────────────────────

export function activateCard(
  state: GameState,
  playerId: PlayerId,
  cardInstId: CardInstId,
  slotIndex: number,
  ctx: Partial<{ targetLocationId: LocationId; targetCardInstId: CardInstId }> = {},
): GameState {
  const player = getPlayer(state, playerId);
  const card = state.allCards[cardInstId];
  const cost = card.activationCost ?? 0;

  let s = updatePlayer(state, playerId, { power: player.power - cost });
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };
  s = runEffects(s, cardInstId, 'ACTIVATED', {
    actingPlayerId: playerId,
    cardInstId,
    ...ctx,
  });
  return addLog(s, `${player.name} activa ${card.name}.`);
}

// ─── FATE ─────────────────────────────────────────────────────────────────────

export function startFate(
  state: GameState,
  actingPlayerId: PlayerId,
  targetPlayerIndex: number,
  slotIndex: number,
): GameState {
  // Determine how many fate cards to reveal (some locations reveal 3 instead of 2)
  const revealCount = getActionAtSlot(state, actingPlayerId, slotIndex)?.value ?? 2;

  const targetPlayer = state.players[targetPlayerIndex];

  // Reshuffle fate discard into deck if needed
  let s = state;
  let deck = targetPlayer.fateDeckInstIds;
  if (deck.length === 0) {
    const reshuffled = shuffle([...targetPlayer.fateDiscardInstIds]);
    s = updatePlayer(s, targetPlayer.id, {
      fateDeckInstIds: reshuffled,
      fateDiscardInstIds: [],
    });
    deck = reshuffled;
    s = addLog(s, 'Mazo de Destino barajado.');
  }

  let revealedCards = getPlayer(s, targetPlayer.id).fateDeckInstIds.slice(0, revealCount);
  s = updatePlayer(s, targetPlayer.id, {
    fateDeckInstIds: getPlayer(s, targetPlayer.id).fateDeckInstIds.slice(revealCount),
  });
  // Run ON_FATE_REVEAL on each revealed card (e.g. Peter Pan auto-places at hangman)
  for (const revId of [...revealedCards]) {
    s = runEffects(s, revId, 'ON_FATE_REVEAL', { actingPlayerId, cardInstId: revId });
  }
  // Separate auto-placed cards from those still needing a choice
  const autoPlayedInstIds = revealedCards.filter(id => !!s.allCards[id]?.locationId);
  revealedCards = revealedCards.filter(id => !s.allCards[id]?.locationId);
  s = { ...s, usedActionSlotIndices: [...s.usedActionSlotIndices, slotIndex] };

  // Forma de Dragón: si el objetivo tiene dragonActive, gana 3 de Poder ahora
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

  // Discard the unchosen card(s)
  const discarded = revealedInstIds.filter(id => id !== chosenInstId);
  let s = updatePlayer(state, targetPlayer.id, {
    fateDiscardInstIds: [...targetPlayer.fateDiscardInstIds, ...discarded],
  });
  s = { ...s, pendingFate: undefined };

  const card = s.allCards[chosenInstId];
  if (!card) return s;

  // Place hero in target's kingdom
  if (card.cardType === CardType.HERO) {
    const targetLocCheck = getPlayer(s, targetPlayer.id).locationStates[targetLocationId];

    // Check for hero-blocking effects (e.g. Fuego Verde)
    const heroBlocked = targetLocCheck.villainCardInstIds.some(id =>
      s.allCards[id]?.effectIds.some(effId => getEffectDef(effId)?.blocksHeroPlay),
    );
    if (heroBlocked) {
      s = updatePlayer(s, targetPlayer.id, {
        fateDiscardInstIds: [...getPlayer(s, targetPlayer.id).fateDiscardInstIds, chosenInstId],
      });
      return addLog(s, `${card.name} no puede jugarse aquí (ubicación bloqueada).`);
    }

    // Check hero min strength requirement (e.g. Selva de Mortales Espinos curse)
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

    const locState = getPlayer(s, targetPlayer.id).locationStates[targetLocationId];
    s = updateLocationState(s, targetPlayer.id, targetLocationId, {
      heroCardInstIds: [...locState.heroCardInstIds, chosenInstId],
    });
    s = updateCard(s, chosenInstId, { locationId: targetLocationId });
    s = addLog(s, `${card.name} juegado en el Reino de ${targetPlayer.name}.`);

    // Fire ON_HERO_PLAYED_HERE on all villain cards at that location
    const locAfterHero = getPlayer(s, targetPlayer.id).locationStates[targetLocationId];
    for (const cId of [...locAfterHero.villainCardInstIds]) {
      s = runEffects(s, cId, 'ON_HERO_PLAYED_HERE', {
        actingPlayerId,
        cardInstId: cId,
        targetCardInstId: chosenInstId,
        targetLocationId,
      });
    }
  } else {
    // Effect/item fate cards: place at location or discard after executing
    const locState = getPlayer(s, targetPlayer.id).locationStates[targetLocationId];
    if (card.cardType === CardType.ITEM) {
      s = updateLocationState(s, targetPlayer.id, targetLocationId, {
        villainCardInstIds: [...locState.villainCardInstIds, chosenInstId],
      });
      s = updateCard(s, chosenInstId, { locationId: targetLocationId });
    } else {
      // Effect: place temporarily then run and discard
      s = updateCard(s, chosenInstId, { locationId: targetLocationId });
    }
    s = addLog(s, `${card.name} jugado contra ${targetPlayer.name}.`);
  }

  // Run ON_PLAY effects
  s = runEffects(s, chosenInstId, 'ON_PLAY', {
    actingPlayerId,
    cardInstId: chosenInstId,
    targetLocationId,
    ...ctx,
  });

  // Discard effect card immediately after playing
  if (card.cardType === CardType.EFFECT) {
    s = discardCardFromKingdom(s, chosenInstId);
  }

  return checkWin(s);
}

// ─── DISCARD FROM HAND ────────────────────────────────────────────────────────

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

// ─── DRAW CARDS ───────────────────────────────────────────────────────────────

export function drawCards(state: GameState, playerId: PlayerId): GameState {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const needed = plugin.handSize - player.handInstIds.length;
  if (needed <= 0) return endTurn(state);

  let s = state;
  let deck = [...getPlayer(s, playerId).villainDeckInstIds];

  // Reshuffle if needed
  if (deck.length < needed) {
    const reshuffled = shuffle([...getPlayer(s, playerId).villainDiscardInstIds]);
    deck = [...deck, ...reshuffled];
    s = updatePlayer(s, playerId, { villainDiscardInstIds: [] });
    s = addLog(s, `${player.name} baraja su pila de descartes.`);
  }

  const drawn = deck.splice(0, needed);
  s = updatePlayer(s, playerId, {
    handInstIds: [...getPlayer(s, playerId).handInstIds, ...drawn],
    villainDeckInstIds: deck,
  });
  s = addLog(s, `${getPlayer(s, playerId).name} roba ${drawn.length} carta(s).`);
  return endTurn(s);
}

// ─── END TURN ─────────────────────────────────────────────────────────────────

export function endActivatePhase(state: GameState): GameState {
  return { ...state, turnPhase: TurnPhase.DRAW };
}

export function endTurn(state: GameState): GameState {
  // Reset per-turn strength bonuses for the player whose turn is ending
  const endingPlayerId = state.players[state.currentPlayerIndex].id;
  let s = state;
  for (const [instId, card] of Object.entries(s.allCards)) {
    if (card.ownerId === endingPlayerId && (card.bonusThisTurn ?? 0) !== 0) {
      s = updateCard(s, instId, { bonusThisTurn: 0 });
    }
  }

  const nextIndex = (s.currentPlayerIndex + 1) % s.players.length;
  const round =
    nextIndex === 0 ? s.roundNumber + 1 : s.roundNumber;
  s = {
    ...s,
    currentPlayerIndex: nextIndex,
    turnPhase: TurnPhase.MOVE,
    usedActionSlotIndices: [],
    roundNumber: round,
  };
  s = addLog(s, `--- Turno de ${s.players[nextIndex].name} ---`);
  s = checkWin(s);
  return s;
}

// ─── RESOLVE CUERVO ──────────────────────────────────────────────────────────

export function resolveCuervo(
  state: GameState,
  action: ActionType,
  params: {
    targetLocationId?: LocationId;
    cardInstId?: CardInstId;
    targetCardInstId?: CardInstId;
    allyInstIds?: CardInstId[];
    cardInstIds?: CardInstId[];
    amountOverride?: number;
  } = {},
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
      const heroLocId = hero.locationId!;
      for (const allyId of params.allyInstIds) {
        const heroLoc = getPlayer(s, playerId).locationStates[heroLocId];
        s = updateLocationState(s, playerId, heroLocId, {
          villainCardInstIds: heroLoc.villainCardInstIds.filter(id => id !== allyId),
        });
        s = updatePlayer(s, playerId, {
          villainDiscardInstIds: [...getPlayer(s, playerId).villainDiscardInstIds, allyId],
        });
        s = updateCard(s, allyId, { locationId: undefined });
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

// ─── RESOLVE DEMOSLES ─────────────────────────────────────────────────────────

export function resolveDemosles(
  state: GameState,
  discardIds: CardInstId[],
  orderedKeepIds: CardInstId[],
): GameState {
  if (!state.pendingDemosles) return state;
  const { playerId } = state.pendingDemosles;
  let s: GameState = { ...state, pendingDemosles: undefined };
  if (discardIds.length > 0) {
    s = updatePlayer(s, playerId, {
      fateDiscardInstIds: [...getPlayer(s, playerId).fateDiscardInstIds, ...discardIds],
    });
  }
  if (orderedKeepIds.length > 0) {
    s = updatePlayer(s, playerId, {
      fateDeckInstIds: [...orderedKeepIds, ...getPlayer(s, playerId).fateDeckInstIds],
    });
  }
  return addLog(s, `Démosles un susto: ${discardIds.length} descartada(s), ${orderedKeepIds.length} devuelta(s).`);
}

// ─── RESOLVE CONDITION ────────────────────────────────────────────────────────

export function resolveCondition(
  state: GameState,
  condInstId: CardInstId | null,
  ctx: {
    targetCardInstId?: CardInstId;
    allyInstId?: CardInstId;
    targetLocationId?: LocationId;
    playHero?: boolean;
    discardInstIds?: CardInstId[];
  } = {},
): GameState {
  if (!state.pendingCondition) return state;
  const { reactingPlayerId } = state.pendingCondition;
  let s: GameState = { ...state, pendingCondition: undefined };

  if (condInstId === null) {
    return addLog(s, 'Condición ignorada.');
  }

  const condCard = s.allCards[condInstId];
  if (!condCard) return s;
  const defId = condCard.defId;

  s = updatePlayer(s, reactingPlayerId, {
    handInstIds: getPlayer(s, reactingPlayerId).handInstIds.filter(id => id !== condInstId),
    villainDiscardInstIds: [...getPlayer(s, reactingPlayerId).villainDiscardInstIds, condInstId],
  });
  s = addLog(s, `${getPlayer(s, reactingPlayerId).name} juega ${condCard.name}.`);

  if (defId.includes('malicia')) {
    if (ctx.targetCardInstId) {
      const heroStr = getEffectiveStrength(s, ctx.targetCardInstId);
      const heroName = s.allCards[ctx.targetCardInstId]?.name ?? '?';
      if (heroStr <= 4) {
        s = discardCardFromKingdom(s, ctx.targetCardInstId);
        s = addLog(s, `Malicia: ${heroName} (Fuerza ${heroStr}) derrotado.`);
      }
    }

  } else if (defId.includes('tirania')) {
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

  } else if (defId.includes('obsesion')) {
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

  } else if (defId.includes('perspicaz')) {
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
  }

  return checkWin(s);
}

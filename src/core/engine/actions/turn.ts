import { TurnPhase } from '../../types';
import type { GameState, PlayerId, LocationId } from '../../types';
import { getPlugin } from '../../villains/registry';
import { runEffects } from '../EffectEngine';
import { shuffle } from '../../utils/shuffle';
import {
  getPlayer, updatePlayer, updateCard, addLog, checkWin, moveAttachedItems,
} from '../stateHelpers';

export function movePawn(
  state: GameState,
  playerId: PlayerId,
  locationId: LocationId,
): GameState {
  let s = updatePlayer(state, playerId, { pawnLocationId: locationId, skipNextMove: false, dragonActive: false });
  s = addLog(s, `${getPlayer(s, playerId).name} se mueve a ${locationId}.`);
  const arrivedLoc = getPlayer(s, playerId).locationStates[locationId];
  for (const cardId of [...arrivedLoc.villainCardInstIds, ...arrivedLoc.heroCardInstIds]) {
    s = runEffects(s, cardId, 'ON_PAWN_ARRIVES', {
      actingPlayerId: playerId, cardInstId: cardId, targetLocationId: locationId,
    });
  }
  s = { ...s, turnPhase: TurnPhase.ACTIVATE, usedActionSlotIndices: [] };
  return checkWin(s);
}

/** Mueve el Cuervo a cualquier ubicación y ejecuta una acción allí (antes de mover el peón). */
export function activateRaven(
  state: GameState,
  playerId: PlayerId,
  ravenInstId: string,
  targetLocationId: LocationId,
): GameState {
  let s = state;
  const player = getPlayer(s, playerId);
  if (player.ravenUsedThisTurn) return s; // ya usado este turno
  const curLoc = s.allCards[ravenInstId]?.locationId;
  if (!curLoc) return s;

  // Mover el Cuervo físicamente al destino.
  const fromLs = player.locationStates[curLoc];
  s = { ...s, players: s.players.map(p =>
    p.id !== playerId ? p : { ...p, locationStates: { ...p.locationStates,
      [curLoc]: { ...fromLs, villainCardInstIds: fromLs.villainCardInstIds.filter(id => id !== ravenInstId) },
      [targetLocationId]: { ...p.locationStates[targetLocationId],
        villainCardInstIds: [...p.locationStates[targetLocationId].villainCardInstIds, ravenInstId] },
    } },
  )};
  s = { ...s, allCards: { ...s.allCards, [ravenInstId]: { ...s.allCards[ravenInstId], locationId: targetLocationId } } };
  // Los Objetos adjuntos viajan con su portador.
  s = moveAttachedItems(s, ravenInstId, targetLocationId);
  s = updatePlayer(s, playerId, { ravenUsedThisTurn: true });
  // Disparar el efecto ACTIVATED → abre pendingCuervo para elegir acción.
  s = runEffects(s, ravenInstId, 'ACTIVATED', { actingPlayerId: playerId, cardInstId: ravenInstId, targetLocationId });
  s = addLog(s, `El Cuervo vuela a ${targetLocationId}.`);
  return s;
}

/** Mueve el Sheriff a cualquier ubicación y da +1 Poder si hay Héroes allí (antes de mover el peón). */
export function activateSherif(
  state: GameState,
  playerId: PlayerId,
  sherifInstId: string,
  targetLocationId: LocationId,
): GameState {
  let s = state;
  const player = getPlayer(s, playerId);
  if (player.sherifUsedThisTurn) return s;
  const curLoc = s.allCards[sherifInstId]?.locationId;
  if (!curLoc || curLoc === targetLocationId) return s;
  // La carta permite mover al Sheriff a CUALQUIER ubicación (no solo adyacentes).

  // Mover el Sheriff físicamente al destino.
  const fromLs = player.locationStates[curLoc];
  s = { ...s, players: s.players.map(p =>
    p.id !== playerId ? p : { ...p, locationStates: { ...p.locationStates,
      [curLoc]: { ...fromLs, villainCardInstIds: fromLs.villainCardInstIds.filter(id => id !== sherifInstId) },
      [targetLocationId]: { ...p.locationStates[targetLocationId],
        villainCardInstIds: [...p.locationStates[targetLocationId].villainCardInstIds, sherifInstId] },
    } },
  )};
  s = { ...s, allCards: { ...s.allCards, [sherifInstId]: { ...s.allCards[sherifInstId], locationId: targetLocationId } } };
  // Los Objetos adjuntos viajan con su portador.
  s = moveAttachedItems(s, sherifInstId, targetLocationId);
  s = updatePlayer(s, playerId, { sherifUsedThisTurn: true });
  s = addLog(s, `El Sheriff se mueve a ${targetLocationId}.`);

  // Si hay Héroes en el destino, +1 Poder al Príncipe Juan
  const destLs = getPlayer(s, playerId).locationStates[targetLocationId];
  if (destLs.heroCardInstIds.length > 0) {
    s = updatePlayer(s, playerId, { power: getPlayer(s, playerId).power + 1 });
    s = addLog(s, 'El Sheriff detecta Héroes: el Príncipe Juan recibe 1 Moneda de Poder.');
  }
  return s;
}

export function skipMove(state: GameState, playerId: PlayerId): GameState {
  let s = updatePlayer(state, playerId, { skipNextMove: false, dragonActive: false });
  s = addLog(s, `${getPlayer(s, playerId).name} permanece en ${getPlayer(s, playerId).pawnLocationId}.`);
  s = { ...s, turnPhase: TurnPhase.ACTIVATE, usedActionSlotIndices: [] };
  return checkWin(s);
}

export function drawCards(state: GameState, playerId: PlayerId): GameState {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const needed = plugin.handSize - player.handInstIds.length;
  if (needed <= 0) return endTurn(state);

  let s = state;
  let deck = [...getPlayer(s, playerId).villainDeckInstIds];

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

export function endActivatePhase(state: GameState): GameState {
  return checkWin({ ...state, turnPhase: TurnPhase.DRAW });
}

export function revertToActivate(state: GameState): GameState {
  if (state.turnPhase !== TurnPhase.DRAW) return state;
  return { ...state, turnPhase: TurnPhase.ACTIVATE };
}

export function endTurn(state: GameState): GameState {
  const endingPlayerId = state.players[state.currentPlayerIndex].id;
  let s = state;
  for (const [instId, card] of Object.entries(s.allCards)) {
    if (card.ownerId === endingPlayerId && (card.bonusThisTurn ?? 0) !== 0) {
      s = updateCard(s, instId, { bonusThisTurn: 0 });
    }
  }

  const nextIndex = (s.currentPlayerIndex + 1) % s.players.length;
  const round = nextIndex === 0 ? s.roundNumber + 1 : s.roundNumber;
  s = {
    ...s,
    currentPlayerIndex: nextIndex,
    turnPhase: TurnPhase.MOVE,
    usedActionSlotIndices: [],
    roundNumber: round,
  };
  // Resetear flags del Cuervo y el Sheriff para el nuevo turno.
  s = updatePlayer(s, s.players[nextIndex].id, { ravenUsedThisTurn: false, sherifUsedThisTurn: false });
  s = addLog(s, `--- Turno de ${s.players[nextIndex].name} ---`);
  s = checkWin(s);
  const nextPlayer = s.players[nextIndex];
  for (const locState of Object.values(nextPlayer.locationStates)) {
    for (const cId of [...locState.villainCardInstIds, ...locState.heroCardInstIds]) {
      s = runEffects(s, cId, 'AT_TURN_START', {
        actingPlayerId: nextPlayer.id, cardInstId: cId,
      });
    }
  }
  return s;
}

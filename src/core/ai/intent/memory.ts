// ─── Memoria de partida + lectura avanzada del rival ──────────────────────────────
// El motor es puro/funcional (GameState inmutable) — no hay "memoria" mutable entre turnos.
// En su lugar, esto DERIVA la memoria de partida directamente de GameState (que ya acumula todo
// lo relevante: descartes, mazos, tablero) en una forma estructurada y barata de consultar, en
// vez de que cada intención tenga que rehacer el mismo escaneo por su cuenta.
import { CardType } from '../../types';
import type { GameState, PlayerId, PlayerState } from '../../types';
import { getPlayer } from '../../engine/stateHelpers';
import type { MemorySummary, OppThreatSummary } from './types';

function countOwnedVillainCards(state: GameState, playerId: PlayerId): number {
  let n = 0;
  for (const c of Object.values(state.allCards)) {
    if (c.ownerId === playerId && c.deck === 'VILLAIN') n++;
  }
  return n;
}

/** Héroes vencidos por `player` (en su propio reino) — el trofeo permanente ya usado en scoring.
 *  NOTA: héroes cuya habilidad los devuelve al mazo (no al descarte) no se cuentan aquí; es una
 *  aproximación deliberada (el propio motor de reglas es la fuente de verdad para esos casos). */
function heroesEliminated(state: GameState, player: PlayerState): number {
  return player.fateDiscardInstIds.filter(id => state.allCards[id]?.cardType === CardType.HERO).length;
}

export function buildMemorySummary(state: GameState, playerId: PlayerId, opponent: PlayerState | null): MemorySummary {
  const player = getPlayer(state, playerId);
  const totalMine = countOwnedVillainCards(state, playerId);
  return {
    heroesEliminatedByMe: heroesEliminated(state, player),
    heroesEliminatedByOpp: opponent ? heroesEliminated(state, opponent) : 0,
    cardsPlayedByMe: Math.max(0, totalMine - player.villainDeckInstIds.length - player.handInstIds.length),
    cardsPlayedByOpp: opponent
      ? Math.max(0, countOwnedVillainCards(state, opponent.id) - opponent.villainDeckInstIds.length - opponent.handInstIds.length)
      : 0,
  };
}

/** Ritmo de progreso asumido (%/turno) cuando no hay histórico real que medir — calibrado sobre
 *  la duración típica observada en el simulador (partidas de ~15-25 rondas). Es deliberadamente
 *  una aproximación gruesa, NO una búsqueda: sirve para ordenar urgencia, no para predecir con
 *  precisión — ver decisión de diseño en el plan (evitar minimax multi-turno costoso). */
const ASSUMED_PROGRESS_PER_TURN = 8;

export function buildOppThreatSummary(state: GameState, opponent: PlayerState | null, oppProgress: number): OppThreatSummary {
  if (!opponent) return { turnsToWinEstimate: null, alliesAvailableStrength: 0, keyCardsInPlay: [] };

  const alliesAvailableStrength = Object.values(opponent.locationStates)
    .flatMap(ls => ls.villainCardInstIds)
    .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
    .reduce((sum, id) => sum + (state.allCards[id]?.baseStrength ?? 0) + (state.allCards[id]?.strengthModifier ?? 0), 0);

  const keyCardsInPlay = Object.values(opponent.locationStates)
    .flatMap(ls => ls.villainCardInstIds)
    .map(id => state.allCards[id])
    .filter(c => c && (c.cardType === CardType.CURSE || c.grantsActionSlot))
    .map(c => c!.name);

  const remaining = Math.max(0, 100 - oppProgress);
  const turnsToWinEstimate = remaining === 0 ? 0 : Math.ceil(remaining / ASSUMED_PROGRESS_PER_TURN);

  return { turnsToWinEstimate, alliesAvailableStrength, keyCardsInPlay };
}

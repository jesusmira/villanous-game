// ─── Helpers de IA específicos de Garfio, compartidos entre core/ai/* y este plugin ──
// Antes vivían duplicados (con pequeñas variantes) en AIPlayer.ts, evaluate.ts y scoring.ts.
import type { GameState, PlayerState, CardInstId, PlayerId, LocationId } from '../../types';
import { CardDefId, EffectId } from '../effectIds';
import { HookLocationId } from './cards';

/**
 * Resolución de "Démosles un susto" para la IA: descarta ambas cartas reveladas para cavar
 * el mazo 2 posiciones hacia Peter Pan. Si Peter Pan estaba entre las reveladas, el propio
 * efecto (ON_FATE_REVEAL) ya lo jugó de inmediato en el Árbol del Ahorcado antes de llegar
 * aquí — nunca aparece en `topCardIds`, así que no hace falta contemplarlo en esta resolución.
 */
export function chooseDemoslesResolution(
  _state: GameState,
  pending: { playerId: PlayerId; topCardIds: CardInstId[] },
): { discardIds: CardInstId[]; orderedKeepIds: CardInstId[] } {
  return { discardIds: pending.topCardIds, orderedKeepIds: [] };
}

/** True si el héroe tiene un Objeto con Burla adjunto (bloqueante prioritario: hay que vencerlo primero). */
export function heroHasBurla(state: GameState, heroId: CardInstId): boolean {
  return (state.allCards[heroId]?.attachedItemInstIds ?? []).some(
    itemId => state.allCards[itemId]?.effectIds.includes(EffectId.BURLA_ATTACH),
  );
}

/** Busca a Peter Pan en el reino de `player`; devuelve su instId y ubicación si está presente. */
export function findPeterPan(
  state: GameState,
  player: PlayerState,
): { id: CardInstId; locId: LocationId } | undefined {
  for (const [locId, ls] of Object.entries(player.locationStates)) {
    const id = ls.heroCardInstIds.find(hid => state.allCards[hid]?.defId === CardDefId.HOOK_PETER_PAN);
    if (id) return { id, locId };
  }
  return undefined;
}

/** True si Peter Pan está en el Jolly Roger (listo para ser vencido) en el reino de `player`. */
export function isPeterPanAtJollyRoger(state: GameState, player: PlayerState): boolean {
  return player.locationStates[HookLocationId.JOLLY_ROGER]?.heroCardInstIds.some(
    id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN,
  ) ?? false;
}

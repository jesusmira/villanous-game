// ─── Historial de partidas: extracción de features (pura) ───────────────────
// Reduce un GameState completo (grande, con allCards denormalizado) a los pocos
// números que interesan para reconstruir "cómo iba la partida" en cada acción,
// sin tener que volcar el estado entero al guardar el historial.
import { CardType } from '../types';
import type { GameState, PlayerId } from '../types';
import { getPlugin } from '../villains/registry';
import { getPlayer, getEffectiveStrength } from '../engine/stateHelpers';
import { getWinProgress } from '../ai/evaluate';
import type { PlayerSnapshot } from './types';

export function snapshotPlayer(state: GameState, playerId: PlayerId): PlayerSnapshot {
  const p = getPlayer(state, playerId);
  const plugin = getPlugin(p.villainId);

  const allyStrength = plugin.locations.reduce((sum, l) => {
    const ls = p.locationStates[l.id];
    return sum + (ls?.villainCardInstIds ?? []).reduce((t, id) => {
      const c = state.allCards[id];
      return c?.cardType === CardType.ALLY ? t + getEffectiveStrength(state, id) : t;
    }, 0);
  }, 0);

  const heroesPresent = plugin.locations.reduce(
    (n, l) => n + (p.locationStates[l.id]?.heroCardInstIds.length ?? 0), 0,
  );

  return {
    power: p.power,
    handSize: p.handInstIds.length,
    winProgress: getWinProgress(state, playerId),
    pawnLocationId: p.pawnLocationId,
    allyStrength,
    heroesPresent,
  };
}

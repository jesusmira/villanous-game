// ─── Historial de partidas: extracción de features (pura) ───────────────────
// Reduce un GameState completo (grande, con allCards denormalizado) a los pocos
// números que interesan para reconstruir "cómo iba la partida" en cada acción,
// sin tener que volcar el estado entero al guardar el historial.
import { CardType } from '../types';
import type { GameState, PlayerId, CardInstId } from '../types';
import { getPlugin } from '../villains/registry';
import { getPlayer, getEffectiveStrength } from '../engine/stateHelpers';
import { getWinProgress } from '../ai/intent/context';
import type { PlayerSnapshot, PlayerCardSnapshot, CardSummary } from './types';

function summarizeCards(state: GameState, ids: CardInstId[]): CardSummary[] {
  return ids.map(id => {
    const c = state.allCards[id];
    return {
      instId: id,
      defId: c?.defId ?? '',
      name: c?.name ?? '?',
      cardType: c?.cardType ?? '?',
      strength: c?.baseStrength !== undefined ? getEffectiveStrength(state, id) : undefined,
    };
  });
}

/** Cartas completas (mano + tablero, por nombre) de un jugador — ver PlayerCardSnapshot. */
export function snapshotPlayerCards(state: GameState, playerId: PlayerId): PlayerCardSnapshot {
  const p = getPlayer(state, playerId);
  const plugin = getPlugin(p.villainId);
  const locations: PlayerCardSnapshot['locations'] = {};
  for (const l of plugin.locations) {
    const ls = p.locationStates[l.id];
    if (!ls) continue;
    const allyIds = ls.villainCardInstIds.filter(id => state.allCards[id]?.cardType === CardType.ALLY);
    const itemIds = ls.villainCardInstIds.filter(id => state.allCards[id]?.cardType === CardType.ITEM);
    locations[l.id] = {
      allies: summarizeCards(state, allyIds),
      items: summarizeCards(state, itemIds),
      heroes: summarizeCards(state, ls.heroCardInstIds),
    };
  }
  return { hand: summarizeCards(state, p.handInstIds), locations };
}

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

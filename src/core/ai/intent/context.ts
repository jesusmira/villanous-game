// ─── Construcción del contexto de IA ──────────────────────────────────────────────
// Reduce un GameState completo a la foto estructurada que consumen intenciones y
// puntuador de acciones: progreso propio/rival, ubicaciones y acciones disponibles,
// héroes/bloqueos, recursos y cartas muertas en mano.
import { CardType } from '../../types';
import type { GameState, PlayerId, PlayerState, LocationId } from '../../types';
import { getPlugin } from '../../villains/registry';
import { CardDefId } from '../../villains/effectIds';
import { getPlayer, getEffectiveStrength } from '../../engine/stateHelpers';
import { getAvailableSlotIndices } from '../../engine/slotHelpers';
import type { OpponentProfile } from '../opponentModel';
import type { AIContext, LocationSnapshot } from './types';

function buildLocationSnapshots(state: GameState, player: PlayerState): LocationSnapshot[] {
  const plugin = getPlugin(player.villainId);
  return plugin.locations.map(loc => {
    const ls = player.locationStates[loc.id];
    const availableSlotIndices = player.pawnLocationId === loc.id
      ? getAvailableSlotIndices(state, player.id, loc.id)
      : [];
    return {
      id: loc.id,
      isLocked: ls.isLocked,
      availableSlotIndices,
      heroCardInstIds: ls.heroCardInstIds,
      villainCardInstIds: ls.villainCardInstIds,
      heroStrength: ls.heroCardInstIds.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0),
      allyStrength: ls.villainCardInstIds
        .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
        .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0),
    };
  });
}

/**
 * Progreso 0-100 hacia la condición de victoria del villano. Sigue la cadena REAL de cada
 * objetivo (no es una heurística de puntuación: son los hitos objetivos que exige cada tablero).
 */
export function getWinProgress(state: GameState, playerId: PlayerId): number {
  const p = getPlayer(state, playerId);
  const plugin = getPlugin(p.villainId);
  if (plugin.checkWinCondition(state, playerId)) return 100;

  switch (p.villainId) {
    case 'hook': {
      const steps = p.completedObjectiveSteps ?? [];
      if (steps.includes('PETER_PAN_DEFEATED_AT_JOLLYROGER')) return 100;
      const ppEntry = Object.entries(p.locationStates).find(([, ls]) =>
        ls.heroCardInstIds.some(id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN),
      );
      if (!ppEntry) return steps.includes('HANGMAN_UNLOCKED') ? 25 : 10;
      const ppLocId = ppEntry[0];
      if (ppLocId === 'jollyroger') return 85;
      if (ppLocId === 'skullrock') return 65;
      return 45;
    }
    case 'jhon': {
      return Math.min(100, (p.power / 20) * 100);
    }
    case 'maleficent': {
      const totalLocs = plugin.locations.length;
      const locsWithCurse = plugin.locations.filter(loc => {
        const ls = p.locationStates[loc.id];
        return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
      }).length;
      return (locsWithCurse / totalLocs) * 100;
    }
    default:
      return 0;
  }
}

/**
 * Cartas de mano que ya no aportan nada en lo que queda de partida: las que declara el plugin
 * (VillainPlugin.deadCards) + regla genérica de Condiciones duplicadas (una copia en mano basta;
 * las Condiciones no se juegan como acción, solo disparan — la segunda copia solo atasca).
 */
export function getDeadHandCards(ctxState: GameState, playerId: PlayerId): string[] {
  const p = getPlayer(ctxState, playerId);
  const plugin = getPlugin(p.villainId);
  const dead = new Set(plugin.deadCards?.(ctxState, p) ?? []);
  const seenCondNames = new Set<string>();
  for (const id of p.handInstIds) {
    const c = ctxState.allCards[id];
    if (c?.cardType !== CardType.CONDITION) continue;
    if (seenCondNames.has(c.name)) dead.add(id);
    else seenCondNames.add(c.name);
  }
  return [...dead];
}

export function buildAIContext(state: GameState, playerId: PlayerId, profile?: OpponentProfile): AIContext {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const opponent = state.players.find(pl => pl.id !== playerId) ?? null;
  const oppPlugin = opponent ? getPlugin(opponent.villainId) : null;

  return {
    state,
    playerId,
    player,
    plugin,
    opponent,
    oppPlugin,
    profile,
    ownProgress: getWinProgress(state, playerId),
    oppProgress: opponent ? getWinProgress(state, opponent.id) : 0,
    locations: buildLocationSnapshots(state, player),
    oppLocations: opponent ? buildLocationSnapshots(state, opponent) : [],
    deadHandCardIds: getDeadHandCards(state, playerId),
  };
}

/** Ubicación de una LocationSnapshot por id (helper de conveniencia para intenciones). */
export function findLoc(locs: LocationSnapshot[], id: LocationId): LocationSnapshot | undefined {
  return locs.find(l => l.id === id);
}

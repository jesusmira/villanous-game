// ─── Heurística de IA del Príncipe Juan, registrada como plugin.aiHeuristics ────
// Extraído de core/ai/evaluate.ts. A diferencia de Maléfica/Garfio, el Príncipe Juan
// IGNORA el score de poder genérico: acumular Monedas sin tope ES su condición de victoria,
// así que el "rendimiento decreciente" del genérico no aplica.
import { getPlugin } from '../registry';
import { CardDefId } from '../effectIds';
import type { GameState, PlayerState } from '../../types';

// Pesos de la heurística: el Príncipe Juan acumula Poder SIN tope (su condición de
// victoria son 20 Monedas), así que aquí no hay rendimientos decrecientes.
const WEIGHTS = {
  POWER: 1.8,                  // cada moneda vale mucho: es el objetivo de victoria
  HAND_CARD: 0.2,               // opciones en mano
  ROBIN_HOOD_IN_KINGDOM: -20,   // Robin Hood reduce las ganancias de Poder: muy perjudicial
  HERO_OUTSIDE_PRISON: -4,      // por cada héroe que bloquea ranuras fuera de La Prisión
};

export function scoreState(state: GameState, player: PlayerState): number {
  const plugin = getPlugin(player.villainId);
  let v = player.power * WEIGHTS.POWER;
  v += player.handInstIds.length * WEIGHTS.HAND_CARD;

  // Robin Hood en el reino es muy perjudicial: penalizar
  const robinInKingdom = plugin.locations.some(l =>
    player.locationStates[l.id].heroCardInstIds.some(id =>
      state.allCards[id]?.defId === CardDefId.JHON_ROBIN_HOOD,
    ),
  );
  if (robinInKingdom) v += WEIGHTS.ROBIN_HOOD_IN_KINGDOM;

  // Héroes en la Prisión no bloquean ranuras: menos urgente vencerlos
  const heroesOutsidePrison = plugin.locations
    .filter(l => !l.heroesNeverCoverSlots)
    .reduce((n, l) => n + player.locationStates[l.id].heroCardInstIds.length, 0);
  v += heroesOutsidePrison * WEIGHTS.HERO_OUTSIDE_PRISON;

  return v;
}

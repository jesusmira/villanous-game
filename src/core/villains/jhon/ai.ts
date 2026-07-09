// ─── Heurística de IA del Príncipe Juan, registrada como plugin.aiHeuristics ────
// Extraído de core/ai/evaluate.ts. A diferencia de Maléfica/Garfio, el Príncipe Juan
// IGNORA el score de poder genérico: acumular Monedas sin tope ES su condición de victoria,
// así que el "rendimiento decreciente" del genérico no aplica.
import { CardType } from '../../types';
import type { GameState, PlayerState, LocationState } from '../../types';
import { getPlugin } from '../registry';
import { CardDefId } from '../effectIds';
import { getEffectiveStrength } from '../../engine/stateHelpers';

function locHasCurse(state: GameState, ls: LocationState): boolean {
  return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
}

// Pesos de la heurística: el Príncipe Juan acumula Poder SIN tope (su condición de
// victoria son 20 Monedas), así que aquí no hay rendimientos decrecientes.
const WEIGHTS = {
  POWER: 2.0,                   // cada moneda vale mucho: es el objetivo de victoria — AUMENTADO
  HAND_CARD: 0.3,              // opciones en mano — AUMENTADO
  ROBIN_HOOD_IN_KINGDOM: -35,   // Robin Hood reduce las ganancias de Poder: muy perjudicial — AUMENTADO (MÁS URGENTE ELIMINARLO)
  HERO_OUTSIDE_PRISON: -8,      // por cada héroe que bloquea ranuras fuera de La Prisión — AUMENTADO
  HERO_STRONG_BLOCKING: -15,    // NUEVO: penalización por héroe F4+ sin vencer

  // FASE 3: Urgencia de victoria según proximidad a 20 poder
  POWER_ALMOST_WIN: 120,        // 18+ poder: victoria muy cercana — AUMENTADO
  POWER_NEAR_WIN: 60,           // 14-17 poder: ganando — AUMENTADO
  POWER_ADVANTAGE: 25,          // 10-13 poder: ventaja clara — AUMENTADO

  // ── Conciencia del avance de Maléfica (cuando es la rival) ──
  MALEFICENT_CURSE_IN_PLAY: -28, // NUEVO: cada maldición amenaza mucho
  MALEFICENT_CURSE_FINAL: -50,   // NUEVO: 3+ maldiciones = casi derrota
};

export function scoreState(state: GameState, player: PlayerState): number {
  const plugin = getPlugin(player.villainId);
  let v = player.power * WEIGHTS.POWER;
  v += player.handInstIds.length * WEIGHTS.HAND_CARD;

  // FASE 3: Urgencia escalada según proximidad a 20 poder
  if (player.power >= 18) {
    v += WEIGHTS.POWER_ALMOST_WIN;
  } else if (player.power >= 14) {
    v += WEIGHTS.POWER_NEAR_WIN;
  } else if (player.power >= 10) {
    v += WEIGHTS.POWER_ADVANTAGE;
  }

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

  // NUEVO: penalizar héroes F4+ que bloquean sin poder vencer
  for (const l of plugin.locations) {
    if (l.heroesNeverCoverSlots) continue;
    const ls = player.locationStates[l.id];
    const strongHeroes = ls.heroCardInstIds.filter(id => getEffectiveStrength(state, id) >= 4);
    const allyStr = ls.villainCardInstIds
      .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
      .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
    for (const heroId of strongHeroes) {
      if (allyStr < getEffectiveStrength(state, heroId)) {
        v += WEIGHTS.HERO_STRONG_BLOCKING;
      }
    }
  }

  // ── Conciencia del avance de Maléfica, si es la rival ──
  const opp = state.players.find(pl => pl.id !== player.id);
  if (opp?.villainId === 'maleficent') {
    const malPlugin = getPlugin(opp.villainId);
    const cursesInPlay = malPlugin.locations.filter(
      l => locHasCurse(state, opp.locationStates[l.id]),
    ).length;
    v += cursesInPlay * WEIGHTS.MALEFICENT_CURSE_IN_PLAY;
    // Si Maléfica tiene 3+ maldiciones, estamos casi perdiendo
    if (cursesInPlay >= 3) {
      v += WEIGHTS.MALEFICENT_CURSE_FINAL;
    }
  }

  return v;
}

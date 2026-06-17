// ─── Heurística de IA de Maléfica, registrada como plugin.aiHeuristics ──────────
// Extraído de core/ai/evaluate.ts (antes vivía como `if (villainId === 'maleficent')`
// repartido en código compartido entre villanos).
import { CardType } from '../../types';
import type { GameState, PlayerState, LocationState } from '../../types';
import { getPlugin, getEffectDef } from '../registry';
import { EffectId } from '../effectIds';
import { getEffectiveStrength } from '../../engine/stateHelpers';
import { findPeterPan } from '../hook/aiHelpers';
import { HookLocationId, HookObjectiveStep } from '../hook/cards';

function locHasCurse(state: GameState, ls: LocationState): boolean {
  return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
}

const WEIGHTS = {
  CURSED_LOCATION: 30,              // por cada ubicación cubierta: es el objetivo de victoria
  CURSE_THREATENED: -12,            // maldición con un héroe encima que podría retirarla
  BLOCKER_ALLY_MATCH: 2,             // progreso de fuerza de aliados contra el héroe bloqueante
  UNCOVERED_READY: 10,               // sin maldición y SIN bloqueante: lista para cubrirse pronto
  // ── Conciencia del avance de Garfio (cuando es el rival) ──
  HOOK_HANGMAN_UNLOCKED: -30,       // Árbol del Ahorcado desbloqueado: Garfio en fase final
  HOOK_PP_IN_KINGDOM: -12,          // Peter Pan ya está en el reino de Garfio
  HOOK_PP_VANQUISHABLE: -20,        // Garfio ya tiene aliados suficientes para vencer a PP
  HOOK_PP_AT_JOLLY_ROGER: -8,       // PP está en su ubicación de victoria
};

// Umbrales de threatUrgency(): cuántas maldiciones en pie disparan cada nivel de urgencia.
const URGENCY_BY_CURSE_COUNT: { min: number; urgency: number }[] = [
  { min: 3, urgency: 7.0 }, // una maldición más = derrota inminente
  { min: 2, urgency: 3.0 },
  { min: 1, urgency: 1.5 },
];

export function scoreState(state: GameState, player: PlayerState, genericPowerScore: number): number {
  const plugin = getPlugin(player.villainId);
  let v = genericPowerScore;

  // ── Cubrir las 4 ubicaciones con maldición: el objetivo de victoria ──
  const covered = plugin.locations.filter(l => locHasCurse(state, player.locationStates[l.id])).length;
  v += covered * WEIGHTS.CURSED_LOCATION;
  // Maldición amenazada = héroe en esa ubicación que puede retirarla.
  // Penaliza fuerte para incentivar vencer en esas ubicaciones de forma urgente.
  for (const l of plugin.locations) {
    const ls = player.locationStates[l.id];
    if (locHasCurse(state, ls) && ls.heroCardInstIds.length > 0) v += WEIGHTS.CURSE_THREATENED;
  }

  // Héroe bloqueando la última ubicación sin maldición (p. ej. Primavera): sin vencerlo no se
  // puede cubrir esa ubicación ni ganar, aunque sobren maldiciones en mano. Recompensa el
  // progreso de juntar aliados ahí para que la IA no los reparta en ubicaciones ya cubiertas.
  // IMPORTANTE: UNCOVERED_READY se aplica también una vez vencido el bloqueante (rama `else`),
  // para que la nota no caiga de golpe justo al vencerlo — si no, vencerlo nunca conviene porque
  // "estar a punto" puntuaría más que "haberlo resuelto".
  for (const l of plugin.locations) {
    const ls = player.locationStates[l.id];
    if (locHasCurse(state, ls)) continue;
    const blockingHero = ls.heroCardInstIds.find(id =>
      state.allCards[id]?.effectIds.some(eid => getEffectDef(eid)?.blocksCursePlay),
    );
    if (blockingHero) {
      const heroStr = getEffectiveStrength(state, blockingHero);
      const allyStr = ls.villainCardInstIds
        .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
        .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
      v += Math.min(allyStr, heroStr) * WEIGHTS.BLOCKER_ALLY_MATCH;
    } else {
      v += WEIGHTS.UNCOVERED_READY;
    }
  }

  // ── Conciencia del avance de Garfio, si es el rival ──
  const opp = state.players.find(pl => pl.id !== player.id);
  if (opp?.villainId === 'hook') {
    const hookPlugin = getPlugin(opp.villainId);
    const hookSteps = opp.completedObjectiveSteps ?? [];
    if (hookSteps.includes(HookObjectiveStep.HANGMAN_UNLOCKED)) v += WEIGHTS.HOOK_HANGMAN_UNLOCKED;
    const pp = findPeterPan(state, opp);
    if (pp) {
      v += WEIGHTS.HOOK_PP_IN_KINGDOM;
      const ppStr = getEffectiveStrength(state, pp.id);
      const locDef = hookPlugin.locations.find(l => l.id === pp.locId);
      const sameAllies = (opp.locationStates[pp.locId]?.villainCardInstIds ?? []).filter(
        id => state.allCards[id]?.cardType === CardType.ALLY,
      );
      const adjAllies = (locDef?.adjacentIds ?? []).flatMap(adjId =>
        (opp.locationStates[adjId]?.villainCardInstIds ?? []).filter(id => {
          const a = state.allCards[id];
          return a?.cardType === CardType.ALLY && a.effectIds.includes(EffectId.PELOTON_ADJ_VANQUISH);
        }),
      );
      const allyStr = [...sameAllies, ...adjAllies].reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
      if (allyStr >= ppStr) v += WEIGHTS.HOOK_PP_VANQUISHABLE;
      if (pp.locId === HookLocationId.JOLLY_ROGER) v += WEIGHTS.HOOK_PP_AT_JOLLY_ROGER;
    }
  }

  return v;
}

/** Cuán urgente es para el rival desbaratar a Maléfica: escala con las maldiciones ya colocadas. */
export function threatUrgency(state: GameState, self: PlayerState): number {
  const plugin = getPlugin(self.villainId);
  const curses = plugin.locations.filter(l => locHasCurse(state, self.locationStates[l.id])).length;
  return URGENCY_BY_CURSE_COUNT.find(t => curses >= t.min)?.urgency ?? 1.0;
}

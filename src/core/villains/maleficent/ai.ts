// ─── Heurística de IA de Maléfica, registrada como plugin.aiHeuristics ──────────
// Extraído de core/ai/evaluate.ts (antes vivía como `if (villainId === 'maleficent')`
// repartido en código compartido entre villanos).
import { CardType } from '../../types';
import type { GameState, PlayerState, LocationState, CardInstId } from '../../types';
import { getPlugin, getEffectDef } from '../registry';
import { EffectId } from '../effectIds';
import { getEffectiveStrength } from '../../engine/stateHelpers';
import { findPeterPan } from '../hook/aiHelpers';
import { HookLocationId, HookObjectiveStep } from '../hook/cards';

function locHasCurse(state: GameState, ls: LocationState): boolean {
  return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
}

const WEIGHTS = {
  CURSED_LOCATION: 35,              // por cada ubicación cubierta: es el objetivo de victoria — AUMENTADO
  CURSE_THREATENED: -18,            // maldición con un héroe encima que podría retirarla — AUMENTADO (MÁS URGENTE VENCER)
  // OJO: gradiente de "estar a punto de vencer al bloqueante" — debe ser bajo, porque al
  // vencer se pierde (junto con los aliados gastados) y si supera al premio de la ubicación
  // liberada (UNCOVERED_READY + maldición jugable) la IA nunca remata.
  BLOCKER_ALLY_MATCH: 1.2,
  UNCOVERED_READY: 14,              // sin maldición y SIN bloqueante: lista para cubrirse pronto — AUMENTADO
  // Sin Maldiciones en mano y con ubicaciones por cubrir, hay que CICLAR la mano para
  // encontrarlas: premio por mano pequeña → incentiva jugar/descartar y robar más al final.
  DIG_FOR_CURSES_PER_SLOT: 2.5,
  // OJO: debe ser MENOR que UNCOVERED_READY, o "estar a punto de vencer al bloqueante"
  // puntuaría más que haberlo vencido y la IA nunca remataría.
  BLOCKER_READY: 6,                 // bono si ya hay aliados suficientes para vencer bloqueante

  // FASE 3: Urgencia de victoria según maldiciones colocadas
  ALL_LOCATIONS_CURSED: 150,        // Las 4 ubicaciones cubiertas: victoria inminente — AUMENTADO
  THREE_CURSED: 70,                 // 3/4 ubicaciones cubiertas: muy cerca — AUMENTADO
  TWO_CURSED: 30,                   // 2/4 ubicaciones cubiertas: buen progreso — AUMENTADO

  // ── Conciencia del avance de Garfio (cuando es el rival) ──
  HOOK_HANGMAN_UNLOCKED: -50,       // Árbol del Ahorcado desbloqueado: Garfio en fase final — AUMENTADO
  HOOK_PP_IN_KINGDOM: -25,          // Peter Pan ya está en el reino de Garfio — AUMENTADO
  HOOK_PP_VANQUISHABLE: -35,        // Garfio ya tiene aliados suficientes para vencer a PP — AUMENTADO
  HOOK_PP_AT_JOLLY_ROGER: -45,      // PP está en su ubicación de victoria — AUMENTADO (CASI GAME OVER)
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

  // FASE 3: Urgencia escalada según maldiciones colocadas
  if (covered === 4) {
    v += WEIGHTS.ALL_LOCATIONS_CURSED; // Victoria inminente
  } else if (covered === 3) {
    v += WEIGHTS.THREE_CURSED; // Una ubicación para ganar
  } else if (covered === 2) {
    v += WEIGHTS.TWO_CURSED; // Buen progreso
  }

  // Maldición amenazada = héroe en esa ubicación que puede retirarla.
  // Penaliza fuerte para incentivar vencer en esas ubicaciones de forma urgente.
  for (const l of plugin.locations) {
    const ls = player.locationStates[l.id];
    if (locHasCurse(state, ls) && ls.heroCardInstIds.length > 0) v += WEIGHTS.CURSE_THREATENED;
  }

  // Motor de ciclado: sin Maldiciones en mano y con ubicaciones por cubrir, cada carta
  // jugada/descartada acerca el robo de la Maldición que falta (verificado en simulación:
  // sin esto Maléfica se estancaba con la mano llena de Efectos/Condiciones que no jugaba).
  if (covered < plugin.locations.length) {
    const cursesInHand = player.handInstIds.filter(
      id => state.allCards[id]?.cardType === CardType.CURSE,
    ).length;
    if (cursesInHand === 0) {
      v += (4 - player.handInstIds.length) * WEIGHTS.DIG_FOR_CURSES_PER_SLOT;
    }
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
      // NUEVO: bono si ya tenemos aliados suficientes para vencer
      if (allyStr >= heroStr && heroStr > 0) {
        v += WEIGHTS.BLOCKER_READY;
      }
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

/**
 * FASE 2 (descarte inteligente): maldiciones sobrantes en mano. Solo son útiles para las
 * ubicaciones aún sin cubrir (+1 de reserva por si un héroe retira una); las que exceden
 * ese número solo ocupan espacio en la mano.
 */
export function deadHandCards(state: GameState, p: PlayerState): CardInstId[] {
  const plugin = getPlugin(p.villainId);
  const uncovered = plugin.locations.filter(l => !locHasCurse(state, p.locationStates[l.id])).length;
  const cursesInHand = p.handInstIds.filter(id => state.allCards[id]?.cardType === CardType.CURSE);
  const surplus = cursesInHand.length - (uncovered + 1);
  return surplus > 0 ? cursesInHand.slice(-surplus) : [];
}

/** Cuán urgente es para el rival desbaratar a Maléfica: escala con las maldiciones ya colocadas. */
export function threatUrgency(state: GameState, self: PlayerState): number {
  const plugin = getPlugin(self.villainId);
  const curses = plugin.locations.filter(l => locHasCurse(state, self.locationStates[l.id])).length;
  return URGENCY_BY_CURSE_COUNT.find(t => curses >= t.min)?.urgency ?? 1.0;
}

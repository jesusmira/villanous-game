// ─── Heurística de IA de Garfio, registrada como plugin.aiHeuristics ────────────
// Extraído de core/ai/evaluate.ts (antes vivía como `if (villainId === 'hook')`
// repartido en código compartido entre villanos).
import { ActionType, CardType } from '../../types';
import type { GameState, PlayerState, LocationState } from '../../types';
import { getPlugin, getEffectDef } from '../registry';
import { CardDefId, CardDefPrefix, EffectId } from '../effectIds';
import { getEffectiveStrength } from '../../engine/stateHelpers';
import { heroHasBurla, findPeterPan, isPeterPanAtJollyRoger } from './aiHelpers';
import { HookLocationId, HookObjectiveStep } from './cards';

function locHasCurse(state: GameState, ls: LocationState): boolean {
  return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
}

const WEIGHTS = {
  HANGMAN_UNLOCKED: 40,   // hito de victoria desbloqueado
  TIC_TAC_ALIVE: -22,     // bloqueante temprano: descarta toda la mano si el peón llega a su ubicación

  // ── Posicionamiento de aliados contra bloqueantes (Burla / Tic Tac) ──
  BLOCKER_MATCH_AT_BURLA_LOC: 1.5,   // multiplicador de min(fuerzaAliados, fuerzaBloqueante) con Burla
  BLOCKER_MATCH_AT_OTHER_LOC: 1.8,   // ... cuando el bloqueante es solo Tic Tac
  BLOCKER_READY_AT_BURLA_LOC: 25,    // bono si ya hay aliados suficientes para vencer (Burla) — AUMENTADO
  BLOCKER_READY_AT_OTHER_LOC: 28,    // ... (Tic Tac) — AUMENTADO
  BLOCKER_NEEDS_MULTIPLE_BONUS: 12,  // bono extra si el bloqueante exige 2+ aliados y ya los tenemos — AUMENTADO
  PELOTON_VS_BURLA_MATCH: 1.5,       // Pelotones en JR listos para vencer Burla en Roca Calavera
  PELOTON_VS_BURLA_READY: 18,        // — AUMENTADO

  NORMAL_HERO_ALLY_MATCH: 1.0,       // co-ubicación con héroes normales (sin Burla/Tic Tac)
  NORMAL_HERO_READY: 10,             // — AUMENTADO
  NORMAL_HERO_BLOCKING_UNCURSED: -15, // NUEVO: penalización por héroes sin vencer que bloquean
  NORMAL_HERO_STRONG_NO_ALLIES: -20,  // NUEVO: penalización por héroes F4+ que no podemos vencer

  PP_IN_KINGDOM: 15,                 // Peter Pan ya está en el reino
  // Por cada paso más cerca del Jolly Roger (máx. 3 pasos). Tiene que ser lo bastante alto para
  // competir con visitar una ubicación con más slots de Jugar Carta (p. ej. Laguna tiene 2):
  // con un valor bajo, la IA prefiere acumular Aliados sin fin antes que ir a buscar a PP.
  PP_PROXIMITY_STEP: 12,             // — AUMENTADO
  PP_ALLY_MATCH: 1.8,                // — AUMENTADO
  PP_VANQUISHABLE: 35,               // ya hay aliados suficientes para vencerlo — AUMENTADO
  PP_AT_JOLLY_ROGER: 20,             // — AUMENTADO

  DEAD_FATE_CARD: -2.5,              // Rival Digno / Susto, muertas una vez que PP ya apareció
  DEAD_CONDITION: -2.5,              // Perspicaz / Obsesión cuyo disparador no puede activarse

  // FASE 3: Urgencia de victoria cuando PP está muy cerca
  PP_ALMOST_VICTORY: 80,             // PP está en Jolly Roger, solo falta vencerlo
  PP_FINAL_PHASE: 35,                // PP está en Roca (adyacente a JR)

  // ── Conciencia del avance de Maléfica (cuando es la rival) ──
  MALEFICENT_CURSE_IN_PLAY: -10,
  MALEFICENT_HERO_AT_OPP_PAWN: 12,
  MALEFICENT_HERO_BLOCKING_UNCURSED_BASE: 12,
  MALEFICENT_HERO_BLOCKING_UNCURSED_PER_HERO: 4,
  MALEFICENT_HERO_BLOCKING_CURSED: 5,
};

export function scoreState(state: GameState, player: PlayerState, genericPowerScore: number): number {
  return genericPowerScore + scoreHookObjective(state, player);
}

function scoreHookObjective(state: GameState, p: PlayerState): number {
  const plugin = getPlugin(p.villainId);
  let v = 0;
  const steps = p.completedObjectiveSteps ?? [];
  if (steps.includes(HookObjectiveStep.HANGMAN_UNLOCKED)) v += WEIGHTS.HANGMAN_UNLOCKED;

  const ticTacAlive = plugin.locations.some(l =>
    p.locationStates[l.id].heroCardInstIds.some(id =>
      state.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC,
    ),
  );
  const hasBurlaHero = plugin.locations.some(l =>
    p.locationStates[l.id].heroCardInstIds.some(id => heroHasBurla(state, id)),
  );
  if (ticTacAlive) v += WEIGHTS.TIC_TAC_ALIVE;
  const hasBlocker = hasBurlaHero || ticTacAlive;

  // ── Posicionamiento de aliados para vencer bloqueantes ──────────────────────
  if (hasBlocker) {
    for (const l of plugin.locations) {
      const ls = p.locationStates[l.id];
      const burlaHere = ls.heroCardInstIds.filter(id => heroHasBurla(state, id));
      const ticTacHere = ls.heroCardInstIds.filter(
        id => !heroHasBurla(state, id) && state.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC,
      );
      const blockersHere = [...burlaHere, ...ticTacHere];
      if (blockersHere.length === 0) continue;
      const blockersStr = blockersHere.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
      const alliesHere = ls.villainCardInstIds.filter(id => state.allCards[id]?.cardType === CardType.ALLY);
      const allyStrHere = alliesHere.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
      const isBurlaLoc = burlaHere.length > 0;
      v += Math.min(allyStrHere, blockersStr)
        * (isBurlaLoc ? WEIGHTS.BLOCKER_MATCH_AT_BURLA_LOC : WEIGHTS.BLOCKER_MATCH_AT_OTHER_LOC);
      if (allyStrHere >= blockersStr) {
        v += isBurlaLoc ? WEIGHTS.BLOCKER_READY_AT_BURLA_LOC : WEIGHTS.BLOCKER_READY_AT_OTHER_LOC;
      }
      const needsMultiple = blockersHere.some(id =>
        state.allCards[id]?.effectIds.some(eid => getEffectDef(eid)?.requiresMultipleAlliesToVanquish),
      );
      if (needsMultiple && alliesHere.length >= 2 && allyStrHere >= blockersStr) {
        v += WEIGHTS.BLOCKER_NEEDS_MULTIPLE_BONUS;
      }
    }
    // Pelotones en JR pueden vencer héroes con Burla en Roca Calavera (adyacente)
    const jollyVIds = p.locationStates[HookLocationId.JOLLY_ROGER]?.villainCardInstIds ?? [];
    const pelotonsAtJR = jollyVIds.filter(id => {
      const a = state.allCards[id];
      return a?.cardType === CardType.ALLY && a.effectIds.includes(EffectId.PELOTON_ADJ_VANQUISH);
    });
    const burlaAtRoca = (p.locationStates[HookLocationId.SKULL_ROCK]?.heroCardInstIds ?? [])
      .some(id => heroHasBurla(state, id));
    if (burlaAtRoca && pelotonsAtJR.length >= 2) {
      const ninosStr = (p.locationStates[HookLocationId.SKULL_ROCK]?.heroCardInstIds ?? [])
        .filter(id => heroHasBurla(state, id))
        .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
      const pelStr = pelotonsAtJR.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
      v += Math.min(pelStr, ninosStr) * WEIGHTS.PELOTON_VS_BURLA_MATCH;
      if (pelStr >= ninosStr) v += WEIGHTS.PELOTON_VS_BURLA_READY;
    }
  }

  // Héroes normales (no Burla, no TicTac, no PP): incentivar co-ubicación con aliados.
  // Peter Pan se excluye a propósito: tiene su propio bloque más abajo que premia ACERCARLO
  // al Jolly Roger. Si no se excluyera aquí, este bono competiría con ese y la IA preferiría
  // apilar aliados en la ubicación ACTUAL de PP en vez de moverlo — y un Vencer fuera del
  // Jolly Roger ni siquiera cuenta para el objetivo (ver hook/index.ts: onVanquish).
  for (const l of plugin.locations) {
    const ls = p.locationStates[l.id];
    const normHeroes = ls.heroCardInstIds.filter(
      id => !heroHasBurla(state, id)
        && state.allCards[id]?.defId !== CardDefId.HOOK_TIC_TAC
        && state.allCards[id]?.defId !== CardDefId.HOOK_PETER_PAN,
    );
    if (normHeroes.length === 0) continue;
    const heroStr = normHeroes.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
    const allyStr = ls.villainCardInstIds
      .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
      .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
    v += Math.min(allyStr, heroStr) * WEIGHTS.NORMAL_HERO_ALLY_MATCH;
    if (allyStr >= heroStr && heroStr > 0) v += WEIGHTS.NORMAL_HERO_READY;
    // NUEVO: penalizar héroes sin vencer
    if (allyStr < heroStr && heroStr > 0) {
      v += WEIGHTS.NORMAL_HERO_BLOCKING_UNCURSED;
    }
    // NUEVO: penalizar fuerte héroes F4+ que no podemos vencer (amenaza)
    const strongNormalHeroes = normHeroes.filter(id => getEffectiveStrength(state, id) >= 4);
    if (strongNormalHeroes.length > 0 && allyStr < heroStr) {
      v += strongNormalHeroes.length * WEIGHTS.NORMAL_HERO_STRONG_NO_ALLIES;
    }
  }

  // Penalización por ranuras bloqueadas: 1+ héroe = 2 primeros slots inaccesibles.
  // Los valores reflejan el coste real de perder cada tipo de acción para Garfio.
  const slotDmg = (type: ActionType): number => {
    switch (type) {
      case ActionType.PLAY_CARD:      return 9;
      case ActionType.VANQUISH:       return 8;
      case ActionType.GAIN_POWER:     return 5;
      case ActionType.MOVE_HERO:      return 5;
      case ActionType.FATE:           return 4;
      case ActionType.MOVE_ITEM_ALLY: return 4;
      case ActionType.DISCARD:        return 2;
      default:                        return 3;
    }
  };
  for (const l of plugin.locations) {
    const ls = p.locationStates[l.id];
    if (ls.heroCardInstIds.length === 0) continue;
    const blocked = Math.min(2, l.actions.length);
    for (let i = 0; i < blocked; i++) {
      v -= slotDmg(l.actions[i].type);
    }
  }

  const pp = findPeterPan(state, p);
  if (pp) {
    v += WEIGHTS.PP_IN_KINGDOM;

    const ppDistToJR = pp.locId === HookLocationId.JOLLY_ROGER ? 0
      : pp.locId === HookLocationId.SKULL_ROCK ? 1
      : pp.locId === HookLocationId.LAGOON ? 2
      : 3; // hangman u otro

    // FASE 3: Urgencia escalada según proximidad a Jolly Roger
    if (ppDistToJR === 0) {
      v += WEIGHTS.PP_ALMOST_VICTORY; // PP EN Jolly Roger: urgencia máxima
    } else if (ppDistToJR === 1) {
      v += WEIGHTS.PP_FINAL_PHASE; // PP en Roca: fase final
    }

    v += (4 - ppDistToJR) * WEIGHTS.PP_PROXIMITY_STEP; // JR > Roca > Laguna > Árbol
    // Con bloqueantes vivos, acumular aliados en JR para PP no avanza hacia la victoria
    if (!hasBlocker) {
      const ppStr = getEffectiveStrength(state, pp.id);
      const jollyLocDef = plugin.locations.find(l => l.id === HookLocationId.JOLLY_ROGER);
      const sameAllies = (p.locationStates[HookLocationId.JOLLY_ROGER]?.villainCardInstIds ?? [])
        .filter(id => state.allCards[id]?.cardType === CardType.ALLY);
      const adjAllies = (jollyLocDef?.adjacentIds ?? []).flatMap(adjId =>
        (p.locationStates[adjId]?.villainCardInstIds ?? []).filter(id => {
          const a = state.allCards[id];
          return a?.cardType === CardType.ALLY && a.effectIds.includes(EffectId.PELOTON_ADJ_VANQUISH);
        }),
      );
      const allyStr = [...sameAllies, ...adjAllies].reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
      v += Math.min(allyStr, ppStr) * WEIGHTS.PP_ALLY_MATCH;
      if (ppStr > 0 && allyStr >= ppStr) v += WEIGHTS.PP_VANQUISHABLE;
      if (pp.locId === HookLocationId.JOLLY_ROGER) v += WEIGHTS.PP_AT_JOLLY_ROGER;
    }
  }

  // Rival Digno y Susto solo sirven para encontrar a PP en el mazo de Destino.
  // Si PP ya está en el reino, son cartas muertas → penalizar tenerlas en mano.
  if (pp) {
    const deadCount = p.handInstIds.filter(id => {
      const c = state.allCards[id];
      return c?.defId.startsWith(CardDefPrefix.HOOK_RIVAL) || c?.defId.startsWith(CardDefPrefix.HOOK_SUSTO);
    }).length;
    v += deadCount * WEIGHTS.DEAD_FATE_CARD;
  }

  // Condiciones muertas: Perspicaz y Obsesión no aportan si su trigger no puede disparar.
  // Penalizarlas hace que tryDiscard las elimine proactivamente para liberar espacio en mano.
  const oppForCond = state.players.find(pl => pl.id !== p.id);
  if (oppForCond) {
    // Perspicaz: "si otro jugador tiene un Aliado de F4+"
    const oppHasF4Ally = Object.values(oppForCond.locationStates).some(ls =>
      ls.villainCardInstIds.some(id => {
        const c = state.allCards[id];
        return c?.cardType === CardType.ALLY && getEffectiveStrength(state, id) >= 4;
      }),
    );
    const perspicazCount = p.handInstIds.filter(id =>
      state.allCards[id]?.defId.startsWith(CardDefPrefix.HOOK_PERSPICAZ),
    ).length;
    if (!oppHasF4Ally && perspicazCount > 0) v += perspicazCount * WEIGHTS.DEAD_CONDITION;

    // Obsesión: "cuando otro jugador derrote un Héroe de F4+"
    // Muerta si el oponente no tiene héroes F4+ en su reino que se puedan vencer.
    const oppHasF4Hero = Object.values(oppForCond.locationStates).some(ls =>
      ls.heroCardInstIds.some(id => getEffectiveStrength(state, id) >= 4),
    );
    const obsesionCount = p.handInstIds.filter(id =>
      state.allCards[id]?.defId.startsWith(CardDefPrefix.HOOK_OBSESION),
    ).length;
    if (!oppHasF4Hero && obsesionCount > 0) v += obsesionCount * WEIGHTS.DEAD_CONDITION;
  }

  // ── Conciencia del avance de Maléfica, si es la rival ──
  const opp = state.players.find(pl => pl.id !== p.id);
  if (opp?.villainId === 'maleficent') {
    const malPlugin = getPlugin(opp.villainId);
    // Cada maldición en pie acerca la victoria de Maléfica — penalizar fuerte.
    const cursesInPlay = malPlugin.locations.filter(
      l => locHasCurse(state, opp.locationStates[l.id]),
    ).length;
    // AUMENTADO: más urgencia por maldiciones
    v += cursesInPlay * (WEIGHTS.MALEFICENT_CURSE_IN_PLAY - 5);

    // Héroe en la ubicación del peón rival bloquea sus acciones actuales — muy disruptivo.
    if ((opp.locationStates[opp.pawnLocationId]?.heroCardInstIds.length ?? 0) > 0) {
      v += WEIGHTS.MALEFICENT_HERO_AT_OPP_PAWN + 8;  // AUMENTADO
    }
    // Héroes en ubicaciones SIN maldición son especialmente valiosos:
    // bloquean ranuras de acción y retrasan/impiden colocar la maldición allí.
    for (const l of malPlugin.locations) {
      const ls = opp.locationStates[l.id];
      if (ls.heroCardInstIds.length === 0) continue;
      if (!locHasCurse(state, ls)) {
        // sin maldición → muy disruptivo (AUMENTADO)
        v += (WEIGHTS.MALEFICENT_HERO_BLOCKING_UNCURSED_BASE + 8)
          + ls.heroCardInstIds.length * (WEIGHTS.MALEFICENT_HERO_BLOCKING_UNCURSED_PER_HERO + 2);
      } else {
        v += WEIGHTS.MALEFICENT_HERO_BLOCKING_CURSED + 2; // con maldición → bloquea ranuras, menos crítico
      }
    }
  }

  return v;
}

const THREAT_URGENCY = {
  PP_AT_JOLLY_ROGER: 6.0,   // listo para vencer: urgencia máxima
  HANGMAN_UNLOCKED: 3.5,    // en fase final
  BASELINE: 1.8,            // Garfio siempre merece presión, no solo al final
};

/** Cuán urgente es para el rival desbaratar a Garfio: escala con su avance hacia Peter Pan. */
export function threatUrgency(state: GameState, self: PlayerState): number {
  if (isPeterPanAtJollyRoger(state, self)) return THREAT_URGENCY.PP_AT_JOLLY_ROGER;
  const steps = self.completedObjectiveSteps ?? [];
  if (steps.includes(HookObjectiveStep.HANGMAN_UNLOCKED)) return THREAT_URGENCY.HANGMAN_UNLOCKED;
  return THREAT_URGENCY.BASELINE;
}

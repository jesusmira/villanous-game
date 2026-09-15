// ─── Intenciones específicas de la Reina de Corazones ────────────────────────────
import { CardType } from '../../types';
import type { CardInstId, GameState, PlayerState } from '../../types';
import type { AIContext, IntentionDef, StructuralThreatDef, VillainWeightProfile } from '../../ai/intent/types';
import { evaluateFixedThreatPenalty } from '../../ai/intent/structuralThreats';
import { DEFAULT_VILLAIN_WEIGHTS } from '../../ai/intent/villainWeights';
import { getEffectDef } from '../../villains/registry';
import { EffectId } from '../effectIds';

// Medido con scripts/simulate.ts tras arreglar el motor de intenciones (2026-09-15): con pesos
// por defecto (sin calibrar) la Reina ya cierra partidas de forma consistente — queen-vs-jhon
// 20% (3/15), queen-vs-maleficent 83% (10/12), queen-vs-hook 50% (6/12), 0% estancadas en las 3
// tandas. No se tocan los pesos por categoría todavía: con la intención de Menguar + el bono de
// amenaza estructural recién añadidos, no hay suficiente señal adicional para calibrar sin correr
// el riesgo de sobreajustar sobre ruido (ver memoria project_locationvalue_calibration_failed).
// Si tras más partidas queen-vs-jhon sigue muy por debajo del resto, ahí sí calibrar objectiveWeight
// / heroRemovalWeight con el simulador antes de tocar nada más a mano.
export const aiWeights: VillainWeightProfile = { ...DEFAULT_VILLAIN_WEIGHTS };

/** Alicia bloquea TODO movimiento de Aliados/Objetos — paraliza por completo la mecánica central
 *  (nunca se puede redistribuir Soldados/Postigos entre ubicaciones mientras viva). Jugar nuevos
 *  Soldados vía PLAY_CARD sigue siendo legal (blocksMoveItemAlly solo afecta MOVE_ITEM_ALLY), así
 *  que Alicia no paraliza la cobertura por completo — pero si además se acumula suficiente Fuerza
 *  de Aliados en su ubicación, vencerla (VANQUISH) debe premiarse: sin `fixedVanquishBonus` no
 *  había NINGÚN término que empujara a gastar una acción en derrotarla, solo la penalización de
 *  urgencia (que sube la prioridad de "cubrir ubicaciones" pero no señala vencerla como el modo
 *  de resolverlo).
 */
const aliciaThreat: StructuralThreatDef = {
  id: 'queen-alicia',
  isThreatHero: (state, heroId) => state.allCards[heroId]?.defId === 'queen_f_alicia',
  fixedPenaltyWhileAlive: 45,
  fixedVanquishBonus: 30,
};
/** Dodo bloquea la conversión Soldado→Postigo solo en su propia ubicación — penalización más
 *  ligera que Alicia (binaria, pero de alcance local, no total sobre el reino). */
const dodoThreat: StructuralThreatDef = {
  id: 'queen-dodo',
  isThreatHero: (state, heroId) => state.allCards[heroId]?.defId === 'queen_f_dodo',
  fixedPenaltyWhileAlive: 20,
  fixedVanquishBonus: 15,
};
export const structuralThreats: StructuralThreatDef[] = [aliciaThreat, dodoThreat];

/** Nº de ubicaciones del Reino con al menos un Postigo. */
function wicketCoverage(ctx: AIContext): number {
  return ctx.locations.filter(l => l.villainCardInstIds.some(id => ctx.state.allCards[id]?.isWicket)).length;
}

/**
 * Cubrir el Reino de Postigos: URGENCIA formulada como hueco restante (ubicaciones aún sin
 * Postigo) para que cada conversión parcial sume alineación, no solo la última que completa la
 * cobertura — mismo patrón que UNLOCK_LOCATIONS (universal) y PREPARE_COMBO. Resta la
 * penalización de Alicia/Dodo (mientras bloquean, el hueco es más urgente/costoso de cerrar).
 */
const coverLocationsIntention: IntentionDef = {
  id: 'QUEEN_COVER_LOCATIONS',
  name: 'Cubrir el Reino de Postigos',
  polarity: -1,
  category: 'objective',
  evaluate: (ctx: AIContext) => {
    const totalLocs = ctx.locations.length;
    const missing = totalLocs - wicketCoverage(ctx);
    if (missing === 0) return 0;
    let v = missing * 30;
    v += evaluateFixedThreatPenalty(ctx, aliciaThreat);
    v += evaluateFixedThreatPenalty(ctx, dodoThreat);
    return v;
  },
};

/**
 * Efectuar el tiro: LOGRO que permanece en 0 hasta cubrir las 4 ubicaciones, y da un salto grande
 * en cuanto la carta es jugable — empuja a rematar en vez de seguir acumulando Postigos de más
 * una vez alcanzada la cobertura completa.
 */
const takeTheShotIntention: IntentionDef = {
  id: 'QUEEN_TAKE_THE_SHOT',
  name: 'Efectúa el tiro',
  polarity: 1,
  category: 'objective',
  evaluate: (ctx: AIContext) => {
    const totalLocs = ctx.locations.length;
    if (wicketCoverage(ctx) < totalLocs) return 0;
    const hasTiroInHand = ctx.player.handInstIds.some(id => ctx.state.allCards[id]?.effectIds.includes('queen_efectua_el_tiro'));
    return hasTiroInHand ? 200 : 120;
  },
};

/**
 * Héroes propios que Menguar mejoraría de verdad: Agrandados (revertirlos quita la casilla EXTRA
 * que tapan en una ubicación adyacente — ver queen_agrandar/isEnlarged) o héroes normales en una
 * ubicación que tapa sus 2 casillas de siempre y donde aún no hay ningún otro héroe ya Menguado
 * ahí (menguar a un segundo héroe en la misma ubicación no reduce nada más — solo el primero
 * Menguado cuenta, ver getCoveredSlotIndices en slotHelpers.ts). Excluye inmunes (El Lirón) y ya
 * Menguados (aplicar Menguar de nuevo no cambia nada).
 */
function menguarEligibleHeroes(ctx: AIContext): CardInstId[] {
  const out: CardInstId[] = [];
  for (const loc of ctx.locations) {
    if (loc.heroCardInstIds.length === 0) continue;
    const alreadyShrunkHere = loc.heroCardInstIds.some(id => ctx.state.allCards[id]?.isShrunk);
    for (const heroId of loc.heroCardInstIds) {
      const hero = ctx.state.allCards[heroId];
      if (!hero) continue;
      if (hero.effectIds.some(effId => getEffectDef(effId)?.immuneToShrink)) continue;
      if (hero.isEnlarged) { out.push(heroId); continue; }
      if (hero.isShrunk || !loc.blocksSlots || alreadyShrunkHere) continue;
      out.push(heroId);
    }
  }
  return out;
}

/**
 * Menguar a un Héroe bloqueante: URGENCIA formulada como héroes propios que Menguar mejoraría
 * ahora mismo (ver menguarEligibleHeroes). Sin esta intención, Menguar no tenía NINGUNA alineación
 * con las 2 únicas intenciones de la Reina (cubrir ubicaciones / rematar) — y como Menguar no toca
 * Fuerza (solo casillas tapadas), tampoco lo capturaba el término genérico OWN_HERO_BLOCKAGE
 * (que solo mide Fuerza de héroes bloqueantes, no casillas). Resultado: se quedaba en mano
 * turnos enteros aunque hubiera un héroe Agrandado o bloqueando 2 casillas — incluida Alicia, que
 * vive indefinidamente en el reino sin que la IA intentara reducir su bloqueo (ver aliciaThreat).
 * Gateada por tener la carta en mano (mismo patrón que hasTiroInHand en QUEEN_TAKE_THE_SHOT): sin
 * Menguar disponible, ningún candidato puede avanzarla y no debe dominar la elección del turno.
 */
const useMenguarIntention: IntentionDef = {
  id: 'QUEEN_USE_MENGUAR',
  name: 'Menguar a un Héroe bloqueante',
  polarity: -1,
  category: 'heroRemoval',
  evaluate: (ctx: AIContext) => {
    const hasMenguarInHand = ctx.player.handInstIds.some(
      id => ctx.state.allCards[id]?.effectIds.includes(EffectId.QUEEN_MENGUAR),
    );
    if (!hasMenguarInHand) return 0;
    const eligible = menguarEligibleHeroes(ctx);
    if (eligible.length === 0) return 0;
    let v = eligible.length * 25;
    v += evaluateFixedThreatPenalty(ctx, aliciaThreat);
    v += evaluateFixedThreatPenalty(ctx, dodoThreat);
    return v;
  },
};

export const intentions: IntentionDef[] = [coverLocationsIntention, takeTheShotIntention, useMenguarIntention];

/**
 * Cartas de mano muertas: Menguar/Cabeza sin ningún Héroe rival en el reino, Lanza sin ningún
 * Aliado al que unirse, Por orden de la Reina/Gato Risón sin ningún Soldado sin convertir, y
 * Efectúa el tiro mientras aún falte cubrir alguna ubicación (evita el bug ya documentado de mano
 * congelada — ver memoria project_ai_frozen_hand_deadlock_fix).
 */
export function deadCards(state: GameState, p: PlayerState): CardInstId[] {
  const out: CardInstId[] = [];
  const hasHeroInKingdom = Object.values(p.locationStates).some(ls => ls.heroCardInstIds.length > 0);
  const hasAllyInKingdom = Object.values(p.locationStates)
    .some(ls => ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.ALLY));
  const hasSoldadoToConvert = Object.values(p.locationStates)
    .some(ls => ls.villainCardInstIds.some(
      id => state.allCards[id]?.effectIds.includes('queen_soldado_toggle') && !state.allCards[id]?.isWicket,
    ));
  const totalLocs = Object.keys(p.locationStates).length;
  const coveredLocs = Object.values(p.locationStates)
    .filter(ls => ls.villainCardInstIds.some(id => state.allCards[id]?.isWicket)).length;
  const fullyCovered = coveredLocs >= totalLocs;

  const seenCondNames = new Set<string>();
  for (const id of p.handInstIds) {
    const c = state.allCards[id];
    if (!c) continue;
    if (!hasHeroInKingdom && (c.effectIds.includes('queen_menguar') || c.effectIds.includes('queen_cabeza'))) {
      out.push(id); continue;
    }
    if (!hasAllyInKingdom && c.effectIds.includes('queen_lanza_attach')) { out.push(id); continue; }
    // Por orden de la Reina se descarta sin efecto (log "no hay Soldados Naipe que convertir")
    // si no queda ningún Soldado sin convertir en el reino — mismo desperdicio de coste que
    // Lanza sin Aliado, ver `queen_por_orden` en effects.ts.
    if (!hasSoldadoToConvert && c.effectIds.includes('queen_por_orden')) { out.push(id); continue; }
    if (!fullyCovered && c.effectIds.includes('queen_efectua_el_tiro')) { out.push(id); continue; }
    if (c.cardType === CardType.CONDITION) {
      if (seenCondNames.has(c.name)) { out.push(id); continue; }
      seenCondNames.add(c.name);
    }
  }
  return out;
}

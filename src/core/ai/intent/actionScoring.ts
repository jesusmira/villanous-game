// ─── Puntuador universal de acciones ──────────────────────────────────────────────
// Cada acción candidata se valora en 6 términos + una penalización, según lo pedido:
// progreso hacia la victoria, impacto en el enemigo, economía del turno, sinergia con la mano,
// preparación de victoria, alineación con la intención elegida — y −10 si es un "mover" que no
// abre opciones nuevas.
import { CardType } from '../../types';
import type { PlayerId } from '../../types';
import type { OpponentProfile } from '../opponentModel';
import type { AIContext, ActionCandidate, ActionScoreBreakdown, IntentionDef, ScoredAction } from './types';
import { buildAIContext } from './context';
import { lerpCurve } from './curve';

const WEIGHTS = {
  // NOTA: para el Príncipe Juan, ownProgress ES el Poder (progress = power/20*100) — un peso
  // alto aquí penalizaría CUALQUIER carta con coste como si fuera un desastre (gastar 2 de
  // Poder = -10 puntos de progreso), ahogando jugadas estructuralmente buenas (p. ej.
  // Encarcelar a Robin Hood). Deliberadamente bajo: el progreso "de verdad" para Jhon ya lo
  // cubre su propia intención JHON_GENERATE_POWER (con curva por tramos, ver jhon/intentions.ts)
  // vía intentionAlignment, y este término solo aporta la señal genérica para Garfio/Maléfica
  // (cuyo progreso NO es un recurso que se gasta).
  PROGRESS: 0.35,
  // Victoria/derrota reales: deben dominar sobre cualquier otro término sin excepción.
  WIN: 1_000_000,
  LOSE: -1_000_000,
  ENEMY_IMPACT: 2.5,
  // Poder: cada moneda hasta el tope vale algo por sí sola (opciones futuras), con
  // rendimientos decrecientes por encima de él — sin este término POSITIVO, Ganar Poder solo
  // tenía valor indirecto (vía intentionAlignment de GENERATE_POWER cuando esa era la intención
  // elegida), y con otra intención activa puntuaba EXACTAMENTE 0 — empatado con "no hacer nada"
  // y por tanto nunca elegido (ver bestActivateRollout: exige > 0 salvo Destino). Mismo espíritu
  // que POWER_USEFUL del motor anterior.
  ECONOMY_POWER_VALUE: 0.6,
  // OJO: casi 0 a propósito. Con un valor mayor, ganar Poder por encima del tope BAJABA la nota
  // y la IA prefería pasar turno para siempre antes que coger monedas (partidas estancadas) —
  // mismo escarmiento que POWER_HOARD_PENALTY en el motor anterior. Ganar Poder NUNCA debe
  // puntuar peor que no hacer nada.
  ECONOMY_HOARD_PENALTY: 0.05,
  ECONOMY_HOARD_CAP: 6,
  // Bajo a propósito: mide "opciones futuras" (cuántas otras cartas siguen siendo asequibles),
  // pero NO puede pesar tanto que desanime la acción central del juego (gastar Poder para jugar
  // cartas) — un peso alto aquí castigaba CUALQUIER jugada que redujera el Poder por debajo del
  // coste de otra carta en mano, incluso cuando jugar la primera era claramente lo correcto.
  HAND_SYNERGY_AFFORDABLE: 0.5,
  HAND_SYNERGY_OPTION: 0.15,
  // Cartas muertas en mano (ver AIContext.deadHandCardIds): reducirlas SIEMPRE suma, sin
  // depender de qué intención esté activa — sin este término directo, descartar una carta
  // muerta solo perdía puntos vía HAND_SYNERGY_AFFORDABLE/OPTION (menos cartas en mano = peor
  // por esos dos términos) y la IA nunca ciclaba la mano, ni siquiera con DISCARD_DEAD_HAND
  // como intención elegida (ver EMPTY_ACTIVATE_TURN en la memoria del usuario).
  DEAD_HAND_CARD: 5,
  // Desarrollo del propio reino (independiente de qué intención se haya elegido este turno):
  // Aliados en juego valen algo por sí solos, y los héroes propios sin vencer restan porque
  // tapan ranuras — sin esto, una acción solo se veía "bien vista" cuando coincidía con la
  // intención elegida, y p. ej. Vencer perdía su valor estructural si el turno se orientaba a
  // otra cosa (Generar Poder). Pesos equivalentes a OWN_ALLY_STRENGTH/OWN_HERO_STRENGTH_PENALTY
  // del motor anterior.
  DEVELOPMENT_ALLY: 1.0,
  OWN_HERO_BLOCKAGE: 2.2,
  // Bajo a propósito: PREPARE_VICTORY (intención, con su propio clamp vía intentionAlignment)
  // ya cubre la señal principal de "cerca de ganar" cuando esa es la intención elegida; este
  // término es solo un matiz adicional, no debe duplicar el mismo peso completo (evita que dos
  // mecanismos castiguen la MISMA fluctuación de progreso a la vez).
  VICTORY_PREP: 0.15,
  INTENTION: 0.25,
  USELESS_MOVE_PENALTY: -10,
};

function vanquishableCount(ctx: AIContext): number {
  return ctx.locations.filter(l => l.heroStrength > 0 && l.allyStrength >= l.heroStrength).length;
}

function oppBlockageStrength(ctx: AIContext): number {
  return ctx.oppLocations.reduce((sum, l) => sum + l.heroStrength, 0);
}

/** Suma la Fuerza de héroes propios que SÍ tapan ranuras (excluye ubicaciones con
 *  heroesNeverCoverSlots, p. ej. La Prisión — un héroe ahí no bloquea nada que quitar). */
function ownHeroBlockageStrength(ctx: AIContext): number {
  return ctx.locations.reduce((sum, l) => {
    const locDef = ctx.plugin.locations.find(ld => ld.id === l.id);
    if (locDef?.heroesNeverCoverSlots) return sum;
    return sum + l.heroStrength;
  }, 0);
}

function ownAllyStrength(ctx: AIContext): number {
  return ctx.locations.reduce((sum, l) => sum + l.allyStrength, 0);
}

function affordableHandCount(ctx: AIContext): number {
  return ctx.player.handInstIds.filter(id => {
    const c = ctx.state.allCards[id];
    if (!c) return false;
    const cost = Math.max(0, c.baseCost + c.costModifier);
    return ctx.player.power >= cost;
  }).length;
}

/** Curva de "cerca de ganar" continua, reutilizada como bonus de preparación de victoria.
 *  Deliberadamente plana hasta el 85% — solo se activa cuando la victoria está REALMENTE cerca
 *  (1-2 turnos), para no solaparse con el vaivén normal de progreso a mitad de partida (para el
 *  Príncipe Juan, cuyo progreso ES su Poder, cualquier carta con coste movería este término si
 *  la curva empezara antes) — esa señal de mitad de partida ya la cubren `progress` y las
 *  intenciones propias de cada villano (p. ej. JHON_GENERATE_POWER). */
function victoryPrepCurve(progress: number): number {
  return lerpCurve(progress, [[0, 0], [85, 0], [92, 15], [97, 40], [100, 100]]);
}

export function scoreAction(
  ctxBefore: AIContext,
  candidate: ActionCandidate,
  chosenIntention: IntentionDef,
  playerId: PlayerId,
  profile?: OpponentProfile,
): ScoredAction {
  const ctxAfter = buildAIContext(candidate.resultState, playerId, profile);

  if (candidate.resultState.winner === playerId) {
    const breakdown: ActionScoreBreakdown = {
      progress: WEIGHTS.WIN, enemyImpact: 0, economy: 0, handSynergy: 0, victoryPrep: 0,
      intentionAlignment: 0, uselessPenalty: 0, total: WEIGHTS.WIN,
    };
    return { ...candidate, breakdown };
  }
  if (candidate.resultState.winner && candidate.resultState.winner !== playerId) {
    const breakdown: ActionScoreBreakdown = {
      progress: WEIGHTS.LOSE, enemyImpact: 0, economy: 0, handSynergy: 0, victoryPrep: 0,
      intentionAlignment: 0, uselessPenalty: 0, total: WEIGHTS.LOSE,
    };
    return { ...candidate, breakdown };
  }

  const progress = (ctxAfter.ownProgress - ctxBefore.ownProgress) * WEIGHTS.PROGRESS;

  const enemyImpact = (oppBlockageStrength(ctxAfter) - oppBlockageStrength(ctxBefore)) * WEIGHTS.ENEMY_IMPACT
    + (ctxBefore.oppProgress - ctxAfter.oppProgress) * WEIGHTS.ENEMY_IMPACT * 2;

  // Valor del Poder hasta el tope (positivo) menos penalización por acaparar por encima de él.
  const powerValue = (p: number) => Math.min(p, WEIGHTS.ECONOMY_HOARD_CAP) * WEIGHTS.ECONOMY_POWER_VALUE
    - Math.max(0, p - WEIGHTS.ECONOMY_HOARD_CAP) * WEIGHTS.ECONOMY_HOARD_PENALTY;
  const economy = powerValue(ctxAfter.player.power) - powerValue(ctxBefore.player.power);

  const handSynergy = (affordableHandCount(ctxAfter) - affordableHandCount(ctxBefore)) * WEIGHTS.HAND_SYNERGY_AFFORDABLE
    + (ctxAfter.player.handInstIds.length - ctxBefore.player.handInstIds.length) * WEIGHTS.HAND_SYNERGY_OPTION
    + (ownAllyStrength(ctxAfter) - ownAllyStrength(ctxBefore)) * WEIGHTS.DEVELOPMENT_ALLY
    - (ownHeroBlockageStrength(ctxAfter) - ownHeroBlockageStrength(ctxBefore)) * WEIGHTS.OWN_HERO_BLOCKAGE
    - (ctxAfter.deadHandCardIds.length - ctxBefore.deadHandCardIds.length) * WEIGHTS.DEAD_HAND_CARD;

  const victoryPrep = (victoryPrepCurve(ctxAfter.ownProgress) - victoryPrepCurve(ctxBefore.ownProgress)) * WEIGHTS.VICTORY_PREP;

  // polarity corrige el signo: para intenciones "de urgencia" (evaluate baja al resolverse),
  // resolver el problema debe SUMAR alineación, no restarla (ver IntentionDef.polarity).
  const intentionAlignmentRaw = (chosenIntention.evaluate(ctxAfter) - chosenIntention.evaluate(ctxBefore)) * chosenIntention.polarity;
  // Acotado: evaluate() está calibrado para SELECCIONAR entre intenciones (escala 0-150+), no
  // para sumarse directo a las demás puntuaciones de acción (escala de un dígito a decenas) —
  // sin este límite, una intención con un salto grande podía dominar por completo el resto de
  // términos estructurales (progreso, desarrollo, etc.) en una sola acción.
  const intentionAlignment = Math.max(-20, Math.min(20, intentionAlignmentRaw)) * WEIGHTS.INTENTION;

  const openedNewOptions = progress !== 0
    || vanquishableCount(ctxAfter) > vanquishableCount(ctxBefore)
    || affordableHandCount(ctxAfter) !== affordableHandCount(ctxBefore)
    || ctxAfter.deadHandCardIds.length !== ctxBefore.deadHandCardIds.length;
  const uselessPenalty = candidate.isRepositioning && !openedNewOptions ? WEIGHTS.USELESS_MOVE_PENALTY : 0;

  const total = progress + enemyImpact + economy + handSynergy + victoryPrep + intentionAlignment + uselessPenalty;

  const breakdown: ActionScoreBreakdown = {
    progress, enemyImpact, economy, handSynergy, victoryPrep, intentionAlignment, uselessPenalty, total,
  };
  return { ...candidate, breakdown };
}

// scoreAction() puntúa por DELTA (antes→después): "no hacer nada" vale 0 en todos los términos
// por construcción, así que el planificador solo necesita comparar candidate.breakdown.total > 0
// (con el mismo margen/empate que ya usa para Destino) sin necesitar una línea base aparte.

// Re-exportado por conveniencia de otros módulos que necesitan clasificar mano jugable.
export function isPlayableCardType(cardType: string): boolean {
  return cardType !== CardType.CONDITION;
}

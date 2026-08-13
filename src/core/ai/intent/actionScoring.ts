// ─── Puntuador universal de acciones ──────────────────────────────────────────────
// Cada acción candidata se valora en: progreso hacia la victoria, impacto en el enemigo,
// economía del turno, sinergia con la mano, preparación de victoria, alineación con la intención
// elegida, presión acumulada (colocación de héroes vía Destino), colocación de Aliados — y −10 si
// es un "mover" que no abre opciones nuevas.
import { ActionType, CardType } from '../../types';
import type { PlayerId, VillainId } from '../../types';
import type { OpponentProfile } from '../opponentModel';
import type { AIContext, ActionCandidate, ActionScoreBreakdown, IntentionDef, ScoredAction } from './types';
import { buildAIContext } from './context';
import { lerpCurve } from './curve';
import { getEffectiveStrength } from '../../engine/stateHelpers';
import { getEffectDef } from '../../villains/registry';

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
  // Presión acumulada (colocación de héroes rivales vía Destino) — fórmula pedida por el
  // usuario: heroBlockValue×10 + futureHeroSynergy×12 + villainWeaknessToHeroes×8 +
  // costToRemoveHero×6. Los cuatro factores se normalizan a una escala ~0-3 (ver funciones más
  // abajo) para que la suma quede en un rango comparable al resto de términos.
  PRESSURE_BLOCK: 10,
  PRESSURE_SYNERGY: 12,
  PRESSURE_WEAKNESS: 8,
  PRESSURE_COST: 6,
  // Colocación inteligente de Aliados: cuánto del hueco Aliado↔héroe (mín(aliados, héroe) en la
  // MISMA ubicación) queda cubierto — independiente de la intención elegida, mismo espíritu que
  // DEVELOPMENT_ALLY/OWN_HERO_BLOCKAGE (estructural, no solo cuando coincide con el foco del turno).
  ALLY_PLACEMENT_FIT: 1.5,
};

function vanquishableCount(ctx: AIContext): number {
  return ctx.locations.filter(l => l.heroStrength > 0 && l.allyStrength >= l.heroStrength).length;
}

function oppBlockageStrength(ctx: AIContext): number {
  return ctx.oppLocations.filter(l => l.blocksSlots).reduce((sum, l) => sum + l.heroStrength, 0);
}

/** Suma la Fuerza de héroes propios que SÍ tapan ranuras (excluye ubicaciones con
 *  heroesNeverCoverSlots, p. ej. La Prisión — un héroe ahí no bloquea nada que quitar). */
function ownHeroBlockageStrength(ctx: AIContext): number {
  return ctx.locations.filter(l => l.blocksSlots).reduce((sum, l) => sum + l.heroStrength, 0);
}

function ownAllyStrength(ctx: AIContext): number {
  return ctx.locations.reduce((sum, l) => sum + l.allyStrength, 0);
}

/** Suma, por ubicación PROPIA, min(fuerza de Aliados, fuerza de héroes) — cuánto del hueco
 *  Aliado↔héroe ya está cubierto. Usado tanto para el término estructural de colocación de
 *  Aliados como (invertido) por las intenciones de "eliminar/preparar combo". */
function allyHeroFit(ctx: AIContext): number {
  return ctx.locations.reduce((sum, l) => sum + Math.min(l.allyStrength, l.heroStrength), 0);
}

const EXTRA_SLOT_VALUE: Record<string, number> = {
  VANQUISH_WITH_HERO: 10, VANQUISH_EMPTY: 4, GAIN_POWER: 3, MOVE_HERO: 4, OTHER: 2,
};

/** Valor de las ranuras de acción EXTRA que dan ciertos Objetos en juego (p. ej. El Estuche de
 *  Garfio: +1 Ganar Poder; Mecanismo Ingenioso: +1 Mover Héroe) — sin este término, esos Objetos
 *  no tenían NINGUNA razón estructural para jugarse (cuestan Poder, no afectan ningún otro
 *  término existente) y se quedaban en mano indefinidamente. Solo cuenta el primero de cada tipo
 *  por ubicación (duplicados no añaden ranuras útiles nuevas). */
function extraSlotValue(ctx: AIContext): number {
  return ctx.locations.reduce((sum, l) => {
    const seenTypes = new Set<string>();
    return sum + l.villainCardInstIds.reduce((t, id) => {
      const c = ctx.state.allCards[id];
      if (!c?.grantsActionSlot) return t;
      const slotType = c.grantsActionSlot.type;
      if (seenTypes.has(slotType)) return t;
      seenTypes.add(slotType);
      if (slotType === 'VANQUISH') return t + (l.heroStrength > 0 ? EXTRA_SLOT_VALUE.VANQUISH_WITH_HERO : EXTRA_SLOT_VALUE.VANQUISH_EMPTY);
      if (slotType === 'GAIN_POWER') return t + EXTRA_SLOT_VALUE.GAIN_POWER;
      if (slotType === 'MOVE_HERO') return t + EXTRA_SLOT_VALUE.MOVE_HERO;
      return t + EXTRA_SLOT_VALUE.OTHER;
    }, 0);
  }, 0);
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

// ─── Presión acumulada ─────────────────────────────────────────────────────────────

export const SLOT_DAMAGE: Record<string, number> = {
  PLAY_CARD: 9, VANQUISH: 8, GAIN_POWER: 5, MOVE_HERO: 5,
  FATE: 4, MOVE_ITEM_ALLY: 4, DISCARD: 2,
};

/** Cuánto vale estructuralmente bloquear las 2 primeras ranuras de una ubicación del rival. */
function slotDamageForLocation(locDef: { actions: { type: string }[] } | undefined): number {
  if (!locDef) return 0;
  const blocked = Math.min(2, locDef.actions.length);
  let dmg = 0;
  for (let i = 0; i < blocked; i++) dmg += SLOT_DAMAGE[locDef.actions[i].type] ?? 3;
  return dmg;
}

/** Debilidad estructural de cada villano ante quedar bloqueado por héroes: Garfio siempre
 *  conserva su ranura de Vencer en el Jolly Roger (menos vulnerable), Maléfica necesita Jugar
 *  Carta en CADA ubicación para ganar (muy vulnerable), Jhon depende de pocas ubicaciones para
 *  Ganar Poder/Jugar Carta (vulnerable). 1.0 por defecto para villanos futuros sin calibrar. */
const VILLAIN_WEAKNESS_TO_HEROES: Partial<Record<VillainId, number>> = {
  hook: 0.7,
  maleficent: 1.2,
  jhon: 1.15,
};

/** Detecta si `resultState` colocó un héroe NUEVO en el reino rival respecto a `ctxBefore`
 *  (vía Destino) — genérico, no depende del tipo de candidato. */
function findNewHeroPlacement(ctxBefore: AIContext, ctxAfter: AIContext): { locId: string; heroId: string } | null {
  for (const locAfter of ctxAfter.oppLocations) {
    const locBefore = ctxBefore.oppLocations.find(l => l.id === locAfter.id);
    const beforeIds = new Set(locBefore?.heroCardInstIds ?? []);
    const newHero = locAfter.heroCardInstIds.find(id => !beforeIds.has(id));
    if (newHero) return { locId: locAfter.id, heroId: newHero };
  }
  return null;
}

function computePressureScore(ctxBefore: AIContext, ctxAfter: AIContext): number {
  const placement = findNewHeroPlacement(ctxBefore, ctxAfter);
  if (!placement || !ctxAfter.opponent || !ctxAfter.oppPlugin) return 0;

  const locBefore = ctxBefore.oppLocations.find(l => l.id === placement.locId);
  const locAfter = ctxAfter.oppLocations.find(l => l.id === placement.locId)!;
  const locDef = ctxAfter.oppPlugin.locations.find(l => l.id === placement.locId);
  const wasAlreadyBlocked = (locBefore?.heroCardInstIds.length ?? 0) > 0;

  // heroBlockValue: bloqueo NUEVO pleno, o marginal (0.3×) si ya había otro héroe ahí.
  const rawBlockValue = locAfter.blocksSlots ? slotDamageForLocation(locDef) : 0;
  // Sin valor de bloqueo si la ubicación YA estaba bloqueada por otro héroe — bloquear ranuras
  // es binario (0 ó 2 ranuras tapadas), así que un segundo héroe ahí no bloquea NADA nuevo. Sin
  // este corte a 0 (antes 0.3× marginal), apilar seguía compitiendo con abrir un frente nuevo y
  // el rival apilaba TODO el mazo de héroes en una sola ubicación en vez de repartir la presión
  // (confirmado con el simulador: 7-8 héroes amontonados en un solo sitio, partida estancada
  // porque ya no se puede reunir Fuerza suficiente para limpiarlo nunca).
  const heroBlockValue = wasAlreadyBlocked || !locAfter.blocksSlots ? 0 : Math.min(3, rawBlockValue / 3);

  // futureHeroSynergy: bono PLANO (no escala con la cantidad) por no estar solo — el segundo
  // héroe en una ubicación sí cuesta más Fuerza limpiar de golpe, pero el tercero en adelante no
  // añade nada real (las reglas no premian "más apilado", y premiarlo artificialmente crea el
  // mismo problema de arriba).
  const otherHeroesHere = Math.max(0, locAfter.heroCardInstIds.length - 1);
  const adjHeroes = (locDef?.adjacentIds ?? []).reduce((n, adjId) => {
    const adjLoc = ctxAfter.oppLocations.find(l => l.id === adjId);
    return n + (adjLoc?.heroCardInstIds.length ?? 0);
  }, 0);
  const futureHeroSynergy = (otherHeroesHere > 0 ? 1.5 : 0) + (adjHeroes > 0 ? 0.5 : 0);

  const villainWeaknessToHeroes = VILLAIN_WEAKNESS_TO_HEROES[ctxAfter.opponent.villainId] ?? 1.0;

  const heroStr = getEffectiveStrength(ctxAfter.state, placement.heroId);
  const needsMultiple = (ctxAfter.state.allCards[placement.heroId]?.effectIds ?? [])
    .some(id => getEffectDef(id)?.requiresMultipleAlliesToVanquish);
  const costToRemoveHero = Math.min(3, heroStr / 3 + (needsMultiple ? 0.5 : 0));

  const rawPressure = heroBlockValue * WEIGHTS.PRESSURE_BLOCK
    + futureHeroSynergy * WEIGHTS.PRESSURE_SYNERGY
    + villainWeaknessToHeroes * WEIGHTS.PRESSURE_WEAKNESS
    + costToRemoveHero * WEIGHTS.PRESSURE_COST;

  // Saturación: cuanto más del reino rival ya esté bloqueado, menos vale seguir apilando más
  // presión ahí en vez de usar el turno en desarrollarse. Sin esto, dos IAs enfrentadas entran
  // en una carrera de Destino mutua (nunca cuesta Poder, así que siempre parece rentable) que
  // ninguna puede ganar — confirmado con el simulador: partidas de 150+ rondas donde ambos
  // reinos terminan con la mayoría de héroes de SU PROPIO mazo de Destino ya revelados y
  // amontonados, sin Fuerza de Aliados suficiente en ningún lado para limpiar nada.
  const blockableLocs = ctxAfter.oppLocations.filter(l => l.blocksSlots);
  const blockedCount = blockableLocs.filter(l => l.heroCardInstIds.length > 0).length;
  const saturation = blockableLocs.length > 0 ? blockedCount / blockableLocs.length : 0;
  const saturationFactor = 1 - saturation * 0.7;

  return rawPressure * saturationFactor;
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
      intentionAlignment: 0, pressureScore: 0, allyPlacement: 0, uselessPenalty: 0, total: WEIGHTS.WIN,
    };
    return { ...candidate, breakdown };
  }
  if (candidate.resultState.winner && candidate.resultState.winner !== playerId) {
    const breakdown: ActionScoreBreakdown = {
      progress: WEIGHTS.LOSE, enemyImpact: 0, economy: 0, handSynergy: 0, victoryPrep: 0,
      intentionAlignment: 0, pressureScore: 0, allyPlacement: 0, uselessPenalty: 0, total: WEIGHTS.LOSE,
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

  // Cartas muertas: SOLO se premia que bajen (descartarlas) — nunca se penaliza que suban,
  // porque una carta puede volverse muerta como efecto COLATERAL de una acción buena y ajena
  // (p. ej. Vencer consume el único Aliado del reino, y una Flecha Dorada en mano — que se
  // adjunta a un Aliado — pasa a estar "muerta" sin que la acción de Vencer tenga culpa de eso).
  // Misma trampa de gradiente que ya se corrigió en `allyPlacement` — ver ese comentario.
  const deadCardDelta = ctxAfter.deadHandCardIds.length - ctxBefore.deadHandCardIds.length;
  const deadHandTerm = deadCardDelta < 0 ? -deadCardDelta * WEIGHTS.DEAD_HAND_CARD : 0;

  const handSynergy = (affordableHandCount(ctxAfter) - affordableHandCount(ctxBefore)) * WEIGHTS.HAND_SYNERGY_AFFORDABLE
    + (ctxAfter.player.handInstIds.length - ctxBefore.player.handInstIds.length) * WEIGHTS.HAND_SYNERGY_OPTION
    + (ownAllyStrength(ctxAfter) - ownAllyStrength(ctxBefore)) * WEIGHTS.DEVELOPMENT_ALLY
    - (ownHeroBlockageStrength(ctxAfter) - ownHeroBlockageStrength(ctxBefore)) * WEIGHTS.OWN_HERO_BLOCKAGE
    + (extraSlotValue(ctxAfter) - extraSlotValue(ctxBefore))
    + deadHandTerm;

  const victoryPrep = (victoryPrepCurve(ctxAfter.ownProgress) - victoryPrepCurve(ctxBefore.ownProgress)) * WEIGHTS.VICTORY_PREP;

  // polarity corrige el signo: para intenciones "de urgencia" (evaluate baja al resolverse),
  // resolver el problema debe SUMAR alineación, no restarla (ver IntentionDef.polarity).
  const intentionAlignmentRaw = (chosenIntention.evaluate(ctxAfter) - chosenIntention.evaluate(ctxBefore)) * chosenIntention.polarity;
  // Acotado: evaluate() está calibrado para SELECCIONAR entre intenciones (escala 0-150+), no
  // para sumarse directo a las demás puntuaciones de acción (escala de un dígito a decenas) —
  // sin este límite, una intención con un salto grande podía dominar por completo el resto de
  // términos estructurales (progreso, desarrollo, etc.) en una sola acción.
  const intentionAlignment = Math.max(-20, Math.min(20, intentionAlignmentRaw)) * WEIGHTS.INTENTION;

  const pressureScore = candidate.kind === ActionType.FATE ? computePressureScore(ctxBefore, ctxAfter) : 0;

  // Solo se premia que el encaje SUBA (Aliado recién bien colocado) — nunca se penaliza que
  // baje, porque baja tanto al Vencer (héroe Y Aliados desaparecen a la vez: ya lo recoge
  // OWN_HERO_BLOCKAGE de sobra) como al perder un Aliado por Destino (ya lo recoge
  // DEVELOPMENT_ALLY) — contarlo aquí también sería la misma trampa de gradiente de "el logro
  // se pierde al completarlo" que ya se corrigió con `polarity` para las intenciones.
  const allyPlacement = Math.max(0, allyHeroFit(ctxAfter) - allyHeroFit(ctxBefore)) * WEIGHTS.ALLY_PLACEMENT_FIT;

  const openedNewOptions = progress !== 0
    || vanquishableCount(ctxAfter) > vanquishableCount(ctxBefore)
    || affordableHandCount(ctxAfter) !== affordableHandCount(ctxBefore)
    || ctxAfter.deadHandCardIds.length !== ctxBefore.deadHandCardIds.length;
  const uselessPenalty = candidate.isRepositioning && !openedNewOptions ? WEIGHTS.USELESS_MOVE_PENALTY : 0;

  const total = progress + enemyImpact + economy + handSynergy + victoryPrep + intentionAlignment
    + pressureScore + allyPlacement + uselessPenalty;

  const breakdown: ActionScoreBreakdown = {
    progress, enemyImpact, economy, handSynergy, victoryPrep, intentionAlignment,
    pressureScore, allyPlacement, uselessPenalty, total,
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

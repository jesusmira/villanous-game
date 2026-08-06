// ─── Heurística de IA del Príncipe Juan, registrada como plugin.aiHeuristics ────
// Extraído de core/ai/evaluate.ts. A diferencia de Maléfica/Garfio, el Príncipe Juan
// IGNORA el score de poder genérico: acumular Monedas sin tope ES su condición de victoria,
// así que el "rendimiento decreciente" del genérico no aplica.
import { CardType } from '../../types';
import type { GameState, PlayerState, LocationState, CardInstId, LocationId, LocationDef } from '../../types';
import { getPlugin } from '../registry';
import { CardDefId, EffectId } from '../effectIds';
import { getEffectiveStrength } from '../../engine/stateHelpers';
import { findPeterPan } from '../hook/aiHelpers';
import { HookLocationId, HookObjectiveStep } from '../hook/cards';
import type { OpponentProfile } from '../../ai/opponentModel';

function locHasCurse(state: GameState, ls: LocationState): boolean {
  return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
}

/** Distancia (en saltos) desde `fromId` a cada ubicación alcanzable, vía adjacentIds. */
function bfsDistances(locations: LocationDef[], fromId: LocationId): Map<LocationId, number> {
  const dist = new Map<LocationId, number>([[fromId, 0]]);
  const queue: LocationId[] = [fromId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curDef = locations.find(l => l.id === cur);
    if (!curDef) continue;
    const curDist = dist.get(cur)!;
    for (const adjId of curDef.adjacentIds) {
      if (!dist.has(adjId)) {
        dist.set(adjId, curDist + 1);
        queue.push(adjId);
      }
    }
  }
  return dist;
}

/**
 * FASE 12: ubicación del héroe sin vencer más urgente (para tirar de los Aliados "libres" hacia
 * él, ver PRIORITY_THREAT_PROXIMITY más abajo). Prioridad 3 para Robin Hood/Rey Ricardo (misma
 * jerarquía que sus penalizaciones fijas), prioridad 1 para cualquier otro héroe F4+ sin cubrir.
 * Un héroe ya con Aliados suficientes (allyStr >= heroStr) no necesita tirar de más refuerzos.
 */
function findPriorityTargetLoc(state: GameState, player: PlayerState, plugin: ReturnType<typeof getPlugin>): LocationId | null {
  let bestLoc: LocationId | null = null;
  let bestPriority = 0;
  for (const l of plugin.locations) {
    const ls = player.locationStates[l.id];
    if (ls.heroCardInstIds.length === 0) continue;
    const heroStr = ls.heroCardInstIds.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
    const allyStr = ls.villainCardInstIds
      .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
      .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
    if (allyStr >= heroStr) continue;
    const isPriorityHero = ls.heroCardInstIds.some(id => {
      const defId = state.allCards[id]?.defId;
      return defId === CardDefId.JHON_ROBIN_HOOD || defId === CardDefId.JHON_REY_RICARDO;
    });
    const priority = isPriorityHero ? 3 : (heroStr >= 4 ? 1 : 0);
    if (priority > bestPriority) {
      bestPriority = priority;
      bestLoc = l.id;
    }
  }
  return bestLoc;
}

/** True si hay un héroe con ese defId en cualquier ubicación del reino de `player`. */
function hasHeroInKingdom(state: GameState, player: PlayerState, defId: string): boolean {
  const plugin = getPlugin(player.villainId);
  return plugin.locations.some(l =>
    player.locationStates[l.id].heroCardInstIds.some(id => state.allCards[id]?.defId === defId),
  );
}

/**
 * FASE 17 (curva continua de urgencia): antes POWER_ALMOST_WIN/NEAR_WIN/ADVANTAGE eran
 * umbrales fijos (18+/14-17/10-13) que se sumaban de golpe al cruzar la frontera. Eso creaba
 * un "acantilado": bajar de 18 a 16 de Poder (p. ej. al jugar Encarcelamiento sobre Robin
 * Hood, coste 2) perdía de golpe 120→60 = -60 puntos, muy por encima de CUALQUIER beneficio
 * estructural real de jugar esa carta (~+20/+25, ver HERO_OUTSIDE_PRISON/HERO_STRONG_
 * BLOCKING/OWN_HERO_STRENGTH_PENALTY). Confirmado con un test de diagnóstico reproduciendo
 * la partida real: la IA llegaba a 18/20 de Poder con Robin Hood sin cubrir y 2 copias de
 * Encarcelamiento en mano y NUNCA las jugaba — cualquier carta con coste ≥1 quedaba "congelada"
 * en cuanto se cruzaba un umbral hacia abajo, sin importar lo buena que fuera la jugada.
 * Interpolar linealmente entre los mismos anclajes (0→0, 10→25, 14→60, 18→120, extrapolado
 * más allá de 18 con la misma pendiente) mantiene la MISMA urgencia en los puntos ya
 * validados, pero la hace continua: perder 2 de Poder cerca de un anclaje ahora cuesta una
 * fracción proporcional, no todo el salto entre umbrales.
 */
function powerUrgency(power: number): number {
  const points: [number, number][] = [
    [0, 0],
    [10, WEIGHTS.POWER_ADVANTAGE],
    [14, WEIGHTS.POWER_NEAR_WIN],
    [18, WEIGHTS.POWER_ALMOST_WIN],
  ];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (power <= x1) return y0 + (power - x0) / (x1 - x0) * (y1 - y0);
  }
  const [x0, y0] = points[points.length - 2];
  const [x1, y1] = points[points.length - 1];
  const slope = (y1 - y0) / (x1 - x0);
  return y1 + (power - x1) * slope;
}

// Pesos de la heurística: el Príncipe Juan acumula Poder SIN tope (su condición de
// victoria son 20 Monedas), así que aquí no hay rendimientos decrecientes.
const WEIGHTS = {
  POWER: 2.0,                   // cada moneda vale mucho: es el objetivo de victoria — AUMENTADO
  HAND_CARD: 0.3,              // opciones en mano — AUMENTADO
  ROBIN_HOOD_IN_KINGDOM: -35,   // Robin Hood reduce las ganancias de Poder: muy perjudicial — AUMENTADO (MÁS URGENTE ELIMINARLO)
  // FASE 3: Rey Ricardo bloquea TODAS las cartas de tipo Efecto en TODO el reino mientras
  // viva (Trampa, Intimidación, Encarcelamiento, Apreciados Impuestos — 9 cartas del mazo),
  // no solo en su ubicación (ver blocksEffectPlay en RuleEngine.ts). Antes no tenía peso propio
  // y solo recibía las penalizaciones genéricas de héroe F4+ (-8 -15 = -23), MENOS que Robin
  // Hood (-35) pese a ser igual o más perjudicial — con partidas simuladas se veía vivo 40-50
  // rondas sin que la IA priorizara vencerlo. Ligeramente por encima de Robin Hood porque
  // apagar 9 cartas de golpe es peor que restar 1 Moneda por ganancia.
  REY_RICARDO_IN_KINGDOM: -40,
  HERO_OUTSIDE_PRISON: -8,      // por cada héroe que bloquea ranuras fuera de La Prisión — AUMENTADO
  HERO_STRONG_BLOCKING: -15,    // NUEVO: penalización por héroe F4+ sin vencer

  // FASE 17: bono directo por cada héroe encerrado en La Prisión (Encarcelamiento), en el
  // mismo espíritu que HERO_TROPHY (premiar la neutralización lograda, no solo dejar de
  // penalizar). Sin esto, jugar Encarcelamiento solo se justificaba de forma DERIVADA —
  // quitando HERO_OUTSIDE_PRISON/HERO_STRONG_BLOCKING — y con la curva de powerUrgency() de
  // arriba (ver powerUrgency) ese ahorro seguía sin cubrir el coste de la carta en algunos
  // tramos de Poder, así que la IA nunca la jugaba pese a tener 2 copias en mano y a Robin
  // Hood sin cubrir 10+ rondas seguidas en una partida real. Menor que HERO_TROPHY (8) porque
  // encerrar no es tan completo como Vencer: el héroe sigue "vivo" (penalización fija de
  // kingdom, p. ej. el -1 Poder/ganancia de Robin Hood, sigue aplicando) y puede volver a
  // bloquear ranuras si algo lo saca de la Prisión.
  HERO_IMPRISONED: 7,

  // Coincidir aliados con el héroe de su ubicación: a diferencia de Garfio (NORMAL_HERO_ALLY_MATCH/
  // READY), el Príncipe Juan no tenía ningún término de este tipo — solo las penalizaciones fijas de
  // arriba, que no cambian si hay o no aliados listos junto al héroe. Sin esto, tryMoveItemAlly
  // (mover un aliado YA jugado) no tenía ninguna razón para acercarlo a un héroe: la misma fuerza de
  // aliado puntúa igual en cualquier ubicación, así que un aliado colocado en otro sitio se quedaba
  // ahí para siempre aunque hubiera un héroe esperando cerca sin vencer.
  // OJO: READY debe ser MENOR que quitar HERO_OUTSIDE_PRISON/HERO_STRONG_BLOCKING al vencer de
  // verdad, o la IA se queda "a punto" sin rematar (ver [[project-ai-gradient-trap]]).
  //
  // FASE 2 (trap de gradiente en la inversión de Aliados): jugar el PRIMER Aliado contra un
  // héroe que necesita 2+ Aliados para caer puntuaba negativo en solitario (paga su coste de
  // Poder sin poder rematar el Vencer en la misma acción), así que ni siquiera con el rollout
  // profundo de Fase 1 la IA daba ese primer paso — exactamente el mismo patrón que
  // [[project_ai_gradient_trap]] pero en la inversión de Aliados en vez de en los bonos de
  // "estar a punto". Con 1.0 el primer Aliado barato (coste 2, fuerza 2: Lelo/Sir Hiss/Arqueros
  // Lobo) contra CUALQUIER héroe con fuerza > 2 quedaba en negativo (-4 coste -0.3 mano +1.6
  // fuerza +2.0 match = -0.7). Con 1.5 el mismo cálculo da +0.05: ya no hace falta que el
  // Aliado alcance para que jugarlo sea rentable.
  HERO_ALLY_MATCH: 1.5,
  HERO_READY_TO_VANQUISH: 5,

  // FASE 8c: trofeo permanente por cada héroe vencido — mismo patrón ya validado en Garfio
  // (HERO_TROPHY), replicado aquí porque a Jhon le faltaba. Comprobado con
  // ai-vanquish-scoring.test.ts que HERO_ALLY_MATCH+HERO_READY_TO_VANQUISH, al perderse junto
  // con los Aliados gastados, dejaban a Fraile Tuck (F3), Little John (F5) y Lady Kluck (F6)
  // en negativo neto (vencerlos puntuaba peor que no vencerlos) pese a que HERO_STRONG_BLOCKING
  // ya no aporta nada en ese momento (solo penaliza mientras el héroe sigue SIN cubrir).
  // Se cuenta desde fateDiscardInstIds — igual que en Garfio — así que NO es una bandera fija:
  // si el héroe reaparece en el reino (redibujado por Destino, Rival Digno...), sale del
  // descarte y el trofeo desaparece solo, sin ceguera ante la amenaza que vuelve (comprobado
  // con los tests de reaparición). Toby es la única excepción: su habilidad lo devuelve
  // directamente al mazo de Destino en vez de quedarse en el descarte, así que nunca genera
  // trofeo — no hace falta: con un solo Aliado barato ya es rentable vencerlo (ver tests).
  HERO_TROPHY: 8,

  // FASE 10: colchón defensivo — antes, jugar un Aliado SIN ningún héroe presente puntuaba
  // siempre negativo (paga el coste sin ningún HERO_ALLY_MATCH/READY que lo compense, ya que
  // esos solo aplican con heroStr>0), así que la IA nunca construía ejército por adelantado:
  // solo reaccionaba DESPUÉS de que ya hubiera un héroe — y para entonces, bajo asedio de
  // Robin Hood/Rey Ricardo, la economía ya podía estar ahogada (ver partida real). Premia
  // Fuerza de Aliados en ubicaciones SIN héroe, con techo GLOBAL (no por ubicación, para que
  // no compense repartir Aliados en varios sitios solo para cobrar el tope varias veces) y sin
  // marginal más allá de él, para no invitar a acaparar Aliados sin límite a costa del Poder
  // (que es la condición de victoria real).
  // Es mutuamente excluyente con HERO_ALLY_MATCH: en cuanto aparece un héroe en una ubicación,
  // esa Fuerza deja de contar aquí y pasa a contar en el bucle de HERO_ALLY_MATCH de abajo —
  // así que no hay un bono que se pierda de golpe al aparecer o al vencer al héroe (comprobado
  // con ai-vanquish-scoring.test.ts).
  STANDING_ARMY_CAP: 6,
  STANDING_ARMY_PER_POINT: 1.5,
  // FASE 13: el tope de arriba era fijo sin importar qué tan agresivo sea el rival EN ESTA
  // PARTIDA. OpponentProfile (histórico de partidas, ver opponentModel.ts) sabe cuántas veces
  // de media el humano ha lanzado Destino contra la IA jugando su villano actual — un rival que
  // dispara Destino muy seguido merece más reserva de Aliados lista de antemano. Tope adicional
  // de hasta +6 (total 12), solo con datos suficientes (2+ partidas); sin perfil, no cambia nada.
  STANDING_ARMY_CAP_EXTRA_MAX: 6,

  // FASE 12: tryMoveItemAlly (mover un Aliado ya jugado) solo compara saltos adyacentes por su
  // valor inmediato en evaluateState; si la amenaza prioritaria está a 2+ saltos, el primer salto
  // intermedio no puntuaba mejor por sí solo (STANDING_ARMY_* es una suma global, no cambia entre
  // ubicaciones sin héroe) y el Aliado se quedaba parado ahí — visto en partida real con Rey
  // Ricardo aguantando muchas rondas sin ningún Aliado acercándose. Premia Fuerza de Aliado
  // "libre" (en ubicación sin héroe) según cercanía a la amenaza más urgente, decreciente con la
  // distancia, para que cada salto hacia ella puntúe mejor que quedarse quieto.
  PRIORITY_THREAT_PROXIMITY: 0.6,

  // FASE 2: héroe que retiene Monedas robadas (Little John / Robar a los Ricos) — vencerlo
  // las devuelve íntegras (ver onVanquish en resolvers.ts). El rival puede reutilizar el propio
  // mazo de Destino del Príncipe Juan contra él para sangrarlo indefinidamente (Robar a los
  // Ricos x3 copias); sin este término, la IA valoraba a ese héroe igual que a cualquier otro de
  // su misma Fuerza y nunca priorizaba recuperar SU PROPIO Poder robado — quedándose atascada
  // en bucles de "gana 2 → le roban 4" para siempre. Escala con el progreso de la inversión
  // (0 sin Aliados, completo al alcanzar la Fuerza del héroe) para no romper el equilibrio de
  // HERO_ALLY_MATCH de arriba, solo desempatar A FAVOR de recuperar Poder robado.
  STORED_POWER_RECOVERY_URGENCY: 0.8,

  // FASE 3: Urgencia de victoria según proximidad a 20 poder — puntos de anclaje para
  // powerUrgency() (interpolación lineal continua, ver función más abajo). Mismos valores
  // que la versión anterior (a umbrales fijos), conservados como anclas de la curva.
  POWER_ALMOST_WIN: 120,        // 18+ poder: victoria muy cercana — AUMENTADO
  POWER_NEAR_WIN: 60,           // 14 poder: ganando — AUMENTADO
  POWER_ADVANTAGE: 25,          // 10 poder: ventaja clara — AUMENTADO

  // ── Conciencia del avance de Maléfica (cuando es la rival) ──
  MALEFICENT_CURSE_IN_PLAY: -28, // NUEVO: cada maldición amenaza mucho
  MALEFICENT_CURSE_FINAL: -50,   // NUEVO: 3+ maldiciones = casi derrota

  // FASE 15: Conciencia del avance de Garfio (cuando es el rival) — antes Jhon no tenía nada
  // equivalente a esto (solo Maléfica lo tenía en su propia heurística, ver maleficent/ai.ts),
  // así que al enfrentarse a Garfio solo se apoyaba en la señal genérica de evaluate.ts
  // (oppStrategicProgress, más gruesa: 2 umbrales fijos de Fuerza en Jolly Roger). Mismos
  // valores ya validados en maleficent/ai.ts — misma escala de amenaza, sin retuning ad hoc.
  HOOK_HANGMAN_UNLOCKED: -50,
  HOOK_PP_IN_KINGDOM: -25,
  HOOK_PP_VANQUISHABLE: -35,
  HOOK_PP_AT_JOLLY_ROGER: -45,
};

export function scoreState(
  state: GameState, player: PlayerState, _genericPowerScore?: number, profile?: OpponentProfile,
): number {
  const plugin = getPlugin(player.villainId);
  let v = player.power * WEIGHTS.POWER;
  v += player.handInstIds.length * WEIGHTS.HAND_CARD;

  // FASE 3/17: Urgencia escalada según proximidad a 20 poder — curva continua, ver
  // powerUrgency() arriba (evita el acantilado de los umbrales fijos).
  v += powerUrgency(player.power);

  // Robin Hood en el reino es muy perjudicial: penalizar
  if (hasHeroInKingdom(state, player, CardDefId.JHON_ROBIN_HOOD)) v += WEIGHTS.ROBIN_HOOD_IN_KINGDOM;

  // Rey Ricardo en el reino bloquea todas las cartas de Efecto: penalizar (ver WEIGHTS arriba)
  if (hasHeroInKingdom(state, player, CardDefId.JHON_REY_RICARDO)) v += WEIGHTS.REY_RICARDO_IN_KINGDOM;

  // Héroes en la Prisión no bloquean ranuras: menos urgente vencerlos
  const heroesOutsidePrison = plugin.locations
    .filter(l => !l.heroesNeverCoverSlots)
    .reduce((n, l) => n + player.locationStates[l.id].heroCardInstIds.length, 0);
  v += heroesOutsidePrison * WEIGHTS.HERO_OUTSIDE_PRISON;

  // FASE 17: bono directo por cada héroe ya encerrado (ver WEIGHTS.HERO_IMPRISONED arriba).
  const heroesImprisoned = plugin.locations
    .filter(l => l.heroesNeverCoverSlots)
    .reduce((n, l) => n + player.locationStates[l.id].heroCardInstIds.length, 0);
  v += heroesImprisoned * WEIGHTS.HERO_IMPRISONED;

  // NUEVO: penalizar héroes F4+ que bloquean sin poder vencer
  // FASE 15: héroes en La Prisión (heroesNeverCoverSlots) no bloquean ranuras, pero siguen
  // aplicando su penalización fija de kingdom (Robin Hood -1 Poder/turno, Rey Ricardo bloquea
  // Efectos) mientras vivan — y antes quedaban FUERA de este bucle entero, así que ningún
  // Aliado invertido en vencerlos ahí sumaba nada (ni HERO_ALLY_MATCH, ni HERO_READY_TO_
  // VANQUISH, ni recuperar Poder robado si el héroe encerrado era Little John). Con solo el
  // bono fijo de arriba (que no cambia con la inversión) no hay ningún gradiente que empuje a
  // rematarlos: verificado en partidas reales que Robin Hood quedaba encarcelado y sin vencer
  // 21+ rondas, drenando Poder cada turno sin que la IA volviera a por él. Solo se sigue
  // excluyendo HERO_STRONG_BLOCKING (penalización específica de "bloquea ranuras"), que no
  // aplica porque en La Prisión no bloquean nada.
  for (const l of plugin.locations) {
    const ls = player.locationStates[l.id];
    if (ls.heroCardInstIds.length === 0) continue;
    const allyStr = ls.villainCardInstIds
      .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
      .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);

    // Coincidir aliados con los héroes de esta ubicación (ver WEIGHTS.HERO_ALLY_MATCH arriba):
    // da a tryMoveItemAlly una razón real para acercar un aliado ya jugado a un héroe sin vencer.
    const heroStr = ls.heroCardInstIds
      .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
    v += Math.min(allyStr, heroStr) * WEIGHTS.HERO_ALLY_MATCH;
    if (allyStr >= heroStr) v += WEIGHTS.HERO_READY_TO_VANQUISH;

    // Monedas robadas retenidas en héroes de esta ubicación: urgencia extra de recuperarlas,
    // proporcional a cuánta inversión en Aliados ya se ha hecho aquí (0 al empezar, completa
    // cuando ya alcanza para vencer).
    const storedHere = ls.heroCardInstIds
      .reduce((sum, id) => sum + (state.allCards[id]?.storedPower ?? 0), 0);
    if (storedHere > 0 && heroStr > 0) {
      v += Math.min(allyStr / heroStr, 1) * storedHere * WEIGHTS.STORED_POWER_RECOVERY_URGENCY;
    }

    if (l.heroesNeverCoverSlots) continue;
    const strongHeroes = ls.heroCardInstIds.filter(id => getEffectiveStrength(state, id) >= 4);
    for (const heroId of strongHeroes) {
      if (allyStr < getEffectiveStrength(state, heroId)) {
        v += WEIGHTS.HERO_STRONG_BLOCKING;
      }
    }
  }

  // FASE 10: colchón defensivo en ubicaciones SIN héroe (ver WEIGHTS.STANDING_ARMY_*).
  // FASE 13: tope ampliado según la agresividad histórica del rival (ver WEIGHTS.STANDING_ARMY_
  // CAP_EXTRA_MAX). fateCount/gamesPlayed = Destinos lanzados de media por partida.
  const standingArmyStr = plugin.locations
    .filter(l => player.locationStates[l.id].heroCardInstIds.length === 0)
    .reduce((sum, l) => sum + player.locationStates[l.id].villainCardInstIds
      .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
      .reduce((s2, id) => s2 + getEffectiveStrength(state, id), 0), 0);
  const oppForProfile = state.players.find(pl => pl.id !== player.id);
  const villainProfile = oppForProfile ? profile?.byVillain[oppForProfile.villainId] : undefined;
  const extraCap = villainProfile && villainProfile.gamesPlayed >= 2
    ? Math.min(villainProfile.fateCount / villainProfile.gamesPlayed, WEIGHTS.STANDING_ARMY_CAP_EXTRA_MAX)
    : 0;
  v += Math.min(standingArmyStr, WEIGHTS.STANDING_ARMY_CAP + extraCap) * WEIGHTS.STANDING_ARMY_PER_POINT;

  // FASE 12: tirar de los Aliados libres hacia la amenaza sin vencer más urgente (ver
  // WEIGHTS.PRIORITY_THREAT_PROXIMITY y findPriorityTargetLoc arriba).
  const priorityTargetLoc = findPriorityTargetLoc(state, player, plugin);
  if (priorityTargetLoc) {
    const distances = bfsDistances(plugin.locations, priorityTargetLoc);
    for (const l of plugin.locations) {
      const ls = player.locationStates[l.id];
      if (ls.heroCardInstIds.length > 0) continue; // ya cuenta en HERO_ALLY_MATCH arriba
      const allyStrHere = ls.villainCardInstIds
        .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
        .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
      if (allyStrHere === 0) continue;
      const dist = distances.get(l.id) ?? 99;
      v += (allyStrHere * WEIGHTS.PRIORITY_THREAT_PROXIMITY) / (1 + dist);
    }
  }

  // FASE 8c: trofeo permanente por cada héroe vencido — ver comentario en WEIGHTS.HERO_TROPHY.
  const trophies = player.fateDiscardInstIds.filter(
    id => state.allCards[id]?.cardType === CardType.HERO,
  ).length;
  v += trophies * WEIGHTS.HERO_TROPHY;

  v += scoreOppAwareness(state, player);

  return v;
}

/**
 * FASE 2 (descarte inteligente): cartas del Príncipe Juan que conviene ciclar.
 * A diferencia de Garfio, casi nada suyo está muerto para siempre (Encarcelamiento vuelve a
 * servir cuando aparezca un héroe, Trampa cuando tenga aliados...), así que solo se marcan
 * cartas que ahora mismo no aportan y que el rebarajado devolverá al mazo:
 * - Condiciones duplicadas: con una copia en mano basta; la segunda solo atasca.
 * - Avaricia con el rival muy lejos de 6 Monedas: jugarla no haría nada.
 * - FASE 7: cualquier carta de Efecto mientras Rey Ricardo viva en el reino — quedan
 *   injugables por completo (ver blocksEffectPlay en RuleEngine.ts), así que ciclarlas es
 *   mejor que dejarlas atascadas en mano sin poder usarse hasta que se le venza.
 * - FASE 10: TODA la mano, si Robin Hood o Rey Ricardo están ahogando la economía Y ninguna
 *   carta en mano es asequible con el Poder actual. Confirmado en partida real: con esos dos
 *   héroes presentes el Poder se queda en 0 varias rondas seguidas mientras la mano se llena
 *   de Aliados de coste 3 que nunca se pueden pagar — como ninguno está "formalmente muerto"
 *   (no son Efectos, no son condiciones duplicadas), antes no se descartaban jamás. Se limita
 *   a estos dos disparadores concretos (en vez de "cualquier turno con Poder bajo") para no
 *   descartar la mano inicial del turno 1 solo por empezar en 0 de Poder, que es normal.
 * - FASE 14: un Aliado en mano "dominado" por otro Aliado en la MISMA mano (coste igual o menor
 *   Y Fuerza igual o mayor, estrictamente peor en al menos uno de los dos) — antes solo se
 *   ciclaba cuando NADA en mano era asequible; una mano con opciones mediocres pero técnicamente
 *   jugables nunca se refrescaba. Comparar solo dentro de la misma mano (no contra Aliados ya en
 *   juego) evita ciclar la única copia disponible de algo. Dos copias idénticas no se dominan
 *   entre sí (ninguna es estrictamente mejor), así que ambas se conservan.
 */
export function deadHandCards(state: GameState, p: PlayerState): CardInstId[] {
  const out: CardInstId[] = [];
  const opp = state.players.find(pl => pl.id !== p.id);
  const reyPresent = hasHeroInKingdom(state, p, CardDefId.JHON_REY_RICARDO);
  const robinPresent = hasHeroInKingdom(state, p, CardDefId.JHON_ROBIN_HOOD);

  const noneAffordable = (reyPresent || robinPresent) && p.handInstIds.length > 0
    && p.handInstIds.every(id => {
      const c = state.allCards[id];
      if (!c) return true;
      const cost = Math.max(0, c.baseCost + c.costModifier);
      return cost > p.power;
    });

  const seenCondNames = new Set<string>();
  for (const id of p.handInstIds) {
    const c = state.allCards[id];
    if (!c) continue;
    if (noneAffordable) { out.push(id); continue; }
    if (reyPresent && c.cardType === CardType.EFFECT) { out.push(id); continue; }
    // Condición duplicada (misma carta, p. ej. 2ª Avaricia o 2ª Cobardía) → ciclar la extra.
    if (c.cardType === CardType.CONDITION) {
      if (seenCondNames.has(c.name)) { out.push(id); continue; }
      seenCondNames.add(c.name);
    }
    // Avaricia: "si otro jugador tiene 6+ Monedas". Con el rival por debajo de 3, hoy no
    // dispara — mejor ciclarla y recuperarla del rebarajado cuando el rival acumule.
    if (opp && opp.power < 3 && c.effectIds.includes(EffectId.JHON_AVARICIA)) {
      out.push(id);
      continue;
    }
    // NOTA (FASE 17, revertido): se probó marcar Encarcelamiento como carta muerta cuando no
    // queda ningún Héroe elegible en el reino, pero rompía el invariante "Vencer nunca puntúa
    // peor que no vencer" (ai-vanquish-scoring.test.ts): al vencer al ÚNICO héroe presente, una
    // copia de Encarcelamiento en mano se quedaba sin objetivo y su nueva penalización de
    // DEAD_HAND_CARD (-3, ver evaluate.ts) podía superar la ganancia estructural de Vencer,
    // haciendo que rematar puntuara peor que no hacerlo — justo el "trap de gradiente" que este
    // archivo existe para evitar. No merece la pena perseguir este ciclado fino a costa de ese
    // invariante ya validado; el fallback de Encarcelamiento en efects.ts ya deja claro en el
    // log cuándo no hizo nada ("no hay Héroes disponibles"), y powerUrgency()/HERO_IMPRISONED
    // arriba son los que de verdad resuelven el bug real (Robin Hood nunca encarcelado).
    // FASE 14: Aliado dominado por otro Aliado de la misma mano (ver comentario arriba).
    if (c.cardType === CardType.ALLY) {
      const cost = Math.max(0, c.baseCost + c.costModifier);
      const strength = c.baseStrength ?? 0;
      const isDominated = p.handInstIds.some(otherId => {
        if (otherId === id) return false;
        const other = state.allCards[otherId];
        if (other?.cardType !== CardType.ALLY) return false;
        const otherCost = Math.max(0, other.baseCost + other.costModifier);
        const otherStrength = other.baseStrength ?? 0;
        return otherCost <= cost && otherStrength >= strength
          && (otherCost < cost || otherStrength > strength);
      });
      if (isDominated) out.push(id);
    }
  }
  return out;
}

function scoreOppAwareness(state: GameState, player: PlayerState): number {
  let v = 0;
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

  // ── Conciencia del avance de Garfio, si es el rival (ver WEIGHTS.HOOK_* arriba) ──
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

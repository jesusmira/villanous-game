// ─── Simulador headless IA vs IA ─────────────────────────────────────────────
// Mide si las IAs son capaces de CERRAR partidas: enfrenta a los villanos entre sí
// y reporta ganador, nº de rondas y partidas estancadas (nadie gana en el límite).
//
//   npx tsx scripts/simulate.ts              # 6 partidas por emparejamiento
//   npx tsx scripts/simulate.ts 20           # 20 partidas por emparejamiento
//   npx tsx scripts/simulate.ts 10 hook maleficent   # solo ese emparejamiento
//
import { createInitialState } from '../src/core/engine/GameEngine';
import { runAIStep } from '../src/core/ai/runAIStep';
import { getWinProgress } from '../src/core/ai/intent/context';
import { CardType } from '../src/core/types';
import type { GameState, VillainId } from '../src/core/types';
import type { TurnAudit } from '../src/core/ai/intent/types';

const MAX_AI_STEPS = 300; // ~150 rondas; si nadie ha ganado, la partida está estancada

// ─── Informe agregado (Fase 1 del plan de mejora de IA) ─────────────────────────
// El TurnAudit ya se calcula en cada turno de IA (runAIStep) pero antes se descartaba —
// aquí se recoge de TODAS las partidas de esta tanda para sacar, en un solo informe, lo que
// antes había que encontrar leyendo transcripciones sueltas a mano: cartas que se quedan
// quietas en mano, retrocesos de progreso propio, errores de reglas y huecos de puntuación.
const STUCK_HAND_THRESHOLD = 4; // turnos propios consecutivos con la carta en mano sin jugarse

const stuckCards = new Map<string, { villainId: VillainId; name: string; maxIdle: number; occurrences: number }>();
const progressRegressions = new Map<VillainId, number>();
const ruleErrorCounts = new Map<string, number>();
const scoreGaps = new Map<VillainId, { sum: number; n: number }>();
const ignoredBeatsChosen = new Map<VillainId, { count: number; examples: string[] }>();

function recordStuck(villainId: VillainId, name: string, idleTurns: number): void {
  const key = `${villainId}::${name}`;
  const entry = stuckCards.get(key);
  if (entry) { entry.occurrences++; entry.maxIdle = Math.max(entry.maxIdle, idleTurns); }
  else stuckCards.set(key, { villainId, name, maxIdle: idleTurns, occurrences: 1 });
}

function recordRegression(villainId: VillainId): void {
  progressRegressions.set(villainId, (progressRegressions.get(villainId) ?? 0) + 1);
}

function recordRuleError(villainId: VillainId, message: string): void {
  const key = `${villainId}::${message}`;
  ruleErrorCounts.set(key, (ruleErrorCounts.get(key) ?? 0) + 1);
}

function recordScoreGap(villainId: VillainId, gap: number): void {
  const e = scoreGaps.get(villainId) ?? { sum: 0, n: 0 };
  e.sum += gap; e.n += 1;
  scoreGaps.set(villainId, e);
}

function recordIgnoredBeats(villainId: VillainId, label: string): void {
  const e = ignoredBeatsChosen.get(villainId) ?? { count: 0, examples: [] };
  e.count += 1;
  if (e.examples.length < 3) e.examples.push(label);
  ignoredBeatsChosen.set(villainId, e);
}

/** Vuelca en los agregados globales lo que deja ver el audit de un turno de IA: cartas quietas en
 *  mano, retroceso de progreso propio, errores de reglas, hueco de puntuación y alternativas
 *  ignoradas que puntuaban más que lo elegido. */
function processAudit(
  audit: TurnAudit,
  finalState: GameState,
  villainOf: Map<string, VillainId>,
  handWatch: Map<string, Map<string, { name: string; idleTurns: number }>>,
  lastProgress: Map<string, number>,
): void {
  const villainId = villainOf.get(audit.playerId);
  if (!villainId) return;

  const player = finalState.players.find(p => p.id === audit.playerId);
  if (player) {
    const prevMap = handWatch.get(audit.playerId) ?? new Map();
    const nextMap = new Map<string, { name: string; idleTurns: number }>();
    for (const cardId of player.handInstIds) {
      const card = finalState.allCards[cardId];
      if (!card) continue;
      // Las Condiciones no se "juegan" — se disparan solas por reacción a lo que haga el rival
      // (ver conditionTrigger). Medirlas igual que una carta de elección activa es un falso
      // positivo: ya tienen su propia regla de caducidad en getDeadHandCards (context.ts).
      if (card.cardType === CardType.CONDITION) continue;
      const idleTurns = (prevMap.get(cardId)?.idleTurns ?? 0) + 1;
      nextMap.set(cardId, { name: card.name, idleTurns });
    }
    for (const [cardId, entry] of prevMap) {
      if (!nextMap.has(cardId) && entry.idleTurns >= STUCK_HAND_THRESHOLD) {
        recordStuck(villainId, entry.name, entry.idleTurns);
      }
    }
    handWatch.set(audit.playerId, nextMap);
  }

  const progress = getWinProgress(finalState, audit.playerId);
  const prevProgress = lastProgress.get(audit.playerId);
  if (prevProgress !== undefined && progress < prevProgress - 1e-6) recordRegression(villainId);
  lastProgress.set(audit.playerId, progress);

  for (const msg of audit.ruleErrors) recordRuleError(villainId, msg);

  recordScoreGap(villainId, audit.turnScoreOptimal - audit.turnScoreAchieved);

  const chosenBest = audit.actionsTaken.reduce((m, a) => Math.max(m, a.total), 0);
  const ignoredBest = audit.ignoredAlternatives.reduce((m, a) => Math.max(m, a.total), -Infinity);
  if (audit.ignoredAlternatives.length > 0 && ignoredBest > chosenBest + 0.5) {
    const label = audit.ignoredAlternatives.find(a => a.total === ignoredBest)?.label ?? '?';
    recordIgnoredBeats(villainId, label);
  }
}

function flushHandWatch(
  villainOf: Map<string, VillainId>,
  handWatch: Map<string, Map<string, { name: string; idleTurns: number }>>,
): void {
  for (const [playerId, map] of handWatch) {
    const villainId = villainOf.get(playerId);
    if (!villainId) continue;
    for (const entry of map.values()) {
      if (entry.idleTurns >= STUCK_HAND_THRESHOLD) recordStuck(villainId, entry.name, entry.idleTurns);
    }
  }
}

function printAggregateReport(): void {
  console.log(`\n\n=== Informe agregado de IA (todas las partidas de esta tanda) ===`);

  console.log(`\n· Cartas quietas en mano (≥${STUCK_HAND_THRESHOLD} turnos propios sin jugarse):`);
  const stuckSorted = [...stuckCards.values()].sort((a, b) => b.maxIdle - a.maxIdle);
  if (stuckSorted.length === 0) console.log('  (ninguna)');
  for (const s of stuckSorted.slice(0, 25)) {
    console.log(`  ${s.villainId}: "${s.name}" — hasta ${s.maxIdle} turnos quieta (visto ${s.occurrences}×)`);
  }

  console.log(`\n· Retrocesos de progreso propio (ownProgress baja entre 2 turnos del mismo jugador):`);
  if (progressRegressions.size === 0) console.log('  (ninguno)');
  for (const [v, n] of progressRegressions) console.log(`  ${v}: ${n} retroceso(s)`);

  console.log(`\n· Errores de reglas detectados por la IA:`);
  if (ruleErrorCounts.size === 0) console.log('  (ninguno)');
  for (const [key, n] of ruleErrorCounts) console.log(`  ${key} × ${n}`);

  console.log(`\n· Hueco medio puntuación óptima explorada vs lograda (por villano):`);
  if (scoreGaps.size === 0) console.log('  (sin datos)');
  for (const [v, e] of scoreGaps) console.log(`  ${v}: ${(e.sum / e.n).toFixed(1)} de media (${e.n} turnos)`);

  console.log(`\n· Turnos donde una alternativa ignorada puntuaba mejor que lo elegido:`);
  if (ignoredBeatsChosen.size === 0) console.log('  (ninguno)');
  for (const [v, e] of ignoredBeatsChosen) console.log(`  ${v}: ${e.count} vez/veces — ej.: ${e.examples.join(' | ')}`);
}

interface GameResult {
  winner: VillainId | null;   // null = estancada
  rounds: number;
  log: string[];
  finalState: GameState;
}

/** Volcado breve del estado de un jugador para diagnosticar partidas estancadas. */
function dumpPlayer(s: GameState, idx: number): string[] {
  const p = s.players[idx];
  const lines: string[] = [];
  lines.push(`${p.name} — poder ${p.power}, peón en ${p.pawnLocationId}`);
  lines.push(`  mano: ${p.handInstIds.map(id => s.allCards[id]?.name ?? '?').join(', ') || '(vacía)'}`);
  for (const [locId, ls] of Object.entries(p.locationStates)) {
    const heroes = ls.heroCardInstIds.map(id => {
      const c = s.allCards[id];
      return `${c?.name}(F${(c?.baseStrength ?? 0) + (c?.strengthModifier ?? 0)})`;
    });
    const cards = ls.villainCardInstIds.map(id => s.allCards[id]?.name);
    const curse = ls.villainCardInstIds.some(id => s.allCards[id]?.cardType === CardType.CURSE);
    if (heroes.length || cards.length) {
      lines.push(`  ${locId}${ls.isLocked ? ' [CERRADA]' : ''}${curse ? ' [MALDITA]' : ''}: héroes=[${heroes.join(', ')}] cartas=[${cards.join(', ')}]`);
    }
  }
  return lines;
}

function playGame(v1: VillainId, v2: VillainId, startingPlayerIndex: 0 | 1): GameResult {
  let s = createInitialState({
    player1: { villainId: v1, isAI: true, name: `IA-${v1}` },
    player2: { villainId: v2, isAI: true, name: `IA-${v2}` },
    startingPlayerIndex,
  });

  const villainOf = new Map(s.players.map(p => [p.id, p.villainId]));
  const handWatch = new Map<string, Map<string, { name: string; idleTurns: number }>>();
  const lastProgress = new Map<string, number>();

  for (let step = 0; step < MAX_AI_STEPS && !s.winner; step++) {
    const { final, audit } = runAIStep(s);
    if (final === s && !final.winner) {
      // Sin progreso: estado atascado (pendiente sin resolver o turno vacío). Abortamos.
      flushHandWatch(villainOf, handWatch);
      return { winner: null, rounds: s.roundNumber, log: s.log, finalState: s };
    }
    if (audit) processAudit(audit, final, villainOf, handWatch, lastProgress);
    s = final;
  }

  flushHandWatch(villainOf, handWatch);

  const winnerVillain = s.winner
    ? s.players.find(p => p.id === s.winner)?.villainId ?? null
    : null;
  return { winner: winnerVillain, rounds: s.roundNumber, log: s.log, finalState: s };
}

function runMatchup(v1: VillainId, v2: VillainId, games: number): void {
  const wins: Record<string, number> = { [v1]: 0, [v2]: 0, estancada: 0 };
  const roundsList: number[] = [];
  let sampleStalled: GameResult | null = null;

  for (let i = 0; i < games; i++) {
    const r = playGame(v1, v2, (i % 2) as 0 | 1);
    if (r.winner) {
      wins[r.winner]++;
      roundsList.push(r.rounds);
    } else {
      wins.estancada++;
      if (!sampleStalled) sampleStalled = r;
    }
  }

  const avg = roundsList.length > 0
    ? (roundsList.reduce((a, b) => a + b, 0) / roundsList.length).toFixed(1)
    : '—';
  console.log(`\n=== ${v1} vs ${v2} (${games} partidas) ===`);
  console.log(`  ${v1}: ${wins[v1]}  |  ${v2}: ${wins[v2]}  |  estancadas: ${wins.estancada}`);
  console.log(`  rondas medias (con ganador): ${avg}`);
  if (sampleStalled) {
    console.log(`  · últimas líneas de una partida estancada:`);
    for (const line of sampleStalled.log.slice(-8)) console.log(`      ${line}`);
    console.log(`  · estado final de la partida estancada:`);
    for (const idx of [0, 1]) {
      for (const line of dumpPlayer(sampleStalled.finalState, idx)) console.log(`      ${line}`);
    }
  }
}

const games = Number(process.argv[2]) || 6;
const only = process.argv.length >= 5
  ? [[process.argv[3] as VillainId, process.argv[4] as VillainId]] as const
  : ([
      ['hook', 'maleficent'], ['hook', 'jhon'], ['maleficent', 'jhon'],
      ['queen', 'hook'], ['queen', 'maleficent'], ['queen', 'jhon'],
    ] as const); // los 6 emparejamientos posibles entre los 4 villanos — antes faltaba la Reina

const t0 = Date.now();
for (const [a, b] of only) runMatchup(a, b, games);
console.log(`\nTiempo total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
printAggregateReport();

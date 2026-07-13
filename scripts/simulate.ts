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
import { CardType } from '../src/core/types';
import type { GameState, VillainId } from '../src/core/types';

const MAX_AI_STEPS = 300; // ~150 rondas; si nadie ha ganado, la partida está estancada

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

  for (let step = 0; step < MAX_AI_STEPS && !s.winner; step++) {
    const { final } = runAIStep(s);
    if (final === s && !final.winner) {
      // Sin progreso: estado atascado (pendiente sin resolver o turno vacío). Abortamos.
      return { winner: null, rounds: s.roundNumber, log: s.log, finalState: s };
    }
    s = final;
  }

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
  : ([['hook', 'maleficent'], ['hook', 'jhon'], ['maleficent', 'jhon']] as const);

const t0 = Date.now();
for (const [a, b] of only) runMatchup(a, b, games);
console.log(`\nTiempo total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

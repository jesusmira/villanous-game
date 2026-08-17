// ─── Diagnóstico: ¿el motor actual ya cumple las reglas de "coherencia humana"? ─────
// No cambia ningún comportamiento — solo instrumenta runAIStep para medir, sobre partidas
// IA-vs-IA reales, si el motor YA satisface lo que se pidió como "módulo de Coherencia Humana":
// nunca perder un turno, nunca moverse sin sentido, jugar Destino cuando el rival está cerca de
// ganar, vencer al héroe que bloquea de verdad, y descartar mano muerta. Generaliza el patrón de
// scripts/_diag_maleficent.ts a los 3 villanos en vez de reescribir el motor a ciegas.
// Uso: npx tsx scripts/_diag_human_coherence.ts [partidas por emparejamiento]
import { createInitialState } from '../src/core/engine/GameEngine';
import { runAIStep } from '../src/core/ai/runAIStep';
import { getDeadHandCards, getWinProgress } from '../src/core/ai/intent/context';
import { getPlugin } from '../src/core/villains/registry';
import { ActionType } from '../src/core/types';
import type { GameState, VillainId } from '../src/core/types';

const GAMES = Number(process.argv[2]) || 30;
const MAX_AI_STEPS = 300;
// Mismo umbral que usa slowEnemyFate (universalIntentions.ts) para considerar "el rival está
// cerca de ganar" — reusar el ya calibrado en vez de inventar uno nuevo para este diagnóstico.
const RIVAL_CERCA_DE_GANAR = 70;

interface VillainStats {
  games: number;
  wins: number;
  turns: number;
  emptyTurns: number;
  movedButDidNothing: number;
  fateUrgentOpportunities: number;
  fateUrgentSkipped: number;
  deadHandTurns: number;
  deadHandUndiscarded: number;
  gamesWithStructuralThreat: number;
  structuralThreatAliveAtEnd: number;
}

function newStats(): VillainStats {
  return {
    games: 0, wins: 0, turns: 0, emptyTurns: 0, movedButDidNothing: 0,
    fateUrgentOpportunities: 0, fateUrgentSkipped: 0, deadHandTurns: 0, deadHandUndiscarded: 0,
    gamesWithStructuralThreat: 0, structuralThreatAliveAtEnd: 0,
  };
}

const stats: Record<VillainId, VillainStats> = {
  hook: newStats(), maleficent: newStats(), jhon: newStats(),
};

function playGame(v1: VillainId, v2: VillainId, startingPlayerIndex: 0 | 1): void {
  let s: GameState = createInitialState({
    player1: { villainId: v1, isAI: true, name: `IA-${v1}` },
    player2: { villainId: v2, isAI: true, name: `IA-${v2}` },
    startingPlayerIndex,
  });

  for (let step = 0; step < MAX_AI_STEPS && !s.winner; step++) {
    const oppProgressBefore: Partial<Record<VillainId, number>> = {};
    for (const p of s.players) oppProgressBefore[p.villainId] = getWinProgress(s, p.id);

    const { final, audit } = runAIStep(s);
    if (final === s && !final.winner) break; // atascada

    if (audit) {
      const player = final.players.find(p => p.id === audit.playerId)!;
      const opponent = final.players.find(p => p.id !== audit.playerId);
      const st = stats[player.villainId];
      st.turns++;

      // Regla: nunca perder un turno.
      const emptyTurn = audit.actionsTaken.length === 0;
      if (emptyTurn) st.emptyTurns++;

      // Regla: nunca moverse sin sentido — se movió Y el turno no hizo nada en ACTIVATE.
      const beforePlayer = s.players.find(p => p.id === audit.playerId)!;
      const moved = beforePlayer.pawnLocationId !== player.pawnLocationId;
      if (moved && emptyTurn) st.movedButDidNothing++;

      // Regla: Fate si el rival está cerca de ganar. Aproximación: la ubicación donde terminó el
      // turno tiene una ranura de tipo FATE definida (no comprueba si esa ranura concreta estaba
      // libre de héroe bloqueante ni el coste — señal aproximada, documentado).
      const oppProgress = opponent ? (oppProgressBefore[opponent.villainId] ?? 0) : 0;
      if (opponent && oppProgress >= RIVAL_CERCA_DE_GANAR) {
        const locDef = getPlugin(player.villainId).locations.find(l => l.id === player.pawnLocationId);
        const fateWasReachable = locDef?.actions.some(a => a.type === ActionType.FATE) ?? false;
        if (fateWasReachable) {
          st.fateUrgentOpportunities++;
          const playedFate = audit.actionsTaken.some(a => a.label.startsWith('Destino'));
          if (!playedFate) st.fateUrgentSkipped++;
        }
      }

      // Regla: descartar mano muerta — no dejar cartas muertas sin ciclar cuando se PODÍA (solo
      // cuenta si la ubicación donde terminó el turno tenía una ranura de Descartar; si no la
      // tenía, no discutía la elección, no había elección).
      const deadCount = getDeadHandCards(final, player.id).length;
      const locDefForDiscard = getPlugin(player.villainId).locations.find(l => l.id === player.pawnLocationId);
      const discardWasReachable = locDefForDiscard?.actions.some(a => a.type === ActionType.DISCARD) ?? false;
      if (deadCount > 0 && discardWasReachable) {
        st.deadHandTurns++;
        const discarded = audit.actionsTaken.some(a => a.label.startsWith('Descartar'));
        if (!discarded) st.deadHandUndiscarded++;
      }
    }
    s = final;
  }

  // Al final de la partida: ¿el héroe que bloquea de verdad (structuralThreats) sigue vivo?
  for (const p of s.players) {
    const plugin = getPlugin(p.villainId);
    const threats = plugin.structuralThreats?.filter(t => t.strengthGap) ?? [];
    const st = stats[p.villainId];
    st.games++;
    if (s.winner === p.id) st.wins++;
    if (threats.length > 0) {
      st.gamesWithStructuralThreat++;
      const stillAlive = threats.some(t =>
        Object.values(p.locationStates).some(ls => ls.heroCardInstIds.some(id => t.isThreatHero(s, id))),
      );
      if (stillAlive) st.structuralThreatAliveAtEnd++;
    }
  }
}

const matchups: [VillainId, VillainId][] = [['hook', 'maleficent'], ['hook', 'jhon'], ['maleficent', 'jhon']];
const t0 = Date.now();
for (const [a, b] of matchups) {
  for (let i = 0; i < GAMES; i++) playGame(a, b, (i % 2) as 0 | 1);
}

const pct = (n: number, d: number) => d > 0 ? `${(100 * n / d).toFixed(1)}%` : '—';

console.log(`\n=== Diagnóstico de Coherencia Humana (${GAMES} partidas × 3 emparejamientos) ===`);
for (const villainId of ['hook', 'maleficent', 'jhon'] as VillainId[]) {
  const st = stats[villainId];
  console.log(`\n--- ${villainId} (${st.games} partidas, ${st.wins} victorias) ---`);
  console.log(`Turnos jugados: ${st.turns}`);
  console.log(`Turnos totalmente vacíos (nunca perder un turno): ${st.emptyTurns} (${pct(st.emptyTurns, st.turns)})`);
  console.log(`  ...de los cuales, se movió y no hizo nada (moverse sin sentido): ${st.movedButDidNothing} (${pct(st.movedButDidNothing, st.turns)})`);
  console.log(`Oportunidades de Destino con rival cerca de ganar (oppProgress>=${RIVAL_CERCA_DE_GANAR}): ${st.fateUrgentOpportunities}`);
  console.log(`  ...de las cuales, NO se jugó Destino: ${st.fateUrgentSkipped} (${pct(st.fateUrgentSkipped, st.fateUrgentOpportunities)})`);
  console.log(`Turnos con mano muerta Y ranura de Descartar disponible: ${st.deadHandTurns} (${pct(st.deadHandTurns, st.turns)} de sus turnos)`);
  console.log(`  ...de los cuales, NO descartó pudiendo hacerlo: ${st.deadHandUndiscarded} (${pct(st.deadHandUndiscarded, st.deadHandTurns)})`);
  if (st.gamesWithStructuralThreat > 0) {
    console.log(`Amenaza estructural (héroe que bloquea de verdad) viva al terminar la partida: ${st.structuralThreatAliveAtEnd}/${st.gamesWithStructuralThreat} partidas (${pct(st.structuralThreatAliveAtEnd, st.gamesWithStructuralThreat)})`);
  } else {
    console.log(`Sin amenaza estructural configurada (structuralThreats) para este villano.`);
  }
}
console.log(`\nTiempo total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

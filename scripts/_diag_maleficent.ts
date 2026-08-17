// ─── Diagnóstico temporal: sequía de maldiciones + uso de Vencer en Maléfica ────────
// No es parte del simulador oficial (scripts/simulate.ts) — instrumenta runAIStep para
// registrar, turno a turno, cuántas Maldiciones tiene Maléfica en mano, cuántas
// ubicaciones tiene cubiertas, y si el turno incluyó una acción Vencer o Descartar.
// Uso: npx tsx scripts/_diag_maleficent.ts [nº de partidas]
import { createInitialState } from '../src/core/engine/GameEngine';
import { runAIStep } from '../src/core/ai/runAIStep';
import { CardType } from '../src/core/types';
import type { GameState } from '../src/core/types';
import { getEffectDef } from '../src/core/villains/registry';

const GAMES = Number(process.argv[2]) || 30;
const MAX_AI_STEPS = 300;

interface GameStats {
  winner: string | null;
  rounds: number;
  malCursesAtEnd: number; // 0-4
  malVanquishActions: number;
  malDiscardActions: number;
  malPlayCurseActions: number;
  zeroCurseHandTurns: number; // turnos de Maléfica con 0 maldiciones en mano
  malTurns: number;
  roundsToNthCurse: (number | null)[]; // índice 0 = 1ª maldición, ..., 3 = 4ª
  curseChurnEvents: number; // nº de veces que una ubicación pierde una maldición que ya tenía
  churnByDefId: Record<string, number>; // pérdidas de maldición clasificadas por defId (sueño/fuego/selva)
  churnDuringOwnTurn: number; // pérdidas ocurridas EN el turno de Maléfica (autoinfligidas)
  churnDuringOppTurn: number; // pérdidas ocurridas en el turno de Jhon (p. ej. Selva al jugar un Héroe, o Estéfano forzando el movimiento)
  frozenHandTurns: number; // turnos con 0 maldiciones en mano donde ADEMÁS no entró ninguna carta nueva (mano congelada)
  curseTurnPlayCounts: Record<number, number>; // por turno de Maléfica: cuántas "Jugar <Maldición>" hubo (0,1,2,3+) — ¿aprovecha Bosque (2 ranuras) + Cuervo para varias en el mismo turno?
  raventurnActions: Record<string, number>; // qué tipo de acción resolvió el Cuervo cada vez que se activó (para ver si juega carta/descarta o solo gana poder)
  blockerHeroTurnsAlive: number[]; // por cada bloqueante que llegó a desaparecer: turnos de Maléfica que estuvo vivo
  blockerHeroTurnsAliveStillUp: number[]; // bloqueantes que siguen en pie al final de la partida
  handTypeCountsOnZeroCurse: Record<string, number>; // conteo agregado de tipos de carta en mano cuando 0 maldiciones
}

function malCursesInHand(state: GameState, playerId: string): number {
  const p = state.players.find(pl => pl.id === playerId)!;
  return p.handInstIds.filter(id => state.allCards[id]?.cardType === CardType.CURSE).length;
}

function malLocsCovered(state: GameState, playerId: string): number {
  const p = state.players.find(pl => pl.id === playerId)!;
  return Object.values(p.locationStates).filter(ls =>
    ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE),
  ).length;
}

function malCursedLocSet(state: GameState, playerId: string): Set<string> {
  const p = state.players.find(pl => pl.id === playerId)!;
  const set = new Set<string>();
  for (const [locId, ls] of Object.entries(p.locationStates)) {
    if (ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE)) set.add(locId);
  }
  return set;
}

/** Maldiciones actualmente EN JUEGO (con locationId) por instId -> defId, para poder clasificar
 *  por tipo (Sueño/Fuego/Selva) cuándo desaparece cada una. */
function malCurseInstIdsOnBoard(state: GameState, playerId: string): Map<string, string> {
  const p = state.players.find(pl => pl.id === playerId)!;
  const map = new Map<string, string>();
  for (const ls of Object.values(p.locationStates)) {
    for (const id of ls.villainCardInstIds) {
      const c = state.allCards[id];
      if (c?.cardType === CardType.CURSE) map.set(id, c.defId);
    }
  }
  return map;
}

/** IDs de instancia de héroes con blocksCursePlay actualmente en el tablero de Maléfica. */
function blockerHeroIdsOnBoard(state: GameState, playerId: string): Set<string> {
  const p = state.players.find(pl => pl.id === playerId)!;
  const set = new Set<string>();
  for (const ls of Object.values(p.locationStates)) {
    for (const id of ls.heroCardInstIds) {
      const c = state.allCards[id];
      if (c?.effectIds.some(eid => getEffectDef(eid)?.blocksCursePlay)) set.add(id);
    }
  }
  return set;
}

function playGame(startingPlayerIndex: 0 | 1): GameStats {
  let s = createInitialState({
    player1: { villainId: 'maleficent', isAI: true, name: 'IA-maleficent' },
    player2: { villainId: 'jhon', isAI: true, name: 'IA-jhon' },
    startingPlayerIndex,
  });
  const malId = s.players[0].id; // maleficent siempre player1 aquí

  const stats: GameStats = {
    winner: null, rounds: 0, malCursesAtEnd: 0, malVanquishActions: 0, malDiscardActions: 0,
    malPlayCurseActions: 0, zeroCurseHandTurns: 0, malTurns: 0, roundsToNthCurse: [null, null, null, null],
    curseChurnEvents: 0, churnByDefId: {}, churnDuringOwnTurn: 0, churnDuringOppTurn: 0,
    frozenHandTurns: 0, blockerHeroTurnsAlive: [], blockerHeroTurnsAliveStillUp: [],
    handTypeCountsOnZeroCurse: {}, curseTurnPlayCounts: {}, raventurnActions: {},
  };
  let lastCovered = 0;
  let lastCursedSet = malCursedLocSet(s, malId);
  // Rastro de bloqueantes vivos: instId -> turno de Maléfica en el que se vio por primera vez.
  const blockerFirstSeenTurn = new Map<string, number>();

  for (let step = 0; step < MAX_AI_STEPS && !s.winner; step++) {
    const cursesBefore = malCursesInHand(s, malId);
    const curseInstsBefore = malCurseInstIdsOnBoard(s, malId);
    const { final, audit } = runAIStep(s);
    if (final === s && !final.winner) break; // atascada

    // Clasifica CADA pérdida de maldición (en cualquier turno, propio o rival) por defId y por
    // quién estaba jugando cuando ocurrió — separa autolesión (Fuego Verde al moverse ella misma)
    // de contrajuego legítimo del rival (Selva al jugar un Héroe, Estéfano forzando el movimiento).
    const curseInstsAfterStep = malCurseInstIdsOnBoard(final, malId);
    for (const [instId, defId] of curseInstsBefore) {
      if (!curseInstsAfterStep.has(instId)) {
        stats.churnByDefId[defId] = (stats.churnByDefId[defId] ?? 0) + 1;
        if (audit?.villainId === 'maleficent') stats.churnDuringOwnTurn++;
        else stats.churnDuringOppTurn++;
      }
    }

    if (audit && audit.villainId === 'maleficent') {
      stats.malTurns++;
      if (cursesBefore === 0) {
        stats.zeroCurseHandTurns++;
        const p = s.players.find(pl => pl.id === malId)!;
        // Mano congelada: ninguna carta de la mano ANTES sigue fuera de la mano DESPUÉS (no jugó
        // ni descartó nada) => needed = handSize - handInstIds.length = 0 en drawCards => no entra
        // ninguna carta nueva este turno, la sequía de Maldiciones no tiene ninguna oportunidad de
        // romperse aunque pasen más turnos así.
        const handBeforeSet = new Set(p.handInstIds);
        const pAfter = final.players.find(pl => pl.id === malId)!;
        const newCardEntered = pAfter.handInstIds.some(id => !handBeforeSet.has(id));
        if (!newCardEntered) stats.frozenHandTurns++;
        for (const id of p.handInstIds) {
          const t = s.allCards[id]?.cardType ?? 'DESCONOCIDO';
          stats.handTypeCountsOnZeroCurse[t] = (stats.handTypeCountsOnZeroCurse[t] ?? 0) + 1;
        }
      }
      for (const a of audit.actionsTaken) {
        if (a.label.startsWith('Vencer a')) stats.malVanquishActions++;
        if (a.label.startsWith('Descartar')) stats.malDiscardActions++;
      }

      // audit.actionsTaken solo registra las acciones de la fase ACTIVATE del PEÓN — la acción del
      // Cuervo (maybeUseRaven, antes de mover el peón) no queda ahí. Para contar TODAS las
      // Maldiciones jugadas este turno (peón + Cuervo, p. ej. las 2 ranuras de Usar Carta de
      // Bosque más una del Cuervo) hay que leer el LOG en su lugar, que sí registra ambas fuentes.
      const newLogLines = final.log.slice(s.log.length);
      const curseNameRe = /(Sueño Sin Sueños|Fuego Verde|Selva de Mortales Espinos)/;
      const cursePlaysThisTurn = newLogLines.filter(line =>
        (line.includes('juega ') || line.includes('jugado en')) && curseNameRe.test(line),
      ).length;
      stats.malPlayCurseActions += cursePlaysThisTurn;
      stats.curseTurnPlayCounts[cursePlaysThisTurn] = (stats.curseTurnPlayCounts[cursePlaysThisTurn] ?? 0) + 1;

      // Qué acción resolvió el Cuervo cada vez que se activó este turno (¿solo Gana Poder, o
      // aprovecha también Usar Carta/Vencer/Mover/Descartar?).
      for (const line of newLogLines) {
        if (!line.startsWith('El Cuervo:')) continue;
        let kind = 'otro';
        if (line.includes('bloqueada')) kind = 'BLOQUEADO';
        else if (line.includes('gana')) kind = 'GAIN_POWER';
        else if (line.includes('jugado en')) kind = 'PLAY_CARD';
        else if (line.includes('derrotado')) kind = 'VANQUISH';
        else if (line.includes('movido a')) kind = 'MOVE_ITEM_ALLY';
        else if (line.includes('descartada')) kind = 'DISCARD';
        stats.raventurnActions[kind] = (stats.raventurnActions[kind] ?? 0) + 1;
      }
      const coveredNow = malLocsCovered(final, malId);
      for (let n = lastCovered; n < coveredNow; n++) {
        if (stats.roundsToNthCurse[n] === null) stats.roundsToNthCurse[n] = final.roundNumber;
      }
      lastCovered = coveredNow;

      // Churn: ubicaciones que tenían maldición y ahora ya no.
      const nowCursedSet = malCursedLocSet(final, malId);
      for (const locId of lastCursedSet) {
        if (!nowCursedSet.has(locId)) stats.curseChurnEvents++;
      }
      lastCursedSet = nowCursedSet;

      // Bloqueantes: aparición/desaparición.
      const blockersNow = blockerHeroIdsOnBoard(final, malId);
      for (const id of blockersNow) {
        if (!blockerFirstSeenTurn.has(id)) blockerFirstSeenTurn.set(id, stats.malTurns);
      }
      for (const [id, firstTurn] of [...blockerFirstSeenTurn.entries()]) {
        if (!blockersNow.has(id)) {
          stats.blockerHeroTurnsAlive.push(stats.malTurns - firstTurn);
          blockerFirstSeenTurn.delete(id);
        }
      }
    }
    s = final;
  }

  for (const firstTurn of blockerFirstSeenTurn.values()) {
    stats.blockerHeroTurnsAliveStillUp.push(stats.malTurns - firstTurn);
  }

  stats.rounds = s.roundNumber;
  stats.malCursesAtEnd = malLocsCovered(s, malId);
  stats.winner = s.winner ? s.players.find(p => p.id === s.winner)?.villainId ?? null : null;
  return stats;
}

const all: GameStats[] = [];
const t0 = Date.now();
for (let i = 0; i < GAMES; i++) {
  all.push(playGame((i % 2) as 0 | 1));
}

const avg = (xs: number[]) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '—';
const wins = all.filter(g => g.winner === 'maleficent').length;
const losses = all.filter(g => g.winner === 'jhon').length;
const stalled = all.filter(g => g.winner === null).length;
const reached4of4 = all.filter(g => g.malCursesAtEnd === 4).length;
const distCursesAtEnd = [0, 1, 2, 3, 4].map(n => all.filter(g => g.malCursesAtEnd === n).length);

console.log(`\n=== Diagnóstico Maléfica vs Jhon (${GAMES} partidas IA-vs-IA) ===`);
console.log(`Victorias Maléfica: ${wins} | Victorias Jhon: ${losses} | Estancadas: ${stalled}`);
console.log(`Partidas donde Maléfica llegó a 4/4 maldiciones: ${reached4of4}/${GAMES}`);
console.log(`Distribución de maldiciones al final de la partida (0..4): ${distCursesAtEnd.join(', ')}`);
console.log(`Rondas medias: ${avg(all.map(g => g.rounds))}`);
console.log(`\n--- Actividad de la IA de Maléfica (promedio por partida) ---`);
console.log(`Turnos jugados por Maléfica: ${avg(all.map(g => g.malTurns))}`);
console.log(`Turnos con 0 Maldiciones en mano: ${avg(all.map(g => g.zeroCurseHandTurns))} (${avg(all.map(g => g.malTurns > 0 ? 100 * g.zeroCurseHandTurns / g.malTurns : 0))}% de sus turnos)`);
console.log(`  ...de los cuales, con la mano CONGELADA (no entró ninguna carta nueva ese turno): ${avg(all.map(g => g.frozenHandTurns))} (${avg(all.map(g => g.zeroCurseHandTurns > 0 ? 100 * g.frozenHandTurns / g.zeroCurseHandTurns : 0))}% de los turnos sin Maldición)`);
console.log(`Acciones "Jugar <Maldición>" ejecutadas: ${avg(all.map(g => g.malPlayCurseActions))}`);
console.log(`Acciones VANQUISH ejecutadas: ${avg(all.map(g => g.malVanquishActions))}`);
console.log(`Acciones DISCARD ejecutadas: ${avg(all.map(g => g.malDiscardActions))}`);
console.log(`Partidas con 0 acciones VANQUISH en toda la partida: ${all.filter(g => g.malVanquishActions === 0).length}/${GAMES}`);

console.log(`\n--- Ronda media de la N-ésima maldición conseguida (solo partidas que la alcanzaron) ---`);
for (let n = 0; n < 4; n++) {
  const rounds = all.map(g => g.roundsToNthCurse[n]).filter((r): r is number => r !== null);
  console.log(`  ${n + 1}ª maldición: alcanzada en ${rounds.length}/${GAMES} partidas, ronda media ${avg(rounds)}`);
}

console.log(`\n--- Churn de maldiciones (¿se le retiran tan rápido como las pone?) ---`);
console.log(`Eventos de pérdida de maldición por partida: ${avg(all.map(g => g.curseChurnEvents))}`);
console.log(`Total plays de maldición: ${avg(all.map(g => g.malPlayCurseActions))} vs total pérdidas: ${avg(all.map(g => g.curseChurnEvents))} (si son similares, hay tratamiento de cinta de correr)`);

console.log(`\n--- Pérdidas de maldición: ¿en el turno de Maléfica (autolesión) o en el de Jhon (contrajuego)? ---`);
console.log(`Perdidas EN turno propio: ${avg(all.map(g => g.churnDuringOwnTurn))}/partida`);
console.log(`Perdidas EN turno de Jhon: ${avg(all.map(g => g.churnDuringOppTurn))}/partida`);

console.log(`\n--- Pérdidas de maldición clasificadas por tipo (defId) ---`);
const churnTotals: Record<string, number> = {};
for (const g of all) {
  for (const [defId, n] of Object.entries(g.churnByDefId)) churnTotals[defId] = (churnTotals[defId] ?? 0) + n;
}
const churnGrandTotal = Object.values(churnTotals).reduce((a, b) => a + b, 0) || 1;
for (const [defId, n] of Object.entries(churnTotals).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${defId}: ${n} (${(100 * n / churnGrandTotal).toFixed(1)}%) — ${(n / GAMES).toFixed(2)}/partida`);
}

console.log(`\n--- Héroes bloqueantes (blocksCursePlay, p. ej. Primavera) ---`);
const allAliveDurations = all.flatMap(g => g.blockerHeroTurnsAlive);
const allStillUpDurations = all.flatMap(g => g.blockerHeroTurnsAliveStillUp);
console.log(`Bloqueantes vencidos/eliminados: ${allAliveDurations.length} (turnos de Maléfica que tardó en quitarlos, media: ${avg(allAliveDurations)})`);
console.log(`Bloqueantes que seguían en pie al terminar la partida: ${allStillUpDurations.length} (turnos que llevaban vivos, media: ${avg(allStillUpDurations)})`);
console.log(`Partidas con al menos un bloqueante que nunca se quitó: ${all.filter(g => g.blockerHeroTurnsAliveStillUp.length > 0).length}/${GAMES}`);

console.log(`\n--- Composición de la mano cuando Maléfica tiene 0 Maldiciones (conteo agregado de cartas) ---`);
const handTotals: Record<string, number> = {};
for (const g of all) {
  for (const [t, n] of Object.entries(g.handTypeCountsOnZeroCurse)) handTotals[t] = (handTotals[t] ?? 0) + n;
}
const grandTotal = Object.values(handTotals).reduce((a, b) => a + b, 0) || 1;
for (const [t, n] of Object.entries(handTotals).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t}: ${n} (${(100 * n / grandTotal).toFixed(1)}%)`);
}

console.log(`\n--- Maldiciones jugadas POR TURNO (¿aprovecha 2 ranuras de Usar Carta en Bosque + Cuervo?) ---`);
const curseTurnTotals: Record<number, number> = {};
for (const g of all) {
  for (const [n, count] of Object.entries(g.curseTurnPlayCounts)) {
    const key = Number(n);
    curseTurnTotals[key] = (curseTurnTotals[key] ?? 0) + count;
  }
}
const curseTurnGrandTotal = Object.values(curseTurnTotals).reduce((a, b) => a + b, 0) || 1;
for (const n of Object.keys(curseTurnTotals).map(Number).sort((a, b) => a - b)) {
  console.log(`  ${n} Maldición(es) en el turno: ${curseTurnTotals[n]} turnos (${(100 * curseTurnTotals[n] / curseTurnGrandTotal).toFixed(1)}%)`);
}

console.log(`\n--- Qué acción resuelve el Cuervo cuando se activa (agregado) ---`);
const ravenTotals: Record<string, number> = {};
for (const g of all) {
  for (const [k, n] of Object.entries(g.raventurnActions)) ravenTotals[k] = (ravenTotals[k] ?? 0) + n;
}
const ravenGrandTotal = Object.values(ravenTotals).reduce((a, b) => a + b, 0);
if (ravenGrandTotal === 0) {
  console.log('  El Cuervo nunca se activó en esta muestra.');
} else {
  for (const [k, n] of Object.entries(ravenTotals).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${n} (${(100 * n / ravenGrandTotal).toFixed(1)}%)`);
  }
  console.log(`  Total activaciones del Cuervo: ${ravenGrandTotal} (${(ravenGrandTotal / GAMES).toFixed(2)}/partida)`);
}

console.log(`\nTiempo total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

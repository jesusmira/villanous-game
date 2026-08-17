// ─── Trazado temporal: por qué Garfio no remata a Burla/Tic Tac ────────────────────
// No es parte del simulador oficial. Uso: npx tsx scripts/_trace_hook_protector.ts [nº partidas]
import { createInitialState } from '../src/core/engine/GameEngine';
import { runAIStep } from '../src/core/ai/runAIStep';
import { heroHasBurla } from '../src/core/villains/hook/aiHelpers';
import { CardDefId } from '../src/core/villains/effectIds';
import { CardType } from '../src/core/types';
import { getEffectiveStrength } from '../src/core/engine/stateHelpers';
import type { GameState } from '../src/core/types';

const N = Number(process.argv[2]) || 6;

function blockerInfo(s: GameState, hookId: string) {
  const p = s.players.find(pl => pl.id === hookId)!;
  const out: { locId: string; heroStr: number; allyStr: number }[] = [];
  for (const [locId, ls] of Object.entries(p.locationStates)) {
    const blockers = ls.heroCardInstIds.filter(
      id => heroHasBurla(s, id) || s.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC,
    );
    if (blockers.length === 0) continue;
    const heroStr = blockers.reduce((sum, id) => sum + getEffectiveStrength(s, id), 0);
    const allyStr = ls.villainCardInstIds
      .filter(id => s.allCards[id]?.cardType === CardType.ALLY)
      .reduce((sum, id) => sum + getEffectiveStrength(s, id), 0);
    out.push({ locId, heroStr, allyStr });
  }
  return out;
}

for (let g = 0; g < N; g++) {
  let s = createInitialState({
    player1: { villainId: 'hook', isAI: true, name: 'IA-hook' },
    player2: { villainId: 'jhon', isAI: true, name: 'IA-jhon' },
    startingPlayerIndex: (g % 2) as 0 | 1,
  });
  const hookId = s.players.find(p => p.villainId === 'hook')!.id;
  let hookTurns = 0;
  let sawVanquishable = false;
  let vanquishedOk = false;
  const intentionLog: string[] = [];

  for (let step = 0; step < 300 && !s.winner; step++) {
    const { final, audit } = runAIStep(s);
    if (final === s && !final.winner) break;
    if (audit?.villainId === 'hook') {
      hookTurns++;
      const before = blockerInfo(s, hookId);
      const vanquishableNow = before.some(b => b.allyStr >= b.heroStr);
      if (vanquishableNow) sawVanquishable = true;
      const tookVanquish = audit.actionsTaken.some(a => a.label.startsWith('Vencer'));
      if (vanquishableNow && tookVanquish) vanquishedOk = true;
      if (hookTurns <= 15) {
        intentionLog.push(
          `T${hookTurns} intención=${audit.chosenIntention.name}(${audit.chosenIntention.score.toFixed(1)}) ` +
          `bloqueante=${before.map(b => `${b.locId}:hero${b.heroStr}/ally${b.allyStr}`).join(',') || 'ninguno'} ` +
          `acciones=[${audit.actionsTaken.map(a => a.label).join(' | ')}]`,
        );
      }
    }
    s = final;
  }
  const after = blockerInfo(s, hookId);
  console.log(`\n=== Partida ${g + 1} (${hookTurns} turnos de Garfio, ronda final ${s.roundNumber}, ganador=${s.winner ? s.players.find(p=>p.id===s.winner)?.villainId : 'ninguno'}) ===`);
  console.log(`¿Alguna vez tuvo suficiente Fuerza de Aliados para vencer al bloqueante? ${sawVanquishable}`);
  console.log(`¿Lo venció cuando pudo? ${vanquishedOk}`);
  console.log(`Bloqueante al final: ${after.length > 0 ? JSON.stringify(after) : 'ninguno (resuelto o nunca apareció)'}`);
  console.log(intentionLog.join('\n'));
}

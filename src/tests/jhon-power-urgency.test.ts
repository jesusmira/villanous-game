// ─── FASE 17: guardas de regresión para el "acantilado" de urgencia de Poder ────────────────
// Bug confirmado en la partida real 5660a246-1cb9-4f9f-8faa-47b364f5e760 (Jhon/IA vs Garfio):
// la IA llegaba a 18/20 de Poder con Robin Hood sin cubrir en Nottingham y 2 copias de
// Encarcelamiento en mano, y NUNCA las jugaba — ni esa ni ninguna otra carta con coste ≥1,
// durante el resto de la partida. Causa raíz: POWER_ALMOST_WIN/NEAR_WIN/ADVANTAGE eran
// umbrales fijos (18+/14-17/10-13 → +120/+60/+25) que se aplicaban de golpe; bajar de 18 a 16
// de Poder por CUALQUIER motivo perdía 120→60 = -60 puntos de golpe, muy por encima de
// cualquier beneficio estructural real de una sola jugada. Ver powerUrgency() y
// WEIGHTS.HERO_IMPRISONED en jhon/ai.ts, y el bono de Corona/Orden en evaluate.ts.
import { describe, it, expect } from 'vitest';
import { runAITurn } from '../core/ai/AIPlayer';
import { evaluateState } from '../core/ai/evaluate';
import { scoreState as jhonScoreState } from '../core/villains/jhon/ai';
import { getPlayer } from '../core/engine/stateHelpers';
import { TurnPhase } from '../core/types';
import { CardDefId } from '../core/villains/effectIds';
import {
  makeJhonState, jhonId, placeHeroInLoc, placeVillainCard,
  setPhase, setPawn, setCurrentPlayer, setPower, putInHand,
} from './helpers/factories';

function findAll(state: ReturnType<typeof makeJhonState>, prefix: string, count: number) {
  const ids = Object.keys(state.allCards).filter(id => state.allCards[id]?.defId?.startsWith(prefix));
  if (ids.length < count) throw new Error(`Solo se encontraron ${ids.length} cartas con prefijo ${prefix}`);
  return ids.slice(0, count);
}

describe('Príncipe Juan — no debe congelarse cerca de un umbral de Poder', () => {
  it('con Robin Hood sin cubrir y 18/20 de Poder alcanzable, encarcela a Robin Hood en la misma ronda', () => {
    let s = makeJhonState();
    const id = jhonId(s);

    s = setCurrentPlayer(s, id);
    s = setPhase(s, TurnPhase.ACTIVATE);
    s = setPawn(s, id, 'jhon_prison'); // Ganar Poder(+3) + Jugar Carta + Descartar
    s = setPower(s, id, 16); // tras Ganar Poder llega a 18 (18/20, "casi ganando")

    const robinId = findAll(s, CardDefId.JHON_ROBIN_HOOD, 1)[0];
    s = placeHeroInLoc(s, id, 'jhon_nottingham', robinId);

    const encarcel = findAll(s, 'jhon_v_encarcel', 2);
    const [coronaId] = findAll(s, CardDefId.JHON_CORONA, 1);
    const [cobardiaId] = findAll(s, 'jhon_v_cobardia', 1);
    s = { ...s, players: s.players.map(p => (p.id === id ? { ...p, handInstIds: [] } : p)) };
    for (const c of [...encarcel, coronaId, cobardiaId]) s = putInHand(s, id, c);

    const after = runAITurn(s).at(-1)!;
    const player = after.players.find(p => p.id === id)!;

    expect(player.locationStates.jhon_nottingham.heroCardInstIds).not.toContain(robinId);
    expect(player.locationStates.jhon_prison.heroCardInstIds).toContain(robinId);
  });

  it('tener Corona del Rey Ricardo en juego puntúa mejor que no tenerla (a Poder bajo, sin acantilado)', () => {
    let s = makeJhonState();
    const id = jhonId(s);
    s = setCurrentPlayer(s, id);
    s = setPower(s, id, 3);

    const withoutCorona = evaluateState(s, id);

    const [coronaId] = findAll(s, CardDefId.JHON_CORONA, 1);
    s = placeVillainCard(s, id, 'jhon_prison', coronaId);
    const withCorona = evaluateState(s, id);

    expect(withCorona).toBeGreaterThan(withoutCorona);
  });

  it('jhonScoreState() es no decreciente en Poder y sin saltos mayores que unos pocos puntos por unidad', () => {
    // Se mide jhonScoreState() directamente (no evaluateState) para aislar el término que se
    // arregló aquí de los umbrales GENÉRICOS de evaluate.ts (WEIGHTS.WINNING/LOSING a ±30 de
    // diferencia de progreso), que son otro mecanismo ya existente y fuera de este alcance.
    let s = makeJhonState();
    const id = jhonId(s);
    s = setCurrentPlayer(s, id);

    let prevScore = -Infinity;
    for (let power = 0; power <= 20; power++) {
      s = setPower(s, id, power);
      const player = getPlayer(s, id);
      const score = jhonScoreState(s, player);
      if (power > 0) {
        const delta = score - prevScore;
        expect(delta, `no debería bajar al pasar de ${power - 1} a ${power} de Poder`).toBeGreaterThan(0);
        // El viejo bug de umbrales fijos saltaba 60 puntos (120→60) de golpe al cruzar 18→17.
        expect(delta, `salto sospechoso de ${delta.toFixed(1)} puntos al pasar de ${power - 1} a ${power} de Poder`)
          .toBeLessThan(20);
      }
      prevScore = score;
    }
  });
});

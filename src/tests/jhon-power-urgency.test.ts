// ─── Guardas de regresión para el "acantilado" de urgencia de Poder — Príncipe Juan ─────────
// Bug histórico (motor anterior): umbrales fijos de Poder que se aplicaban de golpe hacían que
// bajar de Poder por una jugada legítima (p. ej. Encarcelar a Robin Hood) perdiera muchos más
// puntos que cualquier beneficio estructural real de esa jugada, y la IA se congelaba cerca del
// umbral. El motor de intenciones usa curvas continuas (lerpCurve) desde el diseño, no
// umbrales — estas pruebas comprueban que sigue siendo así.
import { describe, it, expect } from 'vitest';
import { runAITurn } from '../core/ai/AIPlayer';
import { chooseIntention } from '../core/ai/intent/planner';
import { buildAIContext } from '../core/ai/intent/context';
import { intentions as jhonIntentions } from '../core/villains/jhon/intentions';
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

/** Valor holístico (suma de todas las intenciones aplicables + progreso propio) — para
 *  comparar dos estados directamente sin pasar por el puntuador de acciones por delta. */
function totalStateValue(state: ReturnType<typeof makeJhonState>, playerId: string): number {
  const { all } = chooseIntention(state, playerId);
  const ctx = buildAIContext(state, playerId);
  return ctx.ownProgress * 8 + all.reduce((sum, i) => sum + i.score * i.polarity, 0);
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

    const withoutCorona = totalStateValue(s, id);

    const [coronaId] = findAll(s, CardDefId.JHON_CORONA, 1);
    s = placeVillainCard(s, id, 'jhon_prison', coronaId);
    const withCorona = totalStateValue(s, id);

    expect(withCorona).toBeGreaterThan(withoutCorona);
  });

  it('JHON_GENERATE_POWER es no decreciente en Poder y sin saltos mayores que unos pocos puntos por unidad', () => {
    // Se mide la intención directamente (no el estado completo) para aislar la curva que existe
    // precisamente para evitar el acantilado, de otros mecanismos genéricos (progreso 0-100,
    // urgencia de victoria) que son otro asunto y están fuera de este alcance.
    const generatePower = jhonIntentions.find(i => i.id === 'JHON_GENERATE_POWER')!;
    let s = makeJhonState();
    const id = jhonId(s);
    s = setCurrentPlayer(s, id);

    let prevScore = -Infinity;
    for (let power = 0; power <= 20; power++) {
      s = setPower(s, id, power);
      const ctx = buildAIContext(s, id);
      const score = generatePower.evaluate(ctx);
      if (power > 0) {
        const delta = score - prevScore;
        expect(delta, `no debería bajar al pasar de ${power - 1} a ${power} de Poder`).toBeGreaterThan(0);
        // El viejo bug de umbrales fijos saltaba 60 puntos (120→60) de golpe al cruzar 18→17.
        // La pendiente máxima por diseño de esta curva (tramo 18→20) es 20/punto — muy por debajo
        // de aquel salto, y sigue siendo estrictamente lineal (sin discontinuidad real).
        expect(delta, `salto sospechoso de ${delta.toFixed(1)} puntos al pasar de ${power - 1} a ${power} de Poder`)
          .toBeLessThanOrEqual(20);
      }
      prevScore = score;
    }
  });
});

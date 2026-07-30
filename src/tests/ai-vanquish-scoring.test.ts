// ─── FASE 9: batería de cordura para la puntuación de la IA al Vencer héroes ────────────────
// Invariante central: si un jugador YA tiene Aliados suficientes en la ubicación de un héroe
// (o adyacente, con habilidad especial) para Vencerlo, hacerlo NUNCA debe puntuar peor —para
// evaluateState() del propio jugador— que dejarlo sin vencer. Si esto falla, la IA prefiere
// quedarse "a punto" para siempre en vez de rematar (ver [[project_ai_gradient_trap]]).
//
// Garfio y Maléfica ya tenían salvaguardas explícitas contra este problema (HERO_TROPHY /
// UNCOVERED_READY-persistente). El Príncipe Juan NO las tenía cuando se escribió este archivo
// — los tests de la sección "Príncipe Juan" están escritos para reflejar eso: los que fallan
// documentan el bug confirmado en partidas reales, pendiente de la Fase 8.
//
// También se comprueba explícitamente la pregunta clave antes de implementar cualquier "bono
// permanente": si un héroe ya vencido VUELVE a aparecer en el reino (redibujado por Destino,
// Rival Digno, etc.), la IA debe seguir viéndolo como una amenaza viva — el bono por haberlo
// vencido antes no puede "cegar" a la IA frente a la reaparición.
import { describe, it, expect } from 'vitest';
import { evaluateState } from '../core/ai/evaluate';
import { canVanquish } from '../core/engine/RuleEngine';
import { vanquish } from '../core/engine/GameEngine';
import { getAvailableSlotIndices, getActionAtSlot } from '../core/engine/slotHelpers';
import { ActionType, TurnPhase } from '../core/types';
import type { GameState, PlayerId, CardInstId, LocationId } from '../core/types';
import { CardDefId } from '../core/villains/effectIds';
import {
  makeState, hookId, malId, makeJhonState, jhonId,
  placeVillainCard, placeHeroInLoc, setPhase, setPawn, setCurrentPlayer,
} from './helpers/factories';

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Busca hasta `count` instIds distintos cuyo defId empiece por `prefix`. */
function findAll(state: GameState, prefix: string, count: number): CardInstId[] {
  const ids = Object.keys(state.allCards).filter(id => state.allCards[id]?.defId?.startsWith(prefix));
  if (ids.length < count) throw new Error(`Solo se encontraron ${ids.length} cartas con prefijo ${prefix} (se pedían ${count})`);
  return ids.slice(0, count);
}

function vanquishSlotAt(state: GameState, playerId: PlayerId, locId: LocationId): number {
  const idx = getAvailableSlotIndices(state, playerId, locId)
    .find(i => getActionAtSlot(state, playerId, i)?.type === ActionType.VANQUISH);
  if (idx === undefined) throw new Error(`No hay casilla de Vencer disponible en ${locId}`);
  return idx;
}

/** Prepara un estado listo para Vencer: fase ACTIVATE, turno del jugador, peón en `locId`. */
function readyToActivateAt(state: GameState, playerId: PlayerId, locId: LocationId): GameState {
  let s = setCurrentPlayer(state, playerId);
  s = setPhase(s, TurnPhase.ACTIVATE);
  s = setPawn(s, playerId, locId);
  return s;
}

/** Coloca héroe + Aliados en la misma ubicación y comprueba el invariante central. */
function expectVanquishNeverWorse(
  state: GameState, playerId: PlayerId, locId: LocationId, heroId: CardInstId, allyIds: CardInstId[],
): { before: number; after: number } {
  return expectVanquishNeverWorseAt(state, playerId, locId, locId, heroId, allyIds);
}

/**
 * Igual que expectVanquishNeverWorse(), pero permite separar dónde está el peón (necesita
 * casilla de Vencer) de dónde están héroe + Aliados (Vencer entre ubicaciones distintas es
 * legal, ver canVanquishFree en RuleEngine.ts). Necesario para Garfio: su única casilla de
 * Vencer está en el Jolly Roger, que además tiene su PROPIO bono de "construir ejército para
 * Peter Pan" (evaluate.ts: 2+ Aliados ahí = +25) — si héroe y Aliados se colocan ahí mismo por
 * comodidad, gastarlos en Vencer también quita ese bono aparte y contamina la medición del
 * trap de gradiente real.
 */
function expectVanquishNeverWorseAt(
  state: GameState, playerId: PlayerId, pawnLocId: LocationId, heroLocId: LocationId,
  heroId: CardInstId, allyIds: CardInstId[],
): { before: number; after: number } {
  let s = readyToActivateAt(state, playerId, pawnLocId);
  s = placeHeroInLoc(s, playerId, heroLocId, heroId);
  for (const allyId of allyIds) s = placeVillainCard(s, playerId, heroLocId, allyId);

  const slotIdx = vanquishSlotAt(s, playerId, pawnLocId);
  const check = canVanquish(s, playerId, heroId, allyIds, slotIdx);
  expect(check.valid, check.reason).toBe(true);

  const before = evaluateState(s, playerId);
  const after = vanquish(s, playerId, heroId, allyIds, slotIdx);
  const afterVal = evaluateState(after, playerId);
  expect(afterVal, `vencer puntuó ${afterVal.toFixed(2)} < ${before.toFixed(2)} (antes) — la IA preferiría no rematar`)
    .toBeGreaterThanOrEqual(before);
  return { before, after: afterVal };
}

// ─── Príncipe Juan: un caso por cada héroe real de su mazo de Destino ─────────────

describe('Vencer nunca debe puntuar peor que no vencer — Príncipe Juan', () => {
  const LOC = 'jhon_nottingham';

  it('Toby (F2) — caso especial: vuelve al mazo de Destino, nunca queda en el descarte', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, CardDefId.JHON_TOBY, 1)[0];
    const allyIds = findAll(s0, CardDefId.JHON_LELO, 1); // F2, suficiente en solitario
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  it('Skippy (F2)', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, 'jhon_f_skippy', 1)[0];
    const allyIds = findAll(s0, 'jhon_v_hiss', 1); // F2
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  it('Alan-a-Dale (F2)', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, CardDefId.JHON_ALAN_A_DALE, 1)[0];
    const allyIds = findAll(s0, CardDefId.JHON_ARQUEROS, 1); // F2
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  it('Fraile Tuck (F3)', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, 'jhon_f_fraile', 1)[0];
    const allyIds = findAll(s0, 'jhon_v_sherif', 1); // F3, coincide exacto
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  // Lady Marian es un caso aparte: al morir, saca a Robin Hood del mazo/descarte y lo juega
  // de inmediato en su misma ubicación (ver findAndPlayRobinHood en jhon/resolvers.ts). Eso es
  // una consecuencia MECÁNICA real del juego, no un bug de puntuación — así que en vez de
  // forzar el marcador hasta que "nunca sea peor" (como con el resto de héroes), aquí se
  // documentan y comprueban las DOS situaciones reales por separado.
  it('Lady Marian (F3) SIN refuerzo para Robin Hood — vencerla sola SÍ debe puntuar peor (a propósito)', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, CardDefId.JHON_LADY_MARIAN, 1)[0];
    const allyIds = findAll(s0, CardDefId.JHON_TIRO_LISTO, 1); // F4, de sobra para Marian sola

    let s = readyToActivateAt(s0, id, LOC);
    s = placeHeroInLoc(s, id, LOC, heroId);
    for (const allyId of allyIds) s = placeVillainCard(s, id, LOC, allyId);
    const slotIdx = vanquishSlotAt(s, id, LOC);
    const before = evaluateState(s, id);
    const after = vanquish(s, id, heroId, allyIds, slotIdx);
    const afterVal = evaluateState(after, id);

    // Confirma que de verdad apareció Robin Hood sin avisar — si esto deja de ser cierto
    // (p. ej. porque se cambia esa mecánica), este test entero deja de tener sentido.
    const robinId = findAll(s0, CardDefId.JHON_ROBIN_HOOD, 1)[0];
    expect(after.players.find(p => p.id === id)!.locationStates[LOC].heroCardInstIds).toContain(robinId);

    expect(afterVal, 'se esperaba que empeorase al despertar a Robin Hood sin estar preparado')
      .toBeLessThan(before);
  });

  it('Lady Marian (F3) CON refuerzo ya listo para Robin Hood — el combo completo no debe empeorar', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, CardDefId.JHON_LADY_MARIAN, 1)[0];
    const marianAllies = findAll(s0, CardDefId.JHON_TIRO_LISTO, 1); // F4, para Marian (F3)
    const robinId = findAll(s0, CardDefId.JHON_ROBIN_HOOD, 1)[0];
    const robinAllies = findAll(s0, 'jhon_v_rino', 2); // F4+F4=8, de sobra para Robin Hood (F5)

    let s = readyToActivateAt(s0, id, LOC);
    s = placeHeroInLoc(s, id, LOC, heroId);
    for (const allyId of [...marianAllies, ...robinAllies]) s = placeVillainCard(s, id, LOC, allyId);
    const slotIdx = vanquishSlotAt(s, id, LOC);
    const before = evaluateState(s, id);

    // Vencer a Marian (esto saca a Robin Hood y lo coloca en la misma ubicación) y, en la
    // misma ubicación, rematar también a Robin Hood con los Aliados ya preparados. OJO: Jhon
    // solo tiene UNA casilla de Vencer (Nottingham), así que en la partida real esto no se
    // encadena en el mismo turno — se llama a vanquish() dos veces seguidas aquí solo para
    // medir el resultado FINAL una vez resuelto lo de Robin Hood, sin importar en cuántos
    // turnos. El punto no es "esto es gratis en un turno", es "atacar a Marian no es un error
    // si ya tienes reunida la fuerza para rematar a Robin Hood poco después".
    let after = vanquish(s, id, heroId, marianAllies, slotIdx);
    expect(after.players.find(p => p.id === id)!.locationStates[LOC].heroCardInstIds).toContain(robinId);
    after = vanquish(after, id, robinId, robinAllies, slotIdx);
    const afterVal = evaluateState(after, id);

    expect(afterVal, 'ir preparado para ambos no debería puntuar peor que no haber empezado')
      .toBeGreaterThanOrEqual(before);
  });

  it('Little John (F5)', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, 'jhon_f_littlejohn', 1)[0];
    const allyIds = [...findAll(s0, 'jhon_v_rino', 1), ...findAll(s0, CardDefId.JHON_ARQUEROS, 1)]; // F4+F2=6
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  it('Lady Kluck (F6)', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, 'jhon_f_kluck', 1)[0];
    const allyIds = [...findAll(s0, 'jhon_v_rino', 1), ...findAll(s0, CardDefId.JHON_TIRO_LISTO, 1)]; // F4+F4=8
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  it('Robin Hood (F5) — tiene penalización dedicada propia', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, CardDefId.JHON_ROBIN_HOOD, 1)[0];
    const allyIds = [...findAll(s0, 'jhon_v_rino', 1), ...findAll(s0, CardDefId.JHON_ARQUEROS, 1)]; // F4+F2=6
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  it('Rey Ricardo (F5) — tiene penalización dedicada propia', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, CardDefId.JHON_REY_RICARDO, 1)[0];
    const allyIds = [...findAll(s0, 'jhon_v_rino', 1), ...findAll(s0, CardDefId.JHON_ARQUEROS, 1)]; // F4+F2=6
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });
});

// ─── La pregunta clave: ¿un héroe que reaparece se sigue tratando como amenaza? ───────────

describe('Un héroe ya vencido que reaparece debe volver a puntuar como amenaza', () => {
  it('Lady Marian: tras vencerla y volver a colocarla, evaluateState debe EMPEORAR de nuevo', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const LOC = 'jhon_nottingham';
    const heroId = findAll(s0, CardDefId.JHON_LADY_MARIAN, 1)[0];
    const allyIds = findAll(s0, CardDefId.JHON_TIRO_LISTO, 1);

    let s = readyToActivateAt(s0, id, LOC);
    s = placeHeroInLoc(s, id, LOC, heroId);
    s = placeVillainCard(s, id, LOC, allyIds[0]);
    const slotIdx = vanquishSlotAt(s, id, LOC);
    const afterVanquish = vanquish(s, id, heroId, allyIds, slotIdx);
    const valAfterVanquish = evaluateState(afterVanquish, id);

    // Lady Marian debería estar en el descarte de Destino ahora mismo.
    const playerAfter = afterVanquish.players.find(p => p.id === id)!;
    expect(playerAfter.fateDiscardInstIds).toContain(heroId);

    // Simular que reaparece en el reino (p. ej. redibujada por Destino/Rival Digno) SIN
    // ningún Aliado esperándola esta vez.
    const reappeared = placeHeroInLoc(afterVanquish, id, 'jhon_bosque', heroId);
    const valReappeared = evaluateState(reappeared, id);

    expect(valReappeared, 'la IA no está viendo a Lady Marian como amenaza al reaparecer')
      .toBeLessThan(valAfterVanquish);
  });

  it('Toby: tras vencerlo (vuelve al mazo, no al descarte) y reaparecer, debe seguir viéndose como amenaza', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const LOC = 'jhon_nottingham';
    const heroId = findAll(s0, CardDefId.JHON_TOBY, 1)[0];
    const allyIds = findAll(s0, CardDefId.JHON_LELO, 1);

    let s = readyToActivateAt(s0, id, LOC);
    s = placeHeroInLoc(s, id, LOC, heroId);
    s = placeVillainCard(s, id, LOC, allyIds[0]);
    const slotIdx = vanquishSlotAt(s, id, LOC);
    const afterVanquish = vanquish(s, id, heroId, allyIds, slotIdx);
    const valAfterVanquish = evaluateState(afterVanquish, id);

    // Toby NO debería quedarse en el descarte de Destino (su habilidad lo devuelve al mazo).
    const playerAfter = afterVanquish.players.find(p => p.id === id)!;
    expect(playerAfter.fateDiscardInstIds).not.toContain(heroId);
    expect(playerAfter.fateDeckInstIds).toContain(heroId);

    const reappeared = placeHeroInLoc(afterVanquish, id, 'jhon_bosque', heroId);
    const valReappeared = evaluateState(reappeared, id);

    expect(valReappeared, 'la IA no está viendo a Toby como amenaza al reaparecer')
      .toBeLessThan(valAfterVanquish);
  });
});

// ─── Garfio: confirmar que su salvaguarda existente (HERO_TROPHY) sigue intacta ────────────

describe('Vencer nunca debe puntuar peor que no vencer — Garfio (control)', () => {
  // Héroe y Aliados van en Roca Calavera, NO en el Jolly Roger: el JR tiene su propio bono de
  // "2+ Aliados ahí = +25, preparando a Peter Pan" (ver evaluate.ts) que se perdería al gastar
  // esos Aliados en Vencer y contaminaría la medición del trap de gradiente real. El peón sí
  // necesita estar en el Jolly Roger (única casilla de Vencer de Garfio) — Vencer entre
  // ubicaciones distintas es legal (ver canVanquishFree en RuleEngine.ts).
  const PAWN_LOC = 'jollyroger';
  const HERO_LOC = 'skullrock';

  it('un héroe normal (Wendy, F3) ya cubierto por Aliados', () => {
    const s0 = makeState();
    const id = hookId(s0);
    const heroId = findAll(s0, 'hook_f_wendy', 1)[0];
    const allyIds = findAll(s0, 'hook_v_espadachin', 2); // F2+F2=4 >= 3
    expectVanquishNeverWorseAt(s0, id, PAWN_LOC, HERO_LOC, heroId, allyIds);
  });

  it('el héroe reaparece tras ser vencido: debe volver a puntuar como amenaza', () => {
    const s0 = makeState();
    const id = hookId(s0);
    const heroId = findAll(s0, 'hook_f_wendy', 1)[0];
    const allyIds = findAll(s0, 'hook_v_espadachin', 2);

    let s = readyToActivateAt(s0, id, PAWN_LOC);
    s = placeHeroInLoc(s, id, HERO_LOC, heroId);
    for (const allyId of allyIds) s = placeVillainCard(s, id, HERO_LOC, allyId);
    const slotIdx = vanquishSlotAt(s, id, PAWN_LOC);
    const afterVanquish = vanquish(s, id, heroId, allyIds, slotIdx);
    const valAfterVanquish = evaluateState(afterVanquish, id);

    const reappeared = placeHeroInLoc(afterVanquish, id, HERO_LOC, heroId);
    const valReappeared = evaluateState(reappeared, id);

    expect(valReappeared, 'la IA no está viendo al héroe reaparecido como amenaza')
      .toBeLessThan(valAfterVanquish);
  });
});

// ─── Maléfica: confirmar que su salvaguarda existente (UNCOVERED_READY persistente) sigue intacta

describe('Vencer nunca debe puntuar peor que no vencer — Maléfica (control)', () => {
  const LOC = 'castillo';

  it('un bloqueante genérico ya cubierto por un Aliado', () => {
    const s0 = makeState();
    const id = malId(s0);
    const heroId = findAll(s0, 'mal_f_', 1)[0];
    const allyId = findAll(s0, 'mal_v_salvaje', 1)[0]; // F4
    expectVanquishNeverWorse(s0, id, LOC, heroId, [allyId]);
  });

  // FASE 8a: el test de arriba usa a Aurora, que NO tiene blocksCursePlay — así que en
  // realidad nunca ejercitó la lógica propia de Maléfica (BLOCKER_ALLY_MATCH/BLOCKER_READY),
  // solo la penalización genérica de evaluateState. Este sí es un bloqueante de maldición real
  // (Primavera), y además exige un combo de 2 Aliados (F4, ninguno suelto llega).
  it('Primavera (F4, bloquea Maldiciones de verdad) cubierta por un combo de 2 Aliados', () => {
    const s0 = makeState();
    const id = malId(s0);
    const heroId = findAll(s0, 'mal_f_primavera', 1)[0];
    const allyIds = findAll(s0, 'mal_v_siniestro', 2); // F3+F3=6 >= 4
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });
});

// ─── Garfio: bloqueantes especiales (Burla, Tic Tac) y el objetivo final (Peter Pan) ───────
// FASE 8a: el "control" de arriba (Wendy) resultó no ser representativo — es un héroe NORMAL,
// no un bloqueante especial. Burla y Tic Tac tienen su propio bloque de pesos
// (BLOCKER_MATCH_AT_BURLA_LOC / BLOCKER_READY_AT_BURLA_LOC / ..._AT_OTHER_LOC), con su propio
// comentario "OJO" en el código afirmando que están calibrados a salvo — hay que comprobarlo,
// no darlo por hecho después de lo de Wendy.

describe('Vencer nunca debe puntuar peor que no vencer — Garfio: bloqueantes especiales', () => {
  // Mismo motivo que en el bloque "control": héroe y Aliados en Roca Calavera, peón en el
  // Jolly Roger solo para acceder a la casilla de Vencer, así no se contamina la medición con
  // el bono de "Aliados acumulados en JR" (ver evaluate.ts).
  const PAWN_LOC = 'jollyroger';
  const HERO_LOC = 'skullrock';

  function attachBurla(state: GameState, heroId: CardInstId, burlaId: CardInstId): GameState {
    return {
      ...state,
      allCards: {
        ...state.allCards,
        [burlaId]: { ...state.allCards[burlaId], attachedToInstId: heroId },
        [heroId]: {
          ...state.allCards[heroId],
          attachedItemInstIds: [...(state.allCards[heroId]?.attachedItemInstIds ?? []), burlaId],
        },
      },
    };
  }

  it('héroe con Burla (Campanilla, F2) ya cubierto por un Aliado', () => {
    const s0 = makeState();
    const id = hookId(s0);
    const heroId = findAll(s0, 'hook_f_campanilla', 1)[0];
    const burlaId = findAll(s0, 'hook_f_burla', 1)[0];
    const allyId = findAll(s0, 'hook_v_espadachin', 1)[0]; // F2, suficiente

    const s0Burla = attachBurla(s0, heroId, burlaId);
    expectVanquishNeverWorseAt(s0Burla, id, PAWN_LOC, HERO_LOC, heroId, [allyId]);
  });

  it('Tic Tac (F5) ya cubierto por Aliados', () => {
    const s0 = makeState();
    const id = hookId(s0);
    const heroId = findAll(s0, 'hook_f_tictac', 1)[0];
    const allyIds = findAll(s0, 'hook_v_maton', 2); // F4+F4=8 >= 5
    expectVanquishNeverWorseAt(s0, id, PAWN_LOC, HERO_LOC, heroId, allyIds);
  });

  it('Peter Pan (F8) en el Jolly Roger — objetivo final de la partida', () => {
    const s0 = makeState();
    const id = hookId(s0);
    const heroId = findAll(s0, CardDefId.HOOK_PETER_PAN, 1)[0];
    const allyIds = findAll(s0, 'hook_v_maton', 2); // F4+F4=8 >= 8
    // Aquí SÍ va todo en el Jolly Roger a propósito: es donde hay que vencer a Peter Pan.
    expectVanquishNeverWorse(s0, id, PAWN_LOC, heroId, allyIds);
  });
});

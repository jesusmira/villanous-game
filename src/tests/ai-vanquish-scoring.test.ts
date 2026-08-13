// ─── Batería de cordura para la puntuación de la IA al Vencer héroes (motor de intenciones) ──
// Invariante central: si un jugador YA tiene Aliados suficientes en la ubicación de un héroe
// (o adyacente, con habilidad especial) para Vencerlo, la acción de Vencer —puntuada por
// scoreAction() con la intención que la IA elegiría en ese estado— NUNCA debe salir negativa
// (peor que no hacer nada). Si esto falla, la IA prefiere quedarse "a punto" para siempre en vez
// de rematar (ver memoria project_ai_gradient_trap).
//
// También se comprueba la pregunta clave: si un héroe ya vencido VUELVE a aparecer en el reino
// (redibujado por Destino, Rival Digno, etc.), la IA debe seguir viéndolo como una amenaza viva.
import { describe, it, expect } from 'vitest';
import { canVanquish } from '../core/engine/RuleEngine';
import { vanquish } from '../core/engine/GameEngine';
import { getAvailableSlotIndices, getActionAtSlot } from '../core/engine/slotHelpers';
import { ActionType, TurnPhase } from '../core/types';
import type { GameState, PlayerId, CardInstId, LocationId } from '../core/types';
import { CardDefId } from '../core/villains/effectIds';
import { deadCards as jhonDeadCards } from '../core/villains/jhon/intentions';
import { buildAIContext } from '../core/ai/intent/context';
import { chooseIntention } from '../core/ai/intent/planner';
import { scoreAction } from '../core/ai/intent/actionScoring';
import type { ActionCandidate } from '../core/ai/intent/types';
import {
  makeState, hookId, malId, makeJhonState, jhonId,
  placeVillainCard, placeHeroInLoc, setPhase, setPawn, setCurrentPlayer, putInHand,
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

function readyToActivateAt(state: GameState, playerId: PlayerId, locId: LocationId): GameState {
  let s = setCurrentPlayer(state, playerId);
  s = setPhase(s, TurnPhase.ACTIVATE);
  s = setPawn(s, playerId, locId);
  return s;
}

/** Valor holístico de un estado (suma de todas las intenciones aplicables + progreso propio) —
 *  para comparaciones directas estado-vs-estado que no encajan en el puntuador por delta de
 *  una acción concreta (p. ej. "¿este héroe sigue viéndose como amenaza tras reaparecer?"). */
function totalStateValue(state: GameState, playerId: PlayerId): number {
  const { all } = chooseIntention(state, playerId);
  const ctx = buildAIContext(state, playerId);
  // polarity convierte cada score (calibrado para SELECCIONAR intención) en una contribución de
  // "bondad" homogénea: para intenciones de logro, más score es mejor (+); para intenciones de
  // urgencia, más score es peor, es una necesidad sin resolver (−). Ver IntentionDef.polarity.
  return ctx.ownProgress * 8 + all.reduce((sum, i) => sum + i.score * i.polarity, 0);
}

/** Puntúa la acción de Vencer con scoreAction(), usando la intención que la IA elegiría en ese
 *  estado — igual que hace el planificador de verdad. */
function scoreVanquish(
  state: GameState, playerId: PlayerId, heroId: CardInstId, allyIds: CardInstId[], slotIdx: number,
) {
  const ctxBefore = buildAIContext(state, playerId);
  const { chosen } = chooseIntention(state, playerId);
  const resultState = vanquish(state, playerId, heroId, allyIds, slotIdx);
  const candidate: ActionCandidate = {
    kind: ActionType.VANQUISH, slotIdx, label: 'Vencer', resultState, isRepositioning: false,
  };
  return scoreAction(ctxBefore, candidate, chosen, playerId);
}

/** Coloca héroe + Aliados en la misma ubicación y comprueba el invariante central. */
function expectVanquishNeverWorse(
  state: GameState, playerId: PlayerId, locId: LocationId, heroId: CardInstId, allyIds: CardInstId[],
) {
  return expectVanquishNeverWorseAt(state, playerId, locId, locId, heroId, allyIds);
}

/**
 * Igual que expectVanquishNeverWorse(), pero permite separar dónde está el peón (necesita
 * casilla de Vencer) de dónde están héroe + Aliados (Vencer entre ubicaciones distintas es
 * legal, ver canVanquishFree en RuleEngine.ts).
 */
function expectVanquishNeverWorseAt(
  state: GameState, playerId: PlayerId, pawnLocId: LocationId, heroLocId: LocationId,
  heroId: CardInstId, allyIds: CardInstId[],
) {
  let s = readyToActivateAt(state, playerId, pawnLocId);
  s = placeHeroInLoc(s, playerId, heroLocId, heroId);
  for (const allyId of allyIds) s = placeVillainCard(s, playerId, heroLocId, allyId);

  const slotIdx = vanquishSlotAt(s, playerId, pawnLocId);
  const check = canVanquish(s, playerId, heroId, allyIds, slotIdx);
  expect(check.valid, check.reason).toBe(true);

  const scored = scoreVanquish(s, playerId, heroId, allyIds, slotIdx);
  expect(
    scored.breakdown.total,
    `vencer puntuó ${scored.breakdown.total.toFixed(2)} < 0 — la IA preferiría no rematar`,
  ).toBeGreaterThanOrEqual(0);
  return scored;
}

// ─── Príncipe Juan: un caso por cada héroe real de su mazo de Destino ─────────────

describe('Vencer nunca debe puntuar peor que no vencer — Príncipe Juan', () => {
  const LOC = 'jhon_nottingham';

  it('Toby (F2) — caso especial: vuelve al mazo de Destino, nunca queda en el descarte', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, CardDefId.JHON_TOBY, 1)[0];
    const allyIds = findAll(s0, CardDefId.JHON_LELO, 1);
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  it('Skippy (F2)', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, 'jhon_f_skippy', 1)[0];
    const allyIds = findAll(s0, 'jhon_v_hiss', 1);
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  it('Alan-a-Dale (F2)', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, CardDefId.JHON_ALAN_A_DALE, 1)[0];
    const allyIds = findAll(s0, CardDefId.JHON_ARQUEROS, 1);
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  it('Fraile Tuck (F3)', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, 'jhon_f_fraile', 1)[0];
    const allyIds = findAll(s0, 'jhon_v_sherif', 1);
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  // Lady Marian es un caso aparte: al morir, saca a Robin Hood del mazo/descarte y lo juega de
  // inmediato en su misma ubicación (ver findAndPlayRobinHood en jhon/resolvers.ts). Es una
  // consecuencia MECÁNICA real, no un bug de puntuación.
  it('Lady Marian (F3) SIN refuerzo para Robin Hood — vencerla sola SÍ debe puntuar peor (a propósito)', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, CardDefId.JHON_LADY_MARIAN, 1)[0];
    const allyIds = findAll(s0, CardDefId.JHON_TIRO_LISTO, 1);

    let s = readyToActivateAt(s0, id, LOC);
    s = placeHeroInLoc(s, id, LOC, heroId);
    for (const allyId of allyIds) s = placeVillainCard(s, id, LOC, allyId);
    const slotIdx = vanquishSlotAt(s, id, LOC);
    const scored = scoreVanquish(s, id, heroId, allyIds, slotIdx);

    const robinId = findAll(s0, CardDefId.JHON_ROBIN_HOOD, 1)[0];
    expect(scored.resultState.players.find(p => p.id === id)!.locationStates[LOC].heroCardInstIds).toContain(robinId);

    expect(scored.breakdown.total, 'se esperaba que empeorase al despertar a Robin Hood sin estar preparado')
      .toBeLessThan(0);
  });

  it('Lady Marian (F3) CON refuerzo ya listo para Robin Hood — el combo completo no debe empeorar', () => {
    // Mano vaciada a propósito: makeJhonState() reparte una mano ALEATORIA, y si por azar
    // contiene un Objeto que se adjunta a un Aliado (Flecha Dorada/Arco con Flechas), consumir
    // TODOS los Aliados del reino al Vencer lo vuelve "muerto" como efecto colateral — ruido
    // ajeno a lo que este test comprueba (que rematar el combo no empeore el estado).
    const base = makeJhonState();
    const id = jhonId(base);
    const s0 = clearHand(base, id);
    const heroId = findAll(s0, CardDefId.JHON_LADY_MARIAN, 1)[0];
    const marianAllies = findAll(s0, CardDefId.JHON_TIRO_LISTO, 1);
    const robinId = findAll(s0, CardDefId.JHON_ROBIN_HOOD, 1)[0];
    const robinAllies = findAll(s0, 'jhon_v_rino', 2);

    let s = readyToActivateAt(s0, id, LOC);
    s = placeHeroInLoc(s, id, LOC, heroId);
    for (const allyId of [...marianAllies, ...robinAllies]) s = placeVillainCard(s, id, LOC, allyId);
    const slotIdx = vanquishSlotAt(s, id, LOC);
    const before = totalStateValue(s, id);

    // Jhon solo tiene UNA casilla de Vencer (Nottingham): en la partida real esto no se
    // encadena en el mismo turno, se llama a vanquish() dos veces para medir el resultado
    // FINAL una vez resuelto lo de Robin Hood, sin importar en cuántos turnos.
    let after = vanquish(s, id, heroId, marianAllies, slotIdx);
    expect(after.players.find(p => p.id === id)!.locationStates[LOC].heroCardInstIds).toContain(robinId);
    after = vanquish(after, id, robinId, robinAllies, slotIdx);
    const afterVal = totalStateValue(after, id);

    expect(afterVal, 'ir preparado para ambos no debería puntuar peor que no haber empezado')
      .toBeGreaterThanOrEqual(before);
  });

  it('Little John (F5)', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, 'jhon_f_littlejohn', 1)[0];
    const allyIds = [...findAll(s0, 'jhon_v_rino', 1), ...findAll(s0, CardDefId.JHON_ARQUEROS, 1)];
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  it('Lady Kluck (F6)', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, 'jhon_f_kluck', 1)[0];
    const allyIds = [...findAll(s0, 'jhon_v_rino', 1), ...findAll(s0, CardDefId.JHON_TIRO_LISTO, 1)];
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  it('Robin Hood (F5) — tiene penalización dedicada propia', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, CardDefId.JHON_ROBIN_HOOD, 1)[0];
    const allyIds = [...findAll(s0, 'jhon_v_rino', 1), ...findAll(s0, CardDefId.JHON_ARQUEROS, 1)];
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });

  it('Rey Ricardo (F5) — tiene penalización dedicada propia', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, CardDefId.JHON_REY_RICARDO, 1)[0];
    const allyIds = [...findAll(s0, 'jhon_v_rino', 1), ...findAll(s0, CardDefId.JHON_ARQUEROS, 1)];
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });
});

// ─── La pregunta clave: ¿un héroe que reaparece se sigue tratando como amenaza? ───────────

describe('Un héroe ya vencido que reaparece debe volver a puntuar como amenaza', () => {
  it('Lady Marian: tras vencerla y volver a colocarla, el valor del estado debe EMPEORAR de nuevo', () => {
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
    const valAfterVanquish = totalStateValue(afterVanquish, id);

    const playerAfter = afterVanquish.players.find(p => p.id === id)!;
    expect(playerAfter.fateDiscardInstIds).toContain(heroId);

    const reappeared = placeHeroInLoc(afterVanquish, id, 'jhon_bosque', heroId);
    const valReappeared = totalStateValue(reappeared, id);

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
    const valAfterVanquish = totalStateValue(afterVanquish, id);

    const playerAfter = afterVanquish.players.find(p => p.id === id)!;
    expect(playerAfter.fateDiscardInstIds).not.toContain(heroId);
    expect(playerAfter.fateDeckInstIds).toContain(heroId);

    const reappeared = placeHeroInLoc(afterVanquish, id, 'jhon_bosque', heroId);
    const valReappeared = totalStateValue(reappeared, id);

    expect(valReappeared, 'la IA no está viendo a Toby como amenaza al reaparecer')
      .toBeLessThan(valAfterVanquish);
  });
});

// ─── Garfio: héroe normal ─────────────────────────────────────────────────────────

describe('Vencer nunca debe puntuar peor que no vencer — Garfio (control)', () => {
  const PAWN_LOC = 'jollyroger';
  const HERO_LOC = 'skullrock';

  it('un héroe normal (Wendy, F3) ya cubierto por Aliados', () => {
    const s0 = makeState();
    const id = hookId(s0);
    const heroId = findAll(s0, 'hook_f_wendy', 1)[0];
    const allyIds = findAll(s0, 'hook_v_espadachin', 2);
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
    const valAfterVanquish = totalStateValue(afterVanquish, id);

    const reappeared = placeHeroInLoc(afterVanquish, id, HERO_LOC, heroId);
    const valReappeared = totalStateValue(reappeared, id);

    expect(valReappeared, 'la IA no está viendo al héroe reaparecido como amenaza')
      .toBeLessThan(valAfterVanquish);
  });
});

// ─── Proximidad de Aliados libres hacia la amenaza prioritaria (universal) ────────────────
// Reemplaza a la antigua FASE 12 (jhon/ai.ts PRIORITY_THREAT_PROXIMITY): ahora es un término
// genérico en universalIntentions.ts (prepareCombo), válido para cualquier villano — se prueba
// directamente sobre la intención en vez de sobre una fórmula específica de un solo villano.
// Tablero de Jhon es lineal: Bosque(3) — Iglesia(2) — Nottingham(1, hero aquí) — Prisión.

describe('Preparar combo: un Aliado libre más cerca de la amenaza prioritaria puntúa mejor', () => {
  it('un Aliado a 1 salto de Rey Ricardo vale más que el mismo Aliado a 2 saltos', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const heroId = findAll(s0, CardDefId.JHON_REY_RICARDO, 1)[0];
    const allyId = findAll(s0, CardDefId.JHON_LELO, 1)[0];
    const base = placeHeroInLoc(s0, id, 'jhon_nottingham', heroId);

    const near = placeVillainCard(base, id, 'jhon_iglesia', allyId); // 1 salto de Nottingham
    const far = placeVillainCard(base, id, 'jhon_bosque', allyId);   // 2 saltos de Nottingham

    const { all: allNear } = chooseIntention(near, id);
    const { all: allFar } = chooseIntention(far, id);
    const comboNearIntent = allNear.find(i => i.id === 'PREPARE_COMBO')!;
    const comboFarIntent = allFar.find(i => i.id === 'PREPARE_COMBO')!;
    // PREPARE_COMBO es de urgencia (polarity −1: más score = más hueco sin cubrir todavía), así
    // que "puntúa mejor" se mide con la contribución de BONDAD (score × polarity), no el score
    // crudo — un Aliado más cerca deja MENOS hueco pendiente (score crudo más bajo).
    const goodnessNear = comboNearIntent.score * comboNearIntent.polarity;
    const goodnessFar = comboFarIntent.score * comboFarIntent.polarity;

    expect(goodnessNear, 'el Aliado más cerca de Rey Ricardo debería dejar menos hueco pendiente en Preparar combo')
      .toBeGreaterThan(goodnessFar);
  });
});

// ─── Aliado dominado por otro Aliado de la misma mano se cicla proactivamente ─────────────

function clearHand(state: GameState, playerId: PlayerId): GameState {
  return { ...state, players: state.players.map(p => p.id === playerId ? { ...p, handInstIds: [] } : p) };
}

describe('Cartas muertas en mano — Príncipe Juan', () => {
  it('Sir Hiss (coste 2, F2) se marca muerto si Tiro Listo (coste 2, F4) también está en mano', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const hissId = Object.keys(s0.allCards).find(cid => s0.allCards[cid]?.defId === 'jhon_v_hiss')!;
    const tiroId = Object.keys(s0.allCards).find(cid => s0.allCards[cid]?.defId === CardDefId.JHON_TIRO_LISTO)!;
    expect(hissId).toBeTruthy();
    expect(tiroId).toBeTruthy();

    let s = clearHand(s0, id);
    s = putInHand(s, id, hissId);
    s = putInHand(s, id, tiroId);
    const player = s.players.find(p => p.id === id)!;

    const dead = jhonDeadCards(s, player);
    expect(dead).toContain(hissId);
    expect(dead).not.toContain(tiroId);
  });

  it('dos copias idénticas del mismo Aliado no se dominan entre sí', () => {
    const s0 = makeJhonState();
    const id = jhonId(s0);
    const arqueroIds = Object.keys(s0.allCards)
      .filter(cid => s0.allCards[cid]?.defId?.startsWith(CardDefId.JHON_ARQUEROS)).slice(0, 2);
    expect(arqueroIds.length).toBe(2);

    let s = clearHand(s0, id);
    s = putInHand(s, id, arqueroIds[0]);
    s = putInHand(s, id, arqueroIds[1]);
    const player = s.players.find(p => p.id === id)!;

    const dead = jhonDeadCards(s, player);
    expect(dead).not.toContain(arqueroIds[0]);
    expect(dead).not.toContain(arqueroIds[1]);
  });
});

// ─── Maléfica: bloqueante genérico ya cubierto ─────────────────────────────────────

describe('Vencer nunca debe puntuar peor que no vencer — Maléfica (control)', () => {
  const LOC = 'castillo';

  it('un bloqueante genérico ya cubierto por un Aliado', () => {
    const s0 = makeState();
    const id = malId(s0);
    const heroId = findAll(s0, 'mal_f_', 1)[0];
    const allyId = findAll(s0, 'mal_v_salvaje', 1)[0];
    expectVanquishNeverWorse(s0, id, LOC, heroId, [allyId]);
  });

  it('Primavera (F4, bloquea Maldiciones de verdad) cubierta por un combo de 2 Aliados', () => {
    const s0 = makeState();
    const id = malId(s0);
    const heroId = findAll(s0, 'mal_f_primavera', 1)[0];
    const allyIds = findAll(s0, 'mal_v_siniestro', 2);
    expectVanquishNeverWorse(s0, id, LOC, heroId, allyIds);
  });
});

// ─── Garfio: bloqueantes especiales (Burla, Tic Tac) y el objetivo final (Peter Pan) ───────

describe('Vencer nunca debe puntuar peor que no vencer — Garfio: bloqueantes especiales', () => {
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
    const allyId = findAll(s0, 'hook_v_espadachin', 1)[0];

    const s0Burla = attachBurla(s0, heroId, burlaId);
    expectVanquishNeverWorseAt(s0Burla, id, PAWN_LOC, HERO_LOC, heroId, [allyId]);
  });

  it('Tic Tac (F5) ya cubierto por Aliados', () => {
    const s0 = makeState();
    const id = hookId(s0);
    const heroId = findAll(s0, 'hook_f_tictac', 1)[0];
    const allyIds = findAll(s0, 'hook_v_maton', 2);
    expectVanquishNeverWorseAt(s0, id, PAWN_LOC, HERO_LOC, heroId, allyIds);
  });

  it('Peter Pan (F8) en el Jolly Roger — objetivo final de la partida', () => {
    const s0 = makeState();
    const id = hookId(s0);
    const heroId = findAll(s0, CardDefId.HOOK_PETER_PAN, 1)[0];
    const allyIds = findAll(s0, 'hook_v_maton', 2);
    expectVanquishNeverWorse(s0, id, PAWN_LOC, heroId, allyIds);
  });
});

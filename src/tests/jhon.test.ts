import { describe, it, expect } from 'vitest';
import { playCard } from '../core/engine/actions/play';
import { activateSherif } from '../core/engine/actions/turn';
import { computeKingdomCostMod } from '../core/engine/stateHelpers';
import { getCoveredSlotIndices, getAvailableSlotIndices, getHissChoiceSlotIndices } from '../core/engine/slotHelpers';
import { TurnPhase } from '../core/types';
import {
  makeJhonState, jhonId, findCard,
  putInHand, placeVillainCard, placeHeroInLoc,
  setPhase, setPower, setPawn,
} from './helpers/factories';

// Ubicaciones del Príncipe Juan:
//   bosque ── iglesia ── nottingham ── prison
// iglesia actions: [GAIN_POWER(0), PLAY_CARD(1), PLAY_CARD(2), MOVE_ITEM_ALLY(3)]
// nottingham actions: [FATE(0), GAIN_POWER(1), VANQUISH(2), PLAY_CARD(3)]

// ─── Corona del Rey Ricardo ─────────────────────────────────────────────────────

describe('Corona del Rey Ricardo', () => {
  it('reduce el coste en -1 cuando el peón está en su ubicación', () => {
    let s = makeJhonState();
    const pj = jhonId(s);
    const corona = findCard(s, 'jhon_v_corona')!;
    s = placeVillainCard(s, pj, 'jhon_iglesia', corona);
    const rino = s.allCards[findCard(s, 'jhon_v_rino')!];

    s = setPawn(s, pj, 'jhon_iglesia');
    expect(computeKingdomCostMod(s, pj, rino, 'jhon_iglesia')).toBe(-1);

    // Peón fuera de la ubicación de la Corona → sin reducción
    s = setPawn(s, pj, 'jhon_bosque');
    expect(computeKingdomCostMod(s, pj, rino, 'jhon_bosque')).toBe(0);
  });

  it('al jugar una carta se descuenta el coste reducido del Poder', () => {
    let s = makeJhonState();
    const pj = jhonId(s);
    const corona = findCard(s, 'jhon_v_corona')!;
    s = placeVillainCard(s, pj, 'jhon_iglesia', corona);
    s = setPawn(s, pj, 'jhon_iglesia');
    s = setPhase(s, TurnPhase.ACTIVATE);
    s = setPower(s, pj, 10);

    const rino = findCard(s, 'jhon_v_rino')!; // coste base 3
    s = putInHand(s, pj, rino);
    s = playCard(s, pj, rino, 1, 'jhon_iglesia'); // ranura PLAY_CARD

    // 3 (base) − 1 (Corona) = 2 → 10 − 2 = 8
    expect(s.players.find(p => p.id === pj)!.power).toBe(8);
  });

  it('sin Corona se descuenta el coste completo', () => {
    let s = makeJhonState();
    const pj = jhonId(s);
    s = setPawn(s, pj, 'jhon_iglesia');
    s = setPhase(s, TurnPhase.ACTIVATE);
    s = setPower(s, pj, 10);

    const rino = findCard(s, 'jhon_v_rino')!; // coste base 3
    s = putInHand(s, pj, rino);
    s = playCard(s, pj, rino, 1, 'jhon_iglesia');

    expect(s.players.find(p => p.id === pj)!.power).toBe(7); // 10 − 3
  });
});

// ─── Sheriff de Nottingham ──────────────────────────────────────────────────────

describe('Sheriff de Nottingham', () => {
  it('al moverse a una ubicación con Héroes, da +1 Moneda', () => {
    let s = makeJhonState();
    const pj = jhonId(s);
    const sherif = findCard(s, 'jhon_v_sherif')!;
    s = placeVillainCard(s, pj, 'jhon_nottingham', sherif);
    s = placeHeroInLoc(s, pj, 'jhon_iglesia', findCard(s, 'jhon_f_skippy')!);
    s = setPower(s, pj, 5);
    s = setPhase(s, TurnPhase.MOVE);

    const after = activateSherif(s, pj, sherif, 'jhon_iglesia'); // con héroe
    expect(after.allCards[sherif].locationId).toBe('jhon_iglesia');
    expect(after.players.find(p => p.id === pj)!.power).toBe(6);
  });

  it('moverse a una ubicación SIN Héroes no da Moneda', () => {
    let s = makeJhonState();
    const pj = jhonId(s);
    const sherif = findCard(s, 'jhon_v_sherif')!;
    s = placeVillainCard(s, pj, 'jhon_nottingham', sherif);
    s = setPower(s, pj, 5);
    s = setPhase(s, TurnPhase.MOVE);

    const after = activateSherif(s, pj, sherif, 'jhon_prison'); // sin héroes
    expect(after.allCards[sherif].locationId).toBe('jhon_prison');
    expect(after.players.find(p => p.id === pj)!.power).toBe(5);
  });

  it('puede moverse a CUALQUIER ubicación (no solo adyacentes) y cobra si hay Héroes', () => {
    let s = makeJhonState();
    const pj = jhonId(s);
    const sherif = findCard(s, 'jhon_v_sherif')!;
    s = placeVillainCard(s, pj, 'jhon_nottingham', sherif);
    s = placeHeroInLoc(s, pj, 'jhon_bosque', findCard(s, 'jhon_f_skippy')!);
    s = setPower(s, pj, 5);
    s = setPhase(s, TurnPhase.MOVE);

    const after = activateSherif(s, pj, sherif, 'jhon_bosque'); // no adyacente a nottingham
    expect(after.allCards[sherif].locationId).toBe('jhon_bosque');
    expect(after.players.find(p => p.id === pj)!.power).toBe(6);
  });
});

// ─── Sir Hiss ───────────────────────────────────────────────────────────────────

describe('Sir Hiss', () => {
  it('ofrece elegir cualquiera de las casillas tapadas cuando el peón está en su ubicación', () => {
    let s = makeJhonState();
    const pj = jhonId(s);
    s = placeVillainCard(s, pj, 'jhon_iglesia', findCard(s, 'jhon_v_hiss')!);
    s = placeHeroInLoc(s, pj, 'jhon_iglesia', findCard(s, 'jhon_f_skippy')!);
    s = placeHeroInLoc(s, pj, 'jhon_iglesia', findCard(s, 'jhon_f_toby')!);
    s = setPawn(s, pj, 'jhon_iglesia');

    // El tapado real sigue siendo de 2 ranuras, pero ambas son elegibles vía Sir Hiss
    expect(getCoveredSlotIndices(s, pj, 'jhon_iglesia')).toEqual([0, 1]);
    expect(getHissChoiceSlotIndices(s, pj, 'jhon_iglesia')).toEqual([0, 1]);
    const avail = getAvailableSlotIndices(s, pj, 'jhon_iglesia');
    expect(avail).toContain(0);
    expect(avail).toContain(1);
  });

  it('tras usar una casilla tapada, deja de ofrecer las demás (solo una por turno)', () => {
    let s = makeJhonState();
    const pj = jhonId(s);
    s = placeVillainCard(s, pj, 'jhon_iglesia', findCard(s, 'jhon_v_hiss')!);
    s = placeHeroInLoc(s, pj, 'jhon_iglesia', findCard(s, 'jhon_f_skippy')!);
    s = placeHeroInLoc(s, pj, 'jhon_iglesia', findCard(s, 'jhon_f_toby')!);
    s = setPawn(s, pj, 'jhon_iglesia');

    // Simula haber usado la casilla tapada 0
    const used = { ...s, usedActionSlotIndices: [0] };
    expect(getHissChoiceSlotIndices(used, pj, 'jhon_iglesia')).toEqual([]);
    expect(getAvailableSlotIndices(used, pj, 'jhon_iglesia')).not.toContain(1);
  });

  it('no ofrece nada si el peón no está en la ubicación de Sir Hiss', () => {
    let s = makeJhonState();
    const pj = jhonId(s);
    s = placeVillainCard(s, pj, 'jhon_iglesia', findCard(s, 'jhon_v_hiss')!);
    s = placeHeroInLoc(s, pj, 'jhon_iglesia', findCard(s, 'jhon_f_skippy')!);
    s = placeHeroInLoc(s, pj, 'jhon_iglesia', findCard(s, 'jhon_f_toby')!);
    s = setPawn(s, pj, 'jhon_bosque');

    expect(getHissChoiceSlotIndices(s, pj, 'jhon_iglesia')).toEqual([]);
    expect(getCoveredSlotIndices(s, pj, 'jhon_iglesia')).toEqual([0, 1]);
  });
});

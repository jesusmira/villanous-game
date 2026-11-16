import { describe, it, expect } from 'vitest';
import { canVanquish, canVanquishFree, allyCannotVanquishHero } from '../core/engine/RuleEngine';
import { generateSlotCandidates } from '../core/ai/intent/legalMoves';
import { ActionType, TurnPhase } from '../core/types';
import type { GameState } from '../core/types';
import {
  makeJhonState, jhonId, findCard, placeVillainCard, placeHeroInLoc, setPhase, setPawn,
} from './helpers/factories';

// Skippy: "Los Arqueros Lobo no pueden ser utilizados para derrotar a Skippy."
// Nottingham: [FATE(0), GAIN_POWER(1), VANQUISH(2), PLAY_CARD(3)]; adyacente a Iglesia y Prisión.

const LOC = 'jhon_nottingham';
const VANQUISH_SLOT = 2;

function setup(): { s: GameState; id: string; skippy: string; arqueros: string; rino: string; fraile: string } {
  let s = makeJhonState();
  const id = jhonId(s);
  s = setPhase(s, TurnPhase.ACTIVATE);
  s = setPawn(s, id, LOC);
  return {
    s, id,
    skippy:   findCard(s, 'jhon_f_skippy')!,     // Fuerza 2
    arqueros: findCard(s, 'jhon_v_arqueros')!,   // Fuerza 2
    rino:     findCard(s, 'jhon_v_rino')!,       // Fuerza 4
    fraile:   findCard(s, 'jhon_f_fraile')!,     // Fuerza 3
  };
}

describe('Skippy no puede ser derrotado con Arqueros Lobo', () => {
  it('rechaza Vencer a Skippy usando Arqueros Lobo (aunque la Fuerza alcance)', () => {
    const ctx = setup();
    const { id, skippy, arqueros } = ctx;
    let s = ctx.s;
    s = placeHeroInLoc(s, id, LOC, skippy);
    s = placeVillainCard(s, id, LOC, arqueros);
    const res = canVanquish(s, id, skippy, [arqueros], VANQUISH_SLOT);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Arqueros Lobo');
  });

  it('rechaza también si los Arqueros van acompañados de otro Aliado', () => {
    const ctx = setup();
    const { id, skippy, arqueros, rino } = ctx;
    let s = ctx.s;
    s = placeHeroInLoc(s, id, LOC, skippy);
    s = placeVillainCard(s, id, LOC, arqueros);
    s = placeVillainCard(s, id, LOC, rino);
    expect(canVanquish(s, id, skippy, [rino, arqueros], VANQUISH_SLOT).valid).toBe(false);
  });

  it('rechaza también el Vencer gratuito (Trampa)', () => {
    const ctx = setup();
    const { id, skippy, arqueros } = ctx;
    let s = ctx.s;
    s = placeHeroInLoc(s, id, LOC, skippy);
    s = placeVillainCard(s, id, LOC, arqueros);
    expect(canVanquishFree(s, id, skippy, [arqueros]).valid).toBe(false);
  });

  it('acepta Vencer a Skippy con otro Aliado', () => {
    const ctx = setup();
    const { id, skippy, rino } = ctx;
    let s = ctx.s;
    s = placeHeroInLoc(s, id, LOC, skippy);
    s = placeVillainCard(s, id, LOC, rino);
    expect(canVanquish(s, id, skippy, [rino], VANQUISH_SLOT).valid).toBe(true);
  });

  it('los Arqueros Lobo siguen pudiendo derrotar a otros Héroes', () => {
    const ctx = setup();
    const { id, fraile, arqueros, rino } = ctx;
    let s = ctx.s;
    s = placeHeroInLoc(s, id, LOC, fraile);
    s = placeVillainCard(s, id, LOC, arqueros);
    s = placeVillainCard(s, id, LOC, rino);
    expect(allyCannotVanquishHero(s, fraile, arqueros)).toBe(false);
    expect(canVanquish(s, id, fraile, [arqueros, rino], VANQUISH_SLOT).valid).toBe(true);
  });

  it('la IA no propone Vencer a Skippy si solo tiene Arqueros Lobo', () => {
    const ctx = setup();
    const { id, skippy, arqueros } = ctx;
    let s = ctx.s;
    s = placeHeroInLoc(s, id, LOC, skippy);
    s = placeVillainCard(s, id, LOC, arqueros);
    const cands = generateSlotCandidates(s, id, VANQUISH_SLOT, ActionType.VANQUISH);
    expect(cands.some(c => c.label.includes('Skippy'))).toBe(false);
  });

  it('la IA vence a Skippy con otro Aliado y deja a los Arqueros en el Reino', () => {
    const ctx = setup();
    const { id, skippy, arqueros, rino } = ctx;
    let s = ctx.s;
    s = placeHeroInLoc(s, id, LOC, skippy);
    s = placeVillainCard(s, id, LOC, arqueros);
    s = placeVillainCard(s, id, LOC, rino);
    const cand = generateSlotCandidates(s, id, VANQUISH_SLOT, ActionType.VANQUISH)
      .find(c => c.label.includes('Skippy'));
    expect(cand).toBeDefined();
    const after = cand!.resultState;
    const me = after.players.find(p => p.id === id)!;
    expect(me.locationStates[LOC].heroCardInstIds).not.toContain(skippy);
    expect(me.locationStates[LOC].villainCardInstIds).toContain(arqueros);
    expect(me.locationStates[LOC].villainCardInstIds).not.toContain(rino);
  });
});

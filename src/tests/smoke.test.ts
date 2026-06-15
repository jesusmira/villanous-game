import { describe, it, expect } from 'vitest';
import { makeState, malId, hookId, findCard, putInHand, placeVillainCard, setPower, setPhase } from './helpers/factories';
import { TurnPhase } from '../core/types';

describe('makeState', () => {
  it('creates a valid initial state', () => {
    const s = makeState();
    expect(s.players).toHaveLength(2);
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.turnPhase).toBe(TurnPhase.MOVE);
    expect(s.winner).toBeNull();
    expect(s.roundNumber).toBe(1);
  });

  it('Maleficent starts with 4 locations', () => {
    const s = makeState();
    const mal = s.players.find(p => p.id === malId(s))!;
    expect(Object.keys(mal.locationStates)).toHaveLength(4);
    expect(mal.locationStates['bosque']).toBeDefined();
    expect(mal.locationStates['castillo']).toBeDefined();
  });

  it('both players start with cards in hand', () => {
    const s = makeState();
    const mal = s.players.find(p => p.id === malId(s))!;
    const hook = s.players.find(p => p.id === hookId(s))!;
    expect(mal.handInstIds.length).toBeGreaterThan(0);
    expect(hook.handInstIds.length).toBeGreaterThan(0);
  });

  it('Maleficent starts with 0 power, Hook with 1', () => {
    const s = makeState();
    const mal = s.players.find(p => p.id === malId(s))!;
    const hook = s.players.find(p => p.id === hookId(s))!;
    expect(mal.power).toBe(0);
    expect(hook.power).toBe(1);
  });

  it('allCards contains instances from both villains', () => {
    const s = makeState();
    const allDefs = Object.values(s.allCards).map(c => c.defId);
    expect(allDefs.some(d => d.startsWith('mal_'))).toBe(true);
    expect(allDefs.some(d => d.startsWith('hook_'))).toBe(true);
  });
});

describe('factory helpers', () => {
  it('findCard locates a card by defId prefix', () => {
    const s = makeState();
    const id = findCard(s, 'mal_v_selva');
    expect(id).toBeDefined();
    expect(s.allCards[id!].defId).toMatch(/^mal_v_selva/);
  });

  it('putInHand moves a card from deck to hand', () => {
    let s = makeState();
    const mal = s.players.find(p => p.id === malId(s))!;
    const deckCard = mal.villainDeckInstIds[0];
    s = putInHand(s, malId(s), deckCard);
    const malAfter = s.players.find(p => p.id === malId(s))!;
    expect(malAfter.handInstIds).toContain(deckCard);
    expect(malAfter.villainDeckInstIds).not.toContain(deckCard);
  });

  it('placeVillainCard puts a card in a location', () => {
    let s = makeState();
    const selvaId = findCard(s, 'mal_v_selva')!;
    s = putInHand(s, malId(s), selvaId);
    s = placeVillainCard(s, malId(s), 'bosque', selvaId);
    const mal = s.players.find(p => p.id === malId(s))!;
    expect(mal.locationStates['bosque'].villainCardInstIds).toContain(selvaId);
    expect(mal.handInstIds).not.toContain(selvaId);
    expect(s.allCards[selvaId].locationId).toBe('bosque');
  });

  it('setPower sets player power', () => {
    let s = makeState();
    s = setPower(s, malId(s), 7);
    expect(s.players.find(p => p.id === malId(s))!.power).toBe(7);
  });

  it('setPhase sets the turn phase', () => {
    let s = makeState();
    s = setPhase(s, TurnPhase.ACTIVATE);
    expect(s.turnPhase).toBe(TurnPhase.ACTIVATE);
  });
});

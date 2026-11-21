import { describe, it, expect } from 'vitest';
import { startFate, resolveFate } from '../core/engine/actions/fate';
import { TurnPhase } from '../core/types';
import type { GameState } from '../core/types';
import { makeState, malId, hookId, setPhase, setPawn } from './helpers/factories';

// Maléfica (P1) usa Destino contra Garfio (P2). montanas: [MOVE_ITEM_ALLY, PLAY_CARD, GAIN_POWER, FATE(3)].
const FATE_SLOT = 3;

/** Deja el mazo de Destino de Garfio con `deck` cartas y `discard` en la pila de descartes. */
function withHookFate(deckSize: number, discardSize: number): { s: GameState; ids: string[] } {
  let s = setPawn(setPhase(makeState(), TurnPhase.ACTIVATE), malId(makeState()), 'montanas');
  const hook = s.players.find(p => p.id === hookId(s))!;
  // Sin Peter Pan: se juega solo al revelarse y alteraría el recuento.
  const ids = hook.fateDeckInstIds.filter(id => s.allCards[id]?.defId !== 'hook_fate_peter_pan');
  s = {
    ...s,
    players: s.players.map(p => p.id !== hook.id ? p : {
      ...p,
      fateDeckInstIds: ids.slice(0, deckSize),
      fateDiscardInstIds: ids.slice(deckSize, deckSize + discardSize),
    }),
  };
  return { s, ids: ids.slice(0, deckSize + discardSize) };
}

const hookIdx = (s: GameState) => s.players.findIndex(p => p.id === hookId(s));
const hookOf  = (s: GameState) => s.players.find(p => p.id === hookId(s))!;

describe('Destino con el mazo casi agotado', () => {
  it('con 1 carta en el mazo junta mazo + descartes, baraja y revela 2', () => {
    const { s, ids } = withHookFate(1, 5);
    const after = startFate(s, malId(s), hookIdx(s), FATE_SLOT);
    expect(after.pendingFate?.revealedInstIds).toHaveLength(2);
    const h = hookOf(after);
    expect(h.fateDiscardInstIds).toHaveLength(0);
    expect(h.fateDeckInstIds).toHaveLength(4);
    // Ninguna carta se pierde ni se duplica: las 6 siguen repartidas entre mazo y reveladas.
    const all = [...h.fateDeckInstIds, ...after.pendingFate!.revealedInstIds].sort();
    expect(all).toEqual([...ids].sort());
    expect(after.log).toContain('Mazo de Destino barajado.');
  });

  it('con 2 o más cartas en el mazo no baraja ni toca los descartes', () => {
    const { s } = withHookFate(3, 4);
    const deckBefore = hookOf(s).fateDeckInstIds;
    const after = startFate(s, malId(s), hookIdx(s), FATE_SLOT);
    expect(after.pendingFate?.revealedInstIds).toEqual(deckBefore.slice(0, 2));
    expect(hookOf(after).fateDiscardInstIds).toHaveLength(4);
    expect(after.log).not.toContain('Mazo de Destino barajado.');
  });

  it('con 1 carta y sin descartes revela la única que hay', () => {
    const { s } = withHookFate(1, 0);
    const after = startFate(s, malId(s), hookIdx(s), FATE_SLOT);
    expect(after.pendingFate?.revealedInstIds).toHaveLength(1);
  });
});

describe('Objeto de Destino sin Héroe al que unirse', () => {
  it('Polvo de Hada en un Reino sin Héroes se descarta sin quedarse en el tablero', () => {
    const { s } = withHookFate(6, 0);
    // Polvo de Hada arriba del mazo de Garfio (y ningún Héroe en su Reino).
    const hook = hookOf(s);
    const polvo = Object.values(s.allCards).find(c => c.ownerId === hook.id && c.name === 'Polvo de Hada')!.instId;
    const s1: GameState = {
      ...s,
      players: s.players.map(p => p.id !== hook.id ? p : {
        ...p,
        fateDeckInstIds: [polvo, ...p.fateDeckInstIds.filter(id => id !== polvo)],
        fateDiscardInstIds: p.fateDiscardInstIds.filter(id => id !== polvo),
      }),
    };
    const started = startFate(s1, malId(s1), hookIdx(s1), FATE_SLOT);
    expect(started.pendingFate?.revealedInstIds).toContain(polvo);
    const after = resolveFate(started, polvo, 'jollyroger');
    const h = hookOf(after);
    expect(h.fateDiscardInstIds).toContain(polvo);
    expect(Object.values(h.locationStates).some(ls => ls.villainCardInstIds.includes(polvo))).toBe(false);
    expect(after.log).toContain('Polvo de Hada no tiene Héroe al que unirse: se descarta.');
  });
});

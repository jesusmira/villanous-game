import { describe, it, expect } from 'vitest';
import { createInitialState } from '../core/engine/actions/init';
import type { GameSetupOptions } from '../core/types';

const opts: GameSetupOptions = {
  player1: { villainId: 'maleficent', isAI: false, name: 'Maléfica' },
  player2: { villainId: 'hook', isAI: true, name: 'Garfio' },
};

describe('jugador inicial y bonus de segundo', () => {
  it('por defecto empieza J1 y el +1 va a J2', () => {
    const s = createInitialState(opts);
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.players[0].power).toBe(0); // Maléfica base 0, sin bonus
    expect(s.players[1].power).toBe(1); // Garfio base 0 + 1 por ir segundo
  });

  it('con startingPlayerIndex=1 empieza J2 y el +1 pasa a J1', () => {
    const s = createInitialState({ ...opts, startingPlayerIndex: 1 });
    expect(s.currentPlayerIndex).toBe(1);
    expect(s.players[0].power).toBe(1); // ahora J1 va segundo → recibe +1
    expect(s.players[1].power).toBe(0); // J2 empieza → sin bonus
  });

  it('el jugador inicial sorteado mantiene su villano y nombre (no se intercambian)', () => {
    const s = createInitialState({ ...opts, startingPlayerIndex: 1 });
    expect(s.players[0].name).toBe('Maléfica');
    expect(s.players[1].name).toBe('Garfio');
  });
});

import { describe, it, expect } from 'vitest';
import { ActionType } from '../core/types';
import type { GameState } from '../core/types';
import { vanquishFree } from '../core/engine/actions/play';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { getEffectDef } from '../core/villains/registry';
import { EffectId } from '../core/villains/effectIds';
import { conditionHandlers, resolveCuervo } from '../core/villains/maleficent/resolvers';
import { makeState, malId, findCard, placeVillainCard, placeHeroInLoc, setPower } from './helpers/factories';

// Rueca: "Si un Héroe es derrotado en esta ubicación, recibes una cantidad de Monedas de Poder
// equivalente a la Fuerza de ese Héroe menos 1" — da igual CÓMO se derrote al Héroe.

const power = (s: GameState) => s.players.find(p => p.id === malId(s))!.power;

/** Maléfica con la Rueca en `bosque`, dos Esbirros Salvajes ahí y 0 de Poder. */
function withRueca(): GameState {
  let s = makeState();
  const id = malId(s);
  s = placeVillainCard(s, id, 'bosque', findCard(s, 'mal_v_rueca')!);
  s = setPower(s, id, 0);
  return s;
}

function nthCard(s: GameState, prefix: string, n: number) {
  return Object.keys(s.allCards).filter(k => s.allCards[k].defId.startsWith(prefix)).sort()[n];
}

describe('Rueca', () => {
  it('Vencer en su ubicación da Fuerza − 1', () => {
    let s = withRueca();
    const id = malId(s);
    const hero = findCard(s, 'mal_f_flora')!;           // Fuerza 3
    s = placeHeroInLoc(s, id, 'bosque', hero);
    const a1 = nthCard(s, 'mal_v_salvaje', 0), a2 = nthCard(s, 'mal_v_salvaje', 1);
    s = placeVillainCard(s, id, 'bosque', a1);
    s = placeVillainCard(s, id, 'bosque', a2);
    const str = getEffectiveStrength(s, hero);
    s = vanquishFree(s, id, hero, [a1, a2]);
    expect(power(s)).toBe(str - 1);
  });

  it('no da nada si el Héroe se derrota en otra ubicación', () => {
    let s = withRueca();
    const id = malId(s);
    const hero = findCard(s, 'mal_f_flora')!;
    s = placeHeroInLoc(s, id, 'cabana', hero);
    const a1 = nthCard(s, 'mal_v_salvaje', 0), a2 = nthCard(s, 'mal_v_salvaje', 1);
    s = placeVillainCard(s, id, 'cabana', a1);
    s = placeVillainCard(s, id, 'cabana', a2);
    s = vanquishFree(s, id, hero, [a1, a2]);
    expect(power(s)).toBe(0);
  });

  it('también cuenta al derrotarlo con Forma de Dragón', () => {
    let s = withRueca();
    const id = malId(s);
    const hero = findCard(s, 'mal_f_flora')!;           // Fuerza 3 (≤3: Dragón puede)
    s = placeHeroInLoc(s, id, 'bosque', hero);
    const str = getEffectiveStrength(s, hero);
    s = getEffectDef('mal_forma_dragon')!.execute(s, {
      actingPlayerId: id, cardInstId: findCard(s, 'mal_v_dragon')!, targetCardInstId: hero,
    });
    expect(s.allCards[hero].locationId).toBeUndefined();
    expect(power(s)).toBe(str - 1);
  });

  it('también cuenta al derrotarlo con Malicia', () => {
    let s = withRueca();
    const id = malId(s);
    const hero = findCard(s, 'mal_f_estefano')!;        // Fuerza 4 (≤4: Malicia puede)
    s = placeHeroInLoc(s, id, 'bosque', hero);
    const str = getEffectiveStrength(s, hero);
    s = conditionHandlers[EffectId.MALICIA_COND](s, id, { targetCardInstId: hero });
    expect(power(s)).toBe(str - 1);
  });

  it('también cuenta al vencerlo con El Cuervo, que aplica las mismas reglas que Vencer', () => {
    let s = withRueca();
    const id = malId(s);
    const hero = findCard(s, 'mal_f_flora')!;
    s = placeHeroInLoc(s, id, 'bosque', hero);
    const a1 = nthCard(s, 'mal_v_salvaje', 0), a2 = nthCard(s, 'mal_v_salvaje', 1);
    s = placeVillainCard(s, id, 'bosque', a1);
    s = placeVillainCard(s, id, 'bosque', a2);
    const str = getEffectiveStrength(s, hero);
    // El Cuervo vuela al Castillo (única ubicación con Vencer) y vence al Héroe del Bosque.
    s = { ...s, pendingCuervo: { playerId: id, locationId: 'castillo' } };
    s = resolveCuervo(s, ActionType.VANQUISH, { cardInstId: hero, allyInstIds: [a1, a2] });
    expect(s.allCards[hero].locationId).toBeUndefined();
    expect(power(s)).toBe(str - 1);
  });

  it('usa la Fuerza del momento de la derrota (con los modificadores de la ubicación)', () => {
    let s = withRueca();
    const id = malId(s);
    const hero = findCard(s, 'mal_f_felipe')!;          // Fuerza 5
    s = placeHeroInLoc(s, id, 'bosque', hero);
    s = placeVillainCard(s, id, 'bosque', findCard(s, 'mal_v_sueno')!); // −2 a los Héroes de aquí
    const a1 = nthCard(s, 'mal_v_salvaje', 0), a2 = nthCard(s, 'mal_v_salvaje', 1);
    s = placeVillainCard(s, id, 'bosque', a1);
    s = placeVillainCard(s, id, 'bosque', a2);
    const str = getEffectiveStrength(s, hero);
    expect(str).toBeLessThan(5);                        // el −2 de Sueño Sin Sueños se aplica
    s = vanquishFree(s, id, hero, [a1, a2]);
    expect(power(s)).toBe(str - 1);
  });
});

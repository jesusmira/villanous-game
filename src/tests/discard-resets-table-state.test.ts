import { describe, it, expect } from 'vitest';
import { discardCardFromKingdom, applyMenguarToggle, updateCard } from '../core/engine/stateHelpers';
import { getCoveredSlotIndices } from '../core/engine/slotHelpers';
import { placeHeroInKingdom } from '../core/engine/actions/fate';
import { makeQueenState, queenId, findCard, placeHeroInLoc, placeVillainCard } from './helpers/factories';

// Un Héroe vencido estando Menguado (o Agrandado) debe volver a salir NORMAL: el estado se va
// con la carta al descartarla, no se queda pegado a ella.

describe('Descartar quita los estados de mesa', () => {
  it('un Héroe menguado vencido vuelve a salir normal', () => {
    let s = makeQueenState();
    const id = queenId(s);
    const alicia = findCard(s, 'queen_f_alicia')!;
    s = placeHeroInLoc(s, id, 'queen_patio', alicia);
    s = applyMenguarToggle(s, id, alicia);
    expect(s.allCards[alicia].isShrunk).toBe(true);

    s = discardCardFromKingdom(s, alicia);          // vencido
    expect(s.allCards[alicia].isShrunk).toBe(false);
    expect(s.allCards[alicia].shrunkKeptSlotIndex).toBeUndefined();

    // Vuelve a salir (p. ej. tras rebarajar el mazo de Destino): normal, tapa sus 2 casillas.
    s = placeHeroInKingdom(s, alicia, id, 'queen_patio', id);
    expect(s.allCards[alicia].isShrunk).toBe(false);
    expect(getCoveredSlotIndices(s, id, 'queen_patio')).toEqual([0, 1]);
  });

  it('otro Héroe que llega después a esa ubicación sale normal', () => {
    let s = makeQueenState();
    const id = queenId(s);
    const alicia = findCard(s, 'queen_f_alicia')!;
    const dodo = findCard(s, 'queen_f_dodo')!;
    s = placeHeroInLoc(s, id, 'queen_patio', alicia);
    s = applyMenguarToggle(s, id, alicia);
    s = discardCardFromKingdom(s, alicia);
    s = placeHeroInKingdom(s, dodo, id, 'queen_patio', id);
    expect(s.allCards[dodo].isShrunk).toBeFalsy();
    expect(getCoveredSlotIndices(s, id, 'queen_patio')).toEqual([0, 1]);
  });

  it('también se quitan Agrandado y Postigo', () => {
    let s = makeQueenState();
    const id = queenId(s);
    const alicia = findCard(s, 'queen_f_alicia')!;
    const soldado = findCard(s, 'queen_v_treboles')!;
    s = placeHeroInLoc(s, id, 'queen_patio', alicia);
    s = updateCard(s, alicia, { isEnlarged: true, enlargedTargetLocationId: 'queen_laberinto', enlargedTargetSlotIndex: 1 });
    s = placeVillainCard(s, id, 'queen_patio', soldado);
    s = updateCard(s, soldado, { isWicket: true });
    s = discardCardFromKingdom(s, alicia);
    s = discardCardFromKingdom(s, soldado);
    expect(s.allCards[alicia].isEnlarged).toBe(false);
    expect(s.allCards[alicia].enlargedTargetLocationId).toBeUndefined();
    expect(s.allCards[soldado].isWicket).toBe(false);
  });
});

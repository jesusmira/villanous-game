import { describe, it, expect } from 'vitest';
import { TurnPhase, CardType } from '../core/types';
import { activateCard, playCard, vanquish } from '../core/engine/actions/play';
import { canVanquishFree, canPlayCard, canMoveItemAlly, canActivateCard } from '../core/engine/RuleEngine';
import { computeKingdomCostMod, getEffectiveStrength, applyMenguarToggle } from '../core/engine/stateHelpers';
import { getCoveredSlotIndices, getAvailableSlotIndices } from '../core/engine/slotHelpers';
import { resolveShrinkSlotChoice, resolveShotReveal } from '../core/engine/PendingStateResolver';
import { effects as queenEffects } from '../core/villains/queen/effects';
import {
  makeQueenState, queenId, findCard,
  putInHand, placeVillainCard, placeHeroInLoc,
  setPhase, setPower, setPawn,
} from './helpers/factories';

const queenAgrandar = queenEffects.find(e => e.id === 'queen_agrandar')!;

// Ubicaciones de la Reina de Corazones:
//   patio ── laberinto ── tulgey ── conejoblanco
// patio actions:      [DISCARD(0), MOVE_ITEM_ALLY(1), GAIN_POWER2(2), PLAY_CARD(3)]
// laberinto actions:  [PLAY_CARD(0), ACTIVATE_CARD(1), GAIN_POWER3(2), PLAY_CARD(3)]
// tulgey actions:     [FATE(0), PLAY_CARD(1), DISCARD(2), VANQUISH(3)]
// conejoblanco actions: [PLAY_CARD(0), GAIN_POWER1(1), ACTIVATE_CARD(2), FATE(3)]

const LOCS = ['queen_patio', 'queen_laberinto', 'queen_tulgey', 'queen_conejoblanco'] as const;

/** Coloca un Soldado Naipe convertido en Postigo en cada ubicación del Reino. */
function coverAllLocationsWithWicket(state: ReturnType<typeof makeQueenState>, playerId: string) {
  let s = state;
  const used = new Set<string>();
  for (const locId of LOCS) {
    const soldadoId = Object.keys(s.allCards).find(
      id => s.allCards[id]?.defId.startsWith('queen_v_') && s.allCards[id]?.cardType === CardType.ALLY
        && s.allCards[id]?.effectIds.includes('queen_soldado_toggle') && !used.has(id),
    )!;
    used.add(soldadoId);
    s = placeVillainCard(s, playerId, locId, soldadoId);
    s = { ...s, allCards: { ...s.allCards, [soldadoId]: { ...s.allCards[soldadoId], isWicket: true } } };
  }
  return s;
}

describe('Soldado Naipe ↔ Postigo', () => {
  it('ACTIVAR alterna isWicket y consume 1 de Poder', () => {
    let s = makeQueenState();
    const q = queenId(s);
    const soldado = findCard(s, 'queen_v_treboles')!;
    s = placeVillainCard(s, q, 'queen_laberinto', soldado);
    s = setPawn(s, q, 'queen_laberinto');
    s = setPhase(s, TurnPhase.ACTIVATE);
    s = setPower(s, q, 5);

    expect(s.allCards[soldado].isWicket).toBeFalsy();
    s = activateCard(s, q, soldado, 1); // ranura ACTIVATE_CARD de laberinto
    expect(s.allCards[soldado].isWicket).toBe(true);
    expect(s.players.find(p => p.id === q)!.power).toBe(4);

    // Se puede revertir activando de nuevo (con otra ranura ACTIVATE_CARD libre)
    s = { ...s, usedActionSlotIndices: [] };
    s = activateCard(s, q, soldado, 1);
    expect(s.allCards[soldado].isWicket).toBe(false);
  });

  it('un Postigo no puede usarse para Vencer', () => {
    let s = makeQueenState();
    const q = queenId(s);
    const soldado = findCard(s, 'queen_v_treboles')!;
    s = placeVillainCard(s, q, 'queen_tulgey', soldado);
    s = { ...s, allCards: { ...s.allCards, [soldado]: { ...s.allCards[soldado], isWicket: true } } };
    const hero = findCard(s, 'queen_f_liron')!; // Fuerza 1
    s = placeHeroInLoc(s, q, 'queen_tulgey', hero);

    expect(canVanquishFree(s, q, hero, [soldado]).valid).toBe(false);

    // El mismo Soldado, sin ser Postigo, sí puede Vencer
    s = { ...s, allCards: { ...s.allCards, [soldado]: { ...s.allCards[soldado], isWicket: false } } };
    expect(canVanquishFree(s, q, hero, [soldado]).valid).toBe(true);
  });
});

describe('El Rey', () => {
  it('reduce en -1 el Precio de los 4 Soldados Naipe', () => {
    let s = makeQueenState();
    const q = queenId(s);
    const rey = findCard(s, 'queen_v_rey')!;
    s = placeVillainCard(s, q, 'queen_patio', rey);
    const treboles = s.allCards[findCard(s, 'queen_v_treboles')!];
    const rombos = s.allCards[findCard(s, 'queen_v_rombos')!];
    const lanza = s.allCards[findCard(s, 'queen_v_lanza')!];

    expect(computeKingdomCostMod(s, q, treboles, 'queen_patio')).toBe(-1);
    expect(computeKingdomCostMod(s, q, rombos, 'queen_patio')).toBe(-1);
    // Lanza no es un Soldado Naipe: sin descuento
    expect(computeKingdomCostMod(s, q, lanza, 'queen_patio')).toBe(0);
  });
});

describe('Tweedle Dee y Tweedle Dum', () => {
  it('no se descarta al ser utilizado para Vencer', () => {
    let s = makeQueenState();
    const q = queenId(s);
    const deedum = findCard(s, 'queen_v_deedum')!; // Fuerza 2
    s = placeVillainCard(s, q, 'queen_tulgey', deedum);
    const hero = findCard(s, 'queen_f_liron')!; // Fuerza 1
    s = placeHeroInLoc(s, q, 'queen_tulgey', hero);
    s = setPhase(s, TurnPhase.ACTIVATE);

    s = vanquish(s, q, hero, [deedum], 3); // ranura VENCER de Bosque de Tulgey
    expect(s.allCards[deedum].locationId).toBe('queen_tulgey');
    expect(s.players.find(p => p.id === q)!.locationStates['queen_tulgey'].villainCardInstIds).toContain(deedum);
    // El Héroe sí se descarta con normalidad (fuera del Reino, en la pila de descartes de Destino).
    expect(s.allCards[hero].locationId).toBeUndefined();
    expect(s.players.find(p => p.id === q)!.fateDiscardInstIds).toContain(hero);
  });
});

describe('Menguar / Agrandar', () => {
  it('Menguar no toca la Fuerza; el Héroe menguado pasa a ser el único que tapa una casilla', () => {
    let s = makeQueenState();
    const q = queenId(s);
    const dodo = findCard(s, 'queen_f_dodo')!;
    const liron = findCard(s, 'queen_f_liron')!;
    s = placeHeroInLoc(s, q, 'queen_laberinto', dodo);
    s = placeHeroInLoc(s, q, 'queen_laberinto', liron);

    // Sin Menguar: 2 Héroes tapan las 2 casillas de siempre (laberinto tiene 4 acciones).
    expect(getCoveredSlotIndices(s, q, 'queen_laberinto')).toEqual([0, 1]);

    const dodoStr = getEffectiveStrength(s, dodo);
    s = applyMenguarToggle(s, q, dodo);
    expect(s.allCards[dodo].isShrunk).toBe(true);
    expect(getEffectiveStrength(s, dodo)).toBe(dodoStr); // Menguar NO afecta a la Fuerza

    // Por defecto se mantiene tapada la primera casilla — solo 1 en total (el otro Héroe deja de
    // tapar), y queda pendiente elegir cuál sigue tapada.
    expect(getCoveredSlotIndices(s, q, 'queen_laberinto')).toEqual([0]);
    expect(getAvailableSlotIndices(s, q, 'queen_laberinto')).toContain(1);
    expect(s.pendingShrinkSlotChoice?.queue).toEqual([
      { heroInstId: dodo, locationId: 'queen_laberinto', eligibleSlotIndices: [0, 1] },
    ]);
  });

  it('quien Mengua elige qué casilla sigue tapada', () => {
    let s = makeQueenState();
    const q = queenId(s);
    const dodo = findCard(s, 'queen_f_dodo')!;
    s = placeHeroInLoc(s, q, 'queen_laberinto', dodo);

    s = applyMenguarToggle(s, q, dodo);
    expect(getCoveredSlotIndices(s, q, 'queen_laberinto')).toEqual([0]); // valor por defecto

    s = resolveShrinkSlotChoice(s, 1); // el jugador elige dejar tapada la otra casilla
    expect(s.allCards[dodo].shrunkKeptSlotIndex).toBe(1);
    expect(getCoveredSlotIndices(s, q, 'queen_laberinto')).toEqual([1]);
    expect(getAvailableSlotIndices(s, q, 'queen_laberinto')).toContain(0);
    expect(s.pendingShrinkSlotChoice).toBeUndefined();
  });

  it('Menguar sobre un Héroe ya Agrandado lo revierte a la normalidad', () => {
    let s = makeQueenState();
    const q = queenId(s);
    const hero = findCard(s, 'queen_f_dodo')!;
    s = { ...s, allCards: { ...s.allCards, [hero]: { ...s.allCards[hero], isEnlarged: true, enlargedTargetLocationId: 'queen_tulgey', enlargedTargetSlotIndex: 0 } } };

    s = applyMenguarToggle(s, q, hero);
    expect(s.allCards[hero].isEnlarged).toBe(false);
    expect(s.allCards[hero].enlargedTargetLocationId).toBeUndefined();
    expect(s.allCards[hero].enlargedTargetSlotIndex).toBeUndefined();
    expect(s.allCards[hero].isShrunk).toBeFalsy(); // revierte, no lo deja además Menguado
    expect(s.pendingShrinkSlotChoice).toBeUndefined();
  });

  it('El Lirón es inmune a Menguar', () => {
    let s = makeQueenState();
    const q = queenId(s);
    const liron = findCard(s, 'queen_f_liron')!;
    s = applyMenguarToggle(s, q, liron);
    expect(s.allCards[liron].isShrunk).toBeFalsy();
  });

  it('Agrandar arma pendingEnlargeTarget con los pares (ubicación adyacente, casilla) correctos', () => {
    let s = makeQueenState();
    const q = queenId(s);
    const dodo = findCard(s, 'queen_f_dodo')!;
    s = placeHeroInLoc(s, q, 'queen_laberinto', dodo); // adyacente a patio y tulgey

    s = queenAgrandar.execute(s, { actingPlayerId: 'rival', cardInstId: 'x', targetCardInstId: dodo });
    expect(s.pendingEnlargeTarget?.heroInstId).toBe(dodo);
    const locIds = new Set(s.pendingEnlargeTarget?.eligible.map(e => e.locationId));
    expect(locIds).toEqual(new Set(['queen_patio', 'queen_tulgey']));

    // Resolver: Héroe agrandado también tapa esa casilla en la ubicación adyacente elegida.
    const target = s.pendingEnlargeTarget!.eligible[0];
    s = { ...s, allCards: { ...s.allCards, [dodo]: { ...s.allCards[dodo], isEnlarged: true, enlargedTargetLocationId: target.locationId, enlargedTargetSlotIndex: target.slotIndex } }, pendingEnlargeTarget: undefined };
    expect(getCoveredSlotIndices(s, q, target.locationId)).toContain(target.slotIndex);
    // Su ubicación real (laberinto) sigue tapada con normalidad — nunca "se mueve".
    expect(s.allCards[dodo].locationId).toBe('queen_laberinto');
  });

  it('Agrandar sobre un Héroe ya Menguado lo revierte directamente, sin pending', () => {
    let s = makeQueenState();
    const hero = findCard(s, 'queen_f_dodo')!;
    s = { ...s, allCards: { ...s.allCards, [hero]: { ...s.allCards[hero], isShrunk: true } } };

    s = queenAgrandar.execute(s, { actingPlayerId: 'rival', cardInstId: 'x', targetCardInstId: hero });
    expect(s.allCards[hero].isShrunk).toBe(false);
    expect(s.pendingEnlargeTarget).toBeUndefined();
  });
});

describe('Alicia', () => {
  it('bloquea mover Aliados y Objetos mientras esté en el Reino', () => {
    let s = makeQueenState();
    const q = queenId(s);
    const soldado = findCard(s, 'queen_v_treboles')!;
    s = placeVillainCard(s, q, 'queen_patio', soldado);
    s = setPhase(s, TurnPhase.ACTIVATE);

    expect(canMoveItemAlly(s, q, soldado, 'queen_laberinto', 1).valid).toBe(true);

    const alicia = findCard(s, 'queen_f_alicia')!;
    s = placeHeroInLoc(s, q, 'queen_conejoblanco', alicia);
    expect(canMoveItemAlly(s, q, soldado, 'queen_laberinto', 1).valid).toBe(false);
  });
});

describe('Dodo', () => {
  it('bloquea convertir Soldado↔Postigo solo en su propia ubicación', () => {
    let s = makeQueenState();
    const q = queenId(s);
    const soldadoAqui = findCard(s, 'queen_v_treboles')!;
    const soldadoOtro = findCard(s, 'queen_v_rombos')!;
    s = placeVillainCard(s, q, 'queen_laberinto', soldadoAqui);
    s = placeVillainCard(s, q, 'queen_conejoblanco', soldadoOtro);
    const dodo = findCard(s, 'queen_f_dodo')!;
    s = placeHeroInLoc(s, q, 'queen_laberinto', dodo);
    s = setPhase(s, TurnPhase.ACTIVATE);
    s = setPower(s, q, 5);

    // En la ubicación de Dodo: bloqueado.
    s = setPawn(s, q, 'queen_laberinto');
    expect(canActivateCard(s, q, soldadoAqui, 1).valid).toBe(false);

    // En Casa del Conejo Blanco (sin Dodo): la Habilidad se activa con normalidad.
    s = setPawn(s, q, 'queen_conejoblanco');
    expect(canActivateCard(s, q, soldadoOtro, 2).valid).toBe(true);
  });
});

describe('Efectúa el tiro', () => {
  it('no es jugable si falta cubrir alguna ubicación con Postigo', () => {
    let s = makeQueenState();
    const q = queenId(s);
    const tiro = findCard(s, 'queen_v_tiro')!;
    s = putInHand(s, q, tiro);
    s = setPawn(s, q, 'queen_conejoblanco');
    s = setPhase(s, TurnPhase.ACTIVATE);
    s = setPower(s, q, 10);

    expect(canPlayCard(s, q, tiro, 0, 'queen_conejoblanco').valid).toBe(false);
  });

  it('gana la partida si el Precio total revelado es menor que la Fuerza de los Postigos', () => {
    let s = makeQueenState();
    const q = queenId(s);
    s = coverAllLocationsWithWicket(s, q);
    const tiro = findCard(s, 'queen_v_tiro')!;
    s = putInHand(s, q, tiro);
    s = setPawn(s, q, 'queen_conejoblanco');
    s = setPhase(s, TurnPhase.ACTIVATE);
    s = setPower(s, q, 10);

    // Los 4 Postigos colocados son Soldados Naipe base (Fuerza 3) → 12 de Fuerza total.
    // Se fuerzan al FRENTE del mazo 5 cartas de coste 0 (buscadas en TODO el estado, no solo en
    // el mazo — el reparto inicial de mano es aleatorio y podría haber colocado alguna ahí) para
    // garantizar un Precio total revelado de 0 < 12, sin depender del barajado aleatorio.
    const costZero = Object.keys(s.allCards)
      .filter(id => s.allCards[id]?.villainId === 'queen' && s.allCards[id]?.deck === 'VILLAIN'
        && (s.allCards[id]?.baseCost ?? 0) === 0)
      .slice(0, 5);
    expect(costZero.length).toBe(5);
    s = {
      ...s,
      players: s.players.map(p => p.id === q
        ? {
            ...p,
            handInstIds: p.handInstIds.filter(id => !costZero.includes(id)),
            villainDiscardInstIds: p.villainDiscardInstIds.filter(id => !costZero.includes(id)),
            villainDeckInstIds: [...costZero, ...p.villainDeckInstIds.filter(id => !costZero.includes(id))],
          }
        : p),
    };

    expect(canPlayCard(s, q, tiro, 0, 'queen_conejoblanco').valid).toBe(true);
    s = playCard(s, q, tiro, 0, 'queen_conejoblanco');
    expect(s.players.find(p => p.id === q)!.completedObjectiveSteps).toContain('SHOT_SUCCESSFUL');
    expect(s.winner).toBe(q);

    // Las 5 cartas reveladas quedan visibles para el jugador hasta que las cierre — el
    // resultado (victoria) ya se aplicó, esto es solo para poder verlas.
    expect(s.pendingShotReveal?.won).toBe(true);
    expect(s.pendingShotReveal?.revealedInstIds).toEqual(costZero);
    expect(s.pendingShotReveal?.totalCost).toBe(0);
    s = resolveShotReveal(s);
    expect(s.pendingShotReveal).toBeUndefined();
    expect(s.winner).toBe(q); // cerrar la vista no deshace la victoria
  });

  it('descarta las 5 cartas y NO gana si el Precio total es demasiado alto', () => {
    let s = makeQueenState();
    const q = queenId(s);
    s = coverAllLocationsWithWicket(s, q);
    const tiro = findCard(s, 'queen_v_tiro')!;
    s = putInHand(s, q, tiro);
    s = setPawn(s, q, 'queen_conejoblanco');
    s = setPhase(s, TurnPhase.ACTIVATE);
    s = setPower(s, q, 10);

    // 4 Postigos de Fuerza 3 = 12 de Fuerza total. Se apilan las 5 cartas de MAYOR Precio del
    // mazo restante para que el Precio total revelado supere esa Fuerza.
    const player = s.players.find(p => p.id === q)!;
    const costHigh = [...player.villainDeckInstIds]
      .sort((a, b) => (s.allCards[b]?.baseCost ?? 0) - (s.allCards[a]?.baseCost ?? 0))
      .slice(0, 5);
    const totalCostHigh = costHigh.reduce((sum, id) => sum + (s.allCards[id]?.baseCost ?? 0), 0);
    expect(totalCostHigh).toBeGreaterThanOrEqual(12); // ≥ Fuerza total de los 4 Postigos
    s = {
      ...s,
      players: s.players.map(p => p.id === q
        ? { ...p, villainDeckInstIds: [...costHigh, ...p.villainDeckInstIds.filter(id => !costHigh.includes(id))] }
        : p),
    };

    s = playCard(s, q, tiro, 0, 'queen_conejoblanco');
    expect(s.players.find(p => p.id === q)!.completedObjectiveSteps).not.toContain('SHOT_SUCCESSFUL');
    expect(s.winner).toBeNull();
    const discard = s.players.find(p => p.id === q)!.villainDiscardInstIds;
    for (const id of costHigh) expect(discard).toContain(id);

    expect(s.pendingShotReveal?.won).toBe(false);
    expect(s.pendingShotReveal?.revealedInstIds).toEqual(costHigh);
  });
});

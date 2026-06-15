import { describe, it, expect } from 'vitest';
import { gainPower, playCard, vanquish } from '../core/engine/actions/play';
import { movePawn, drawCards } from '../core/engine/actions/turn';
import { TurnPhase } from '../core/types';
import { HookObjectiveStep } from '../core/villains/hook/cards';
import {
  makeState, malId, hookId, findCard, findInDeck,
  putInHand, placeVillainCard, placeHeroInLoc,
  setPhase, setPower, setPawn, setCurrentPlayer,
} from './helpers/factories';

// ─── gainPower ────────────────────────────────────────────────────────────────
// bosque slots: [DISCARD(0), PLAY_CARD(1), GAIN_POWER(2=valor 3), PLAY_CARD(3)]

describe('gainPower', () => {
  it('añade el poder definido por la ranura y marca la ranura como usada', () => {
    let s = makeState();
    s = setPawn(s, malId(s), 'bosque');
    s = gainPower(s, malId(s), 2); // ranura 2 = GAIN_POWER value 3
    const mal = s.players.find(p => p.id === malId(s))!;
    expect(mal.power).toBe(3); // empezaba en 0
    expect(s.usedActionSlotIndices).toContain(2);
  });

  it('amountOverride ignora el valor de la ranura', () => {
    let s = makeState();
    s = setPawn(s, malId(s), 'bosque');
    s = gainPower(s, malId(s), 2, 7); // ranura 2 valdría 3, pero override = 7
    expect(s.players.find(p => p.id === malId(s))!.power).toBe(7);
  });
});

// ─── movePawn ─────────────────────────────────────────────────────────────────

describe('movePawn', () => {
  it('actualiza pawnLocationId y transiciona a fase ACTIVATE', () => {
    let s = makeState(); // MOVE, peón en montanas
    s = movePawn(s, malId(s), 'bosque');
    expect(s.players.find(p => p.id === malId(s))!.pawnLocationId).toBe('bosque');
    expect(s.turnPhase).toBe(TurnPhase.ACTIVATE);
  });

  it('Fuego Verde se descarta automáticamente cuando Maléfica llega a esa ubicación', () => {
    let s = makeState();
    const id = malId(s);
    const fuegoId = findInDeck(s, id, 'mal_v_fuego')!;
    s = placeVillainCard(s, id, 'bosque', fuegoId); // Fuego Verde en bosque
    s = movePawn(s, id, 'bosque');
    const mal = s.players.find(p => p.id === id)!;
    // Fuego Verde ya no está en la ubicación
    expect(mal.locationStates['bosque'].villainCardInstIds).not.toContain(fuegoId);
    // Está en el descarte
    expect(mal.villainDiscardInstIds).toContain(fuegoId);
  });
});

// ─── playCard ─────────────────────────────────────────────────────────────────

describe('playCard', () => {
  it('jugar un Aliado: descuenta coste, coloca la carta y marca la ranura', () => {
    let s = makeState();
    const id = malId(s);
    const salvId = findInDeck(s, id, 'mal_v_salvaje')!; // cost 3, ALLY
    s = putInHand(s, id, salvId);
    s = setPower(s, id, 5);
    s = setPhase(s, TurnPhase.ACTIVATE);
    s = setPawn(s, id, 'bosque');
    s = playCard(s, id, salvId, 1, 'bosque'); // ranura 1 = PLAY_CARD
    const mal = s.players.find(p => p.id === id)!;
    expect(mal.power).toBe(2); // 5 - 3
    expect(mal.locationStates['bosque'].villainCardInstIds).toContain(salvId);
    expect(mal.handInstIds).not.toContain(salvId);
    expect(s.usedActionSlotIndices).toContain(1);
  });

  it('jugar un EFFECT (Desaparecer): se descarta automáticamente y activa skipNextMove', () => {
    let s = makeState();
    const id = malId(s);
    const desapId = findInDeck(s, id, 'mal_v_desaparecer')!; // cost 0, EFFECT
    s = putInHand(s, id, desapId);
    s = setPhase(s, TurnPhase.ACTIVATE);
    s = setPawn(s, id, 'bosque');
    s = playCard(s, id, desapId, 1, 'bosque');
    const mal = s.players.find(p => p.id === id)!;
    // Los EFFECT se auto-descartan tras jugarse
    expect(mal.villainDiscardInstIds).toContain(desapId);
    expect(mal.locationStates['bosque'].villainCardInstIds).not.toContain(desapId);
    // El efecto ON_PLAY de Desaparecer activa skipNextMove
    expect(mal.skipNextMove).toBe(true);
  });
});

// ─── drawCards ────────────────────────────────────────────────────────────────

describe('drawCards', () => {
  it('roba hasta handSize y avanza al turno del siguiente jugador', () => {
    let s = makeState();
    const id = malId(s);
    // Reducir la mano a 2 cartas moviendo el resto al mazo
    const player = s.players.find(p => p.id === id)!;
    const keep = player.handInstIds.slice(0, 2);
    const back = player.handInstIds.slice(2);
    s = { ...s, players: s.players.map(p => p.id !== id ? p : {
      ...p, handInstIds: keep,
      villainDeckInstIds: [...back, ...p.villainDeckInstIds],
    })};
    s = setPhase(s, TurnPhase.DRAW);
    s = drawCards(s, id);
    // Maléfica tiene handSize = 4 cartas
    expect(s.players.find(p => p.id === id)!.handInstIds).toHaveLength(4);
    // Turno avanza: ahora le toca a Garfio (índice 1)
    expect(s.currentPlayerIndex).toBe(1);
    expect(s.turnPhase).toBe(TurnPhase.MOVE);
  });

  it('baraja el descarte si el mazo se agota durante el robo', () => {
    let s = makeState();
    const id = malId(s);
    const player = s.players.find(p => p.id === id)!;
    // Mano vacía, mazo vacío, todo en el descarte
    s = { ...s, players: s.players.map(p => p.id !== id ? p : {
      ...p,
      handInstIds: [],
      villainDeckInstIds: [],
      villainDiscardInstIds: [...p.handInstIds, ...p.villainDeckInstIds, ...p.villainDiscardInstIds],
    })};
    s = setPhase(s, TurnPhase.DRAW);
    s = drawCards(s, id);
    // Debe haber robado igual gracias a barajar el descarte
    expect(s.players.find(p => p.id === id)!.handInstIds).toHaveLength(4);
  });
});

// ─── vanquish ─────────────────────────────────────────────────────────────────

describe('vanquish', () => {
  it('héroe va al descarte de Destino y los aliados al descarte de Villano', () => {
    let s = makeState();
    const id = malId(s);
    const auroraId = findCard(s, 'mal_f_aurora')!;
    const salvId   = findInDeck(s, id, 'mal_v_salvaje')!;
    s = setPhase(s, TurnPhase.ACTIVATE);
    s = setPawn(s, id, 'castillo');
    s = placeHeroInLoc(s, id, 'castillo', auroraId);
    s = placeVillainCard(s, id, 'castillo', salvId);
    s = vanquish(s, id, auroraId, [salvId], 2);
    const mal = s.players.find(p => p.id === id)!;
    expect(mal.fateDiscardInstIds).toContain(auroraId);
    expect(mal.villainDiscardInstIds).toContain(salvId);
    expect(mal.locationStates['castillo'].heroCardInstIds).not.toContain(auroraId);
    expect(mal.locationStates['castillo'].villainCardInstIds).not.toContain(salvId);
  });

  it('al vencer a Peter Pan en el Jolly Roger se registra el paso de objetivo', () => {
    let s = makeState();
    const id = hookId(s);
    s = setCurrentPlayer(s, id);
    const ppId   = findCard(s, 'hook_fate_peter_pan')!;
    const maton1 = findInDeck(s, id, 'hook_v_maton')!;
    const maton2 = Object.keys(s.allCards).find(
      k => s.allCards[k]?.defId.startsWith('hook_v_maton') && k !== maton1,
    )!;
    s = placeHeroInLoc(s, id, 'jollyroger', ppId);
    s = placeVillainCard(s, id, 'jollyroger', maton1);
    s = placeVillainCard(s, id, 'jollyroger', maton2);
    s = vanquish(s, id, ppId, [maton1, maton2], 2);
    const hook = s.players.find(p => p.id === id)!;
    expect(hook.completedObjectiveSteps).toContain(HookObjectiveStep.PETER_PAN_DEFEATED);
  });
});

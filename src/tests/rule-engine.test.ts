import { describe, it, expect } from 'vitest';
import { canMovePawn, canPlayCard, canVanquish, canMoveItemAlly } from '../core/engine/RuleEngine';
import { TurnPhase } from '../core/types';
import {
  makeState, malId, findCard,
  putInHand, placeVillainCard, placeHeroInLoc,
  setPhase, setPower, setPawn,
} from './helpers/factories';
import type { GameState } from '../core/types';

// Maléfica empieza en 'montanas'; currentPlayerIndex = 0 siempre es Maléfica.

function activateAt(locId: string): GameState {
  let s = makeState();
  s = setPhase(s, TurnPhase.ACTIVATE);
  s = setPawn(s, malId(s), locId);
  return s;
}

// ─── canMovePawn ─────────────────────────────────────────────────────────────

describe('canMovePawn', () => {
  it('acepta destino válido en fase MOVE', () => {
    const s = makeState(); // MOVE phase, peón en montanas
    expect(canMovePawn(s, malId(s), 'cabana').valid).toBe(true);
  });

  it('rechaza si no es fase MOVE', () => {
    let s = makeState();
    s = setPhase(s, TurnPhase.ACTIVATE);
    expect(canMovePawn(s, malId(s), 'cabana').valid).toBe(false);
  });

  it('rechaza si el destino es la ubicación actual', () => {
    const s = makeState(); // peón en 'montanas'
    expect(canMovePawn(s, malId(s), 'montanas').valid).toBe(false);
  });

  it('rechaza si la ubicación destino está bloqueada', () => {
    let s = makeState();
    const id = malId(s);
    s = {
      ...s,
      players: s.players.map(p => p.id !== id ? p : {
        ...p,
        locationStates: {
          ...p.locationStates,
          cabana: { ...p.locationStates['cabana'], isLocked: true },
        },
      }),
    };
    const res = canMovePawn(s, id, 'cabana');
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('bloqueada');
  });
});

// ─── canPlayCard ─────────────────────────────────────────────────────────────
// bosque: [DISCARD(0), PLAY_CARD(1), GAIN_POWER(2), PLAY_CARD(3)]
// Con 0 héroes: todos los slots disponibles. Usamos slot 1 (PLAY_CARD).

describe('canPlayCard', () => {
  it('acepta jugada válida', () => {
    let s = activateAt('bosque');
    const id = malId(s);
    const selvaId = findCard(s, 'mal_v_selva')!;
    s = putInHand(s, id, selvaId);
    s = setPower(s, id, 5);
    // slot 1 = PLAY_CARD en bosque, targetLocation = bosque
    expect(canPlayCard(s, id, selvaId, 1, 'bosque').valid).toBe(true);
  });

  it('rechaza si no hay suficiente Poder', () => {
    let s = activateAt('bosque');
    const id = malId(s);
    const selvaId = findCard(s, 'mal_v_selva')!; // cost 2
    s = putInHand(s, id, selvaId);
    s = setPower(s, id, 1); // menos que coste
    expect(canPlayCard(s, id, selvaId, 1, 'bosque').valid).toBe(false);
  });

  it('rechaza si la carta no está en la mano', () => {
    let s = activateAt('bosque');
    const id = malId(s);
    // Las cartas de Destino siempre están en fateDeckInstIds, nunca en la mano
    const floraId = findCard(s, 'mal_f_flora')!;
    s = setPower(s, id, 5);
    expect(canPlayCard(s, id, floraId, 1, 'bosque').valid).toBe(false);
  });

  it('rechaza si no es fase ACTIVATE', () => {
    let s = makeState(); // MOVE phase
    const id = malId(s);
    const selvaId = findCard(s, 'mal_v_selva')!;
    s = putInHand(s, id, selvaId);
    s = setPower(s, id, 5);
    expect(canPlayCard(s, id, selvaId, 1, 'bosque').valid).toBe(false);
  });

  it('Primavera bloquea jugar Maldición en su ubicación', () => {
    // Con 1 héroe en bosque: slots 0 y 1 cubiertos → PLAY_CARD en slot 3
    let s = activateAt('bosque');
    const id = malId(s);
    const primaveraId = findCard(s, 'mal_f_primavera')!;
    const selvaId = findCard(s, 'mal_v_selva')!;
    s = placeHeroInLoc(s, id, 'bosque', primaveraId);
    s = putInHand(s, id, selvaId);
    s = setPower(s, id, 5);
    // slot 3 sigue siendo PLAY_CARD (no cubierto), pero Primavera bloquea maldiciones
    const res = canPlayCard(s, id, selvaId, 3, 'bosque');
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Primavera');
  });

  it('rechaza jugar un Héroe directamente (debe usarse acción Destino)', () => {
    let s = activateAt('bosque');
    const id = malId(s);
    const auroraId = findCard(s, 'mal_f_aurora')!;
    s = putInHand(s, id, auroraId);
    s = setPower(s, id, 5);
    const res = canPlayCard(s, id, auroraId, 1, 'bosque');
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Destino');
  });
});

// ─── canVanquish ─────────────────────────────────────────────────────────────
// castillo: [GAIN_POWER(0), FATE(1), VANQUISH(2), PLAY_CARD(3)]
// Con un héroe en castillo: slots 0 y 1 cubiertos → VANQUISH slot 2 disponible.

describe('canVanquish', () => {
  it('acepta Vencer válido', () => {
    // Aurora (str 4) en castillo + Salvaje (str 4) en castillo
    let s = activateAt('castillo');
    const id = malId(s);
    const auroraId = findCard(s, 'mal_f_aurora')!;
    const salvId = findCard(s, 'mal_v_salvaje')!;
    s = placeHeroInLoc(s, id, 'castillo', auroraId);   // str 4, no multi-ally
    s = placeVillainCard(s, id, 'castillo', salvId);   // str 4 ≥ 4
    expect(canVanquish(s, id, auroraId, [salvId], 2).valid).toBe(true);
  });

  it('rechaza si no se aportan Aliados', () => {
    let s = activateAt('castillo');
    const id = malId(s);
    const auroraId = findCard(s, 'mal_f_aurora')!;
    s = placeHeroInLoc(s, id, 'castillo', auroraId);
    expect(canVanquish(s, id, auroraId, [], 2).valid).toBe(false);
  });

  it('rechaza si la fuerza combinada es insuficiente', () => {
    // Aurora str 4, Siniestro str 3 (sin maldición → sin bonus) → 3 < 4
    let s = activateAt('castillo');
    const id = malId(s);
    const auroraId = findCard(s, 'mal_f_aurora')!;
    const sinId = findCard(s, 'mal_v_siniestro')!;
    s = placeHeroInLoc(s, id, 'castillo', auroraId);
    s = placeVillainCard(s, id, 'castillo', sinId);
    const res = canVanquish(s, id, auroraId, [sinId], 2);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Fuerza');
  });

  it('rechaza si el Héroe no está en el Reino', () => {
    let s = activateAt('castillo');
    const id = malId(s);
    const auroraId = findCard(s, 'mal_f_aurora')!; // no colocado
    const salvId = findCard(s, 'mal_v_salvaje')!;
    s = placeVillainCard(s, id, 'castillo', salvId);
    expect(canVanquish(s, id, auroraId, [salvId], 2).valid).toBe(false);
  });

  it('Guardias requiere al menos dos Aliados', () => {
    // Guardias str 3, Salvaje str 4 ≥ 3 → fuerza ok, pero necesita 2 aliados
    let s = activateAt('castillo');
    const id = malId(s);
    const guarId = findCard(s, 'mal_f_guardias')!;
    const salvId = findCard(s, 'mal_v_salvaje')!;
    s = placeHeroInLoc(s, id, 'castillo', guarId);
    s = placeVillainCard(s, id, 'castillo', salvId);
    const res = canVanquish(s, id, guarId, [salvId], 2);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('dos Aliados');
  });
});

// ─── canMoveItemAlly ─────────────────────────────────────────────────────────
// montanas: [MOVE_ITEM_ALLY(0), PLAY_CARD(1), GAIN_POWER(2), FATE(3)]
// montanas es adyacente a: ['cabana']

describe('canMoveItemAlly', () => {
  it('acepta mover un Aliado a ubicación adyacente', () => {
    let s = activateAt('montanas');
    const id = malId(s);
    const salvId = findCard(s, 'mal_v_salvaje')!;
    s = placeVillainCard(s, id, 'montanas', salvId); // salvaje en montanas
    expect(canMoveItemAlly(s, id, salvId, 'cabana', 0).valid).toBe(true);
  });

  it('rechaza mover a ubicación no adyacente', () => {
    let s = activateAt('montanas');
    const id = malId(s);
    const salvId = findCard(s, 'mal_v_salvaje')!;
    s = placeVillainCard(s, id, 'montanas', salvId);
    // montanas solo es adyacente a 'cabana'; 'castillo' no lo es
    const res = canMoveItemAlly(s, id, salvId, 'castillo', 0);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('adyacente');
  });

  it('rechaza mover una carta que no es Aliado ni Objeto', () => {
    let s = activateAt('montanas');
    const id = malId(s);
    const selvaId = findCard(s, 'mal_v_selva')!; // CURSE
    s = placeVillainCard(s, id, 'montanas', selvaId);
    const res = canMoveItemAlly(s, id, selvaId, 'cabana', 0);
    expect(res.valid).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { canVanquish } from '../core/engine/RuleEngine';
import { TurnPhase } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { HookObjectiveStep, HookLocationId } from '../core/villains/hook/cards';
import { effects as hookEffects } from '../core/villains/hook/effects';
import {
  makeState, hookId, findCard,
  placeVillainCard, placeHeroInLoc,
  setPhase, setPawn, setCurrentPlayer,
} from './helpers/factories';
import type { GameState } from '../core/types';

// Jolly Roger slots: [GAIN_POWER(0), DISCARD(1), VANQUISH(2), PLAY_CARD(3)]
// Hook es player_1 (índice 1), así que hay que hacer setCurrentPlayer para que canUseSlot pase.

function hookActivateAt(locId: string): GameState {
  const s0 = makeState();
  const id = hookId(s0);
  let s = setCurrentPlayer(s0, id);
  s = setPhase(s, TurnPhase.ACTIVATE);
  s = setPawn(s, id, locId);
  return s;
}

// Adjunta Burla directamente al estado sin disparar efectos.
function attachBurla(state: GameState, heroId: string, burlaId: string): GameState {
  return {
    ...state,
    allCards: {
      ...state.allCards,
      [burlaId]: { ...state.allCards[burlaId], attachedToInstId: heroId },
      [heroId]:  { ...state.allCards[heroId],  attachedItemInstIds: [...(state.allCards[heroId]?.attachedItemInstIds ?? []), burlaId] },
    },
  };
}

// ─── canVanquish – Peter Pan ──────────────────────────────────────────────────

describe('canVanquish – Peter Pan', () => {
  it('acepta Vencer a Peter Pan sin Burla con fuerza suficiente', () => {
    // Peter Pan str 8; dos Matones (4+4=8 ≥ 8)
    let s = hookActivateAt('jollyroger');
    const id = hookId(s);
    const ppId   = findCard(s, 'hook_fate_peter_pan')!;
    const maton1 = findCard(s, 'hook_v_maton')!;
    const maton2 = Object.keys(s.allCards).find(
      k => s.allCards[k]?.defId.startsWith('hook_v_maton') && k !== maton1,
    )!;
    s = placeHeroInLoc(s, id, 'jollyroger', ppId);
    s = placeVillainCard(s, id, 'jollyroger', maton1);
    s = placeVillainCard(s, id, 'jollyroger', maton2);
    expect(canVanquish(s, id, ppId, [maton1, maton2], 2).valid).toBe(true);
  });

  it('bloquea Vencer a Peter Pan si hay cualquier héroe con Burla en el reino (misma ubicación)', () => {
    // Necesitamos fuerza suficiente (4+4=8 ≥ 8) para que el chequeo de Burla sea el que falle.
    let s = hookActivateAt('jollyroger');
    const id = hookId(s);
    const ppId         = findCard(s, 'hook_fate_peter_pan')!;
    const campanillaId = findCard(s, 'hook_f_campanilla')!;
    const burlaId      = findCard(s, 'hook_f_burla')!;
    const maton1       = findCard(s, 'hook_v_maton')!;
    const maton2       = Object.keys(s.allCards).find(
      k => s.allCards[k]?.defId.startsWith('hook_v_maton') && k !== maton1,
    )!;
    s = placeHeroInLoc(s, id, 'jollyroger', ppId);
    s = placeHeroInLoc(s, id, 'jollyroger', campanillaId);
    s = attachBurla(s, campanillaId, burlaId);
    s = placeVillainCard(s, id, 'jollyroger', maton1);
    s = placeVillainCard(s, id, 'jollyroger', maton2);
    const res = canVanquish(s, id, ppId, [maton1, maton2], 2);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Burla');
  });

  it('bloquea Vencer a Peter Pan si hay cualquier héroe con Burla en el reino (otra ubicación)', () => {
    // La Burla bloquea globalmente, no solo en la ubicación del héroe objetivo.
    let s = hookActivateAt('jollyroger');
    const id = hookId(s);
    const ppId         = findCard(s, 'hook_fate_peter_pan')!;
    const campanillaId = findCard(s, 'hook_f_campanilla')!;
    const burlaId      = findCard(s, 'hook_f_burla')!;
    const maton1       = findCard(s, 'hook_v_maton')!;
    const maton2       = Object.keys(s.allCards).find(
      k => s.allCards[k]?.defId.startsWith('hook_v_maton') && k !== maton1,
    )!;
    s = placeHeroInLoc(s, id, 'jollyroger', ppId);
    s = placeHeroInLoc(s, id, 'skullrock', campanillaId); // Burla en otra ubicación
    s = attachBurla(s, campanillaId, burlaId);
    s = placeVillainCard(s, id, 'jollyroger', maton1);
    s = placeVillainCard(s, id, 'jollyroger', maton2);
    expect(canVanquish(s, id, ppId, [maton1, maton2], 2).valid).toBe(false);
  });

  it('permite Vencer al propio héroe que tiene Burla adjunta', () => {
    // El héroe objetivo es quien tiene Burla → no está bloqueado por su propia regla.
    // Campanilla str 2; Espadachín str 2 → 2 ≥ 2
    let s = hookActivateAt('jollyroger');
    const id = hookId(s);
    const campanillaId  = findCard(s, 'hook_f_campanilla')!;
    const burlaId       = findCard(s, 'hook_f_burla')!;
    const espadachinId  = findCard(s, 'hook_v_espadachin')!;
    s = placeHeroInLoc(s, id, 'jollyroger', campanillaId);
    s = attachBurla(s, campanillaId, burlaId);
    s = placeVillainCard(s, id, 'jollyroger', espadachinId);
    expect(canVanquish(s, id, campanillaId, [espadachinId], 2).valid).toBe(true);
  });
});

// ─── checkWinCondition – Garfio ───────────────────────────────────────────────

describe('checkWinCondition – Garfio', () => {
  const plugin = getPlugin('hook');

  /** Estado con todos los pasos de objetivo completados y sin Tic Tac. */
  function makeWinState(): GameState {
    const s = makeState();
    const id = hookId(s);
    return {
      ...s,
      players: s.players.map(p => p.id !== id ? p : {
        ...p,
        completedObjectiveSteps: [
          HookObjectiveStep.HANGMAN_UNLOCKED,
          HookObjectiveStep.PETER_PAN_DEFEATED,
        ],
      }),
    };
  }

  it('gana con todos los pasos completados y sin Tic Tac en el reino', () => {
    expect(plugin.checkWinCondition(makeWinState(), hookId(makeWinState()))).toBe(true);
  });

  it('NO gana si Peter Pan no ha sido derrotado en el Jolly Roger', () => {
    let s = makeState();
    const id = hookId(s);
    s = {
      ...s,
      players: s.players.map(p => p.id !== id ? p : {
        ...p,
        completedObjectiveSteps: [HookObjectiveStep.HANGMAN_UNLOCKED], // sin PETER_PAN_DEFEATED
      }),
    };
    expect(plugin.checkWinCondition(s, id)).toBe(false);
  });

  it('NO gana con el estado inicial (ningún paso completado)', () => {
    const s = makeState();
    expect(plugin.checkWinCondition(s, hookId(s))).toBe(false);
  });
});

// ─── Démosles un susto – Peter Pan ─────────────────────────────────────────────

describe('Démosles un susto – Peter Pan', () => {
  it('juega a Peter Pan automáticamente en el Árbol del Ahorcado al revelarlo, sin ofrecer guardar/descartar para él', () => {
    let s = makeState();
    const id = hookId(s);
    const ppId = findCard(s, 'hook_fate_peter_pan')!;
    const player = s.players.find(p => p.id === id)!;
    const otherTopId = player.fateDeckInstIds.find(cid => cid !== ppId)!;

    // Coloca a Peter Pan como la carta superior del mazo de Destino de Garfio.
    s = {
      ...s,
      players: s.players.map(p => p.id !== id ? p : {
        ...p,
        fateDeckInstIds: [
          ppId, otherTopId,
          ...p.fateDeckInstIds.filter(cid => cid !== ppId && cid !== otherTopId),
        ],
      }),
    };

    const demoslesEffect = hookEffects.find(e => e.id === 'hook_demosles_susto')!;
    const result = demoslesEffect.execute(s, { actingPlayerId: id, cardInstId: 'dummy_card' });

    expect(result.allCards[ppId]?.locationId).toBe(HookLocationId.HANGMAN);
    const hangmanLs = result.players.find(p => p.id === id)!.locationStates[HookLocationId.HANGMAN];
    expect(hangmanLs.heroCardInstIds).toContain(ppId);
    // Solo la otra carta revelada queda pendiente de guardar/descartar.
    expect(result.pendingDemosles?.topCardIds).toEqual([otherTopId]);
  });
});

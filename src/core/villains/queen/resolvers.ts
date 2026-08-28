import type {
  GameState, PlayerId, CardInstId, ConditionHandler,
} from '../../types';
import { getPlayer, addLog, applyPowerGain } from '../../engine/stateHelpers';

// ─── CONDITION HANDLERS ───────────────────────────────────────────────────────

function handleFuria(s: GameState, reactingPlayerId: PlayerId): GameState {
  const player = getPlayer(s, reactingPlayerId);
  const eligible = Object.values(player.locationStates).flatMap(ls => ls.heroCardInstIds);
  if (eligible.length === 0) return addLog(s, 'Furia: no hay Héroes que Menguar.');
  return {
    ...s,
    pendingShrinkPick: { actingPlayerId: reactingPlayerId, eligibleHeroInstIds: eligible, max: 2 },
  };
}

function handleJuicio(s: GameState, reactingPlayerId: PlayerId): GameState {
  const s2 = applyPowerGain(s, reactingPlayerId, 3);
  return addLog(s2, `Juicio: ${getPlayer(s2, reactingPlayerId).name} recibe 3 Monedas de Poder.`);
}

export const conditionHandlers: Record<string, ConditionHandler> = {
  queen_furia_cond: handleFuria,
  queen_juicio_cond: handleJuicio,
};

// ─── onHeroDiscarded: Gato Risón permite convertir hasta 2 Soldados en Postigos ────

export function onHeroDiscarded(
  state: GameState,
  playerId: PlayerId,
  heroInstId: CardInstId,
): GameState {
  const hero = state.allCards[heroInstId];
  if (hero?.defId !== 'queen_f_rison') return state;
  const player = getPlayer(state, playerId);
  const eligible = Object.values(player.locationStates)
    .flatMap(ls => ls.villainCardInstIds)
    .filter(id => state.allCards[id]?.effectIds.includes('queen_soldado_toggle') && !state.allCards[id]?.isWicket);
  if (eligible.length === 0) return addLog(state, 'Gato Risón derrotado: no hay Soldados Naipe que convertir.');
  return {
    ...state,
    pendingWicketPick: {
      actingPlayerId: playerId, kind: 'TO_WICKET',
      sourceCardInstId: heroInstId, eligibleInstIds: eligible, max: 2,
    },
  };
}

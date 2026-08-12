// ─── Intenciones específicas de Garfio ───────────────────────────────────────────
// Sustituye a ai.ts (heurística implícita por pesos) por 3 intenciones con nombre propio.
import { CardType } from '../../types';
import type { CardInstId, GameState, PlayerState } from '../../types';
import type { AIContext, IntentionDef } from '../../ai/intent/types';
import { CardDefId, CardDefPrefix } from '../effectIds';
import { getEffectiveStrength } from '../../engine/stateHelpers';
import { findPeterPan, heroHasBurla, isPeterPanAtJollyRoger } from './aiHelpers';
import { HookLocationId, HookObjectiveStep } from './cards';

function ppDistanceToJollyRoger(locId: string): number {
  if (locId === HookLocationId.JOLLY_ROGER) return 0;
  if (locId === HookLocationId.SKULL_ROCK) return 1;
  if (locId === HookLocationId.LAGOON) return 2;
  return 3;
}

/** Buscar a Peter Pan: urgente mientras siga en el mazo de Destino — más aún cuanto más cerca
 *  esté de la cima (cavar con Démosles un susto/Rival Digno empieza a dar fruto). Urgencia: baja
 *  a 0 en cuanto aparece en el reino (entonces manda MOVE_PETER_PAN). */
const findPeterPanIntention: IntentionDef = {
  id: 'HOOK_FIND_PETER_PAN',
  name: 'Buscar a Peter Pan',
  polarity: -1,
  evaluate: (ctx: AIContext) => {
    if (findPeterPan(ctx.state, ctx.player)) return 0;
    const idx = ctx.player.fateDeckInstIds.findIndex(id => ctx.state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN);
    if (idx < 0) return 25;
    return 25 + Math.max(0, 10 - idx) * 3;
  },
};

/** Mover a Peter Pan hacia el Jolly Roger: es un LOGRO (más cerca = mejor, no un problema que
 *  "urja resolver"), sube monótonamente con el progreso real hacia la victoria. */
const movePeterPanIntention: IntentionDef = {
  id: 'HOOK_MOVE_PETER_PAN',
  name: 'Mover a Peter Pan hacia el Jolly Roger',
  polarity: 1,
  evaluate: (ctx: AIContext) => {
    const pp = findPeterPan(ctx.state, ctx.player);
    if (!pp) return 0;
    const dist = ppDistanceToJollyRoger(pp.locId);
    let v = (4 - dist) * 12;
    const ppStr = getEffectiveStrength(ctx.state, pp.id);
    const jrAllyStr = (ctx.player.locationStates[HookLocationId.JOLLY_ROGER]?.villainCardInstIds ?? [])
      .filter(id => ctx.state.allCards[id]?.cardType === CardType.ALLY)
      .reduce((sum, id) => sum + getEffectiveStrength(ctx.state, id), 0);
    if (jrAllyStr >= ppStr && ppStr > 0) v += 25;
    if (dist === 0) v += 40; // ya está en Jolly Roger: rematar es la victoria misma
    return v;
  },
};

/** Eliminar protectores (Burla/Tic Tac): mientras vivan, bloquean CUALQUIER otro Vencer —
 *  máxima prioridad estructural, no solo disrupción genérica. Urgencia CONTINUA (el hueco de
 *  Fuerza que falta por cubrir, no un salto de golpe) para que cada Aliado invertido rebaje la
 *  urgencia un poco — y con polarity −1, rebajarla puntúa como logro al puntuar la acción. */
const eliminateProtectorsIntention: IntentionDef = {
  id: 'HOOK_ELIMINATE_PROTECTORS',
  name: 'Eliminar protectores (Burla/Tic Tac)',
  polarity: -1,
  evaluate: (ctx: AIContext) => {
    let v = 0;
    for (const loc of ctx.locations) {
      const burla = loc.heroCardInstIds.filter(id => heroHasBurla(ctx.state, id));
      const ticTac = loc.heroCardInstIds.filter(
        id => !heroHasBurla(ctx.state, id) && ctx.state.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC,
      );
      const blockers = [...burla, ...ticTac];
      if (blockers.length === 0) continue;
      const blockerStr = blockers.reduce((sum, id) => sum + getEffectiveStrength(ctx.state, id), 0);
      const remaining = Math.max(0, blockerStr - loc.allyStrength);
      v += 30 + remaining * 8; // 30 mientras exista el bloqueante; el resto baja con la inversión
    }
    return v;
  },
};

export const intentions: IntentionDef[] = [findPeterPanIntention, movePeterPanIntention, eliminateProtectorsIntention];

/**
 * Cartas de mano que ya no aportan nada: buscadores de PP cuando ya está en el reino, Mapa de
 * Nunca Jamás cuando el Árbol ya está desbloqueado, Perspicaz/Obsesión sin objetivo posible en
 * el reino rival.
 */
export function deadCards(state: GameState, p: PlayerState): CardInstId[] {
  const pp = findPeterPan(state, p);
  const hangmanUnlocked = (p.completedObjectiveSteps ?? []).includes(HookObjectiveStep.HANGMAN_UNLOCKED);
  const opp = state.players.find(pl => pl.id !== p.id);
  const oppHasF4Ally = !!opp && Object.values(opp.locationStates).some(ls =>
    ls.villainCardInstIds.some(id => {
      const c = state.allCards[id];
      return c?.cardType === CardType.ALLY && getEffectiveStrength(state, id) >= 4;
    }),
  );
  const oppHasF4Hero = !!opp && Object.values(opp.locationStates).some(ls =>
    ls.heroCardInstIds.some(id => getEffectiveStrength(state, id) >= 4),
  );

  return p.handInstIds.filter(id => {
    const defId = state.allCards[id]?.defId ?? '';
    if (pp && (defId.startsWith(CardDefPrefix.HOOK_RIVAL) || defId.startsWith(CardDefPrefix.HOOK_SUSTO))) return true;
    if (hangmanUnlocked && defId.startsWith(CardDefPrefix.HOOK_MAPA)) return true;
    if (!oppHasF4Ally && defId.startsWith(CardDefPrefix.HOOK_PERSPICAZ)) return true;
    if (!oppHasF4Hero && defId.startsWith(CardDefPrefix.HOOK_OBSESION)) return true;
    return false;
  });
}

// isPeterPanAtJollyRoger se re-exporta por si algún consumidor futuro la necesita sin pasar por
// aiHelpers directamente (mantiene el mismo punto de entrada que las intenciones de arriba).
export { isPeterPanAtJollyRoger };

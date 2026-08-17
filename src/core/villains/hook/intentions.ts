// ─── Intenciones específicas de Garfio ───────────────────────────────────────────
// Sustituye a ai.ts (heurística implícita por pesos) por 3 intenciones con nombre propio.
import { CardType } from '../../types';
import type { CardInstId, GameState, PlayerState } from '../../types';
import type { AIContext, IntentionDef, StructuralThreatDef, VillainWeightProfile } from '../../ai/intent/types';
import { CardDefId, CardDefPrefix, EffectId } from '../effectIds';
import { getEffectiveStrength } from '../../engine/stateHelpers';
import { evaluateStrengthGapPenalty } from '../../ai/intent/structuralThreats';
import { DEFAULT_VILLAIN_WEIGHTS } from '../../ai/intent/villainWeights';
import { findPeterPan, heroHasBurla, isPeterPanAtJollyRoger } from './aiHelpers';
import { HookLocationId, HookObjectiveStep } from './cards';

/** Perfil de pesos dinámicos de Garfio (ver VillainWeightProfile) — en 1.0.
 *
 * PROBADO Y REVERTIDO (comboWeight: 0.4): trazando partidas reales
 * (scripts/_trace_hook_protector.ts) se confirmó que "Preparar combo" (universal, sin techo)
 * ahoga casi siempre a las 3 intenciones propias de Garfio — mismo fallo ya corregido para Jhon
 * (project_jhon_prepare_combo_counterweight) pero nunca aplicado aquí. Bajar comboWeight en
 * bloque para compensarlo pareció razonable, pero medido con el simulador (N=60): NO mejoró
 * hook-vs-jhon de forma clara (21.7%, dentro del mismo ruido 6.7-23.3% ya conocido) y SÍ
 * introdujo una partida estancada en hook-vs-maleficent (1/60 — no había pasado ni una vez en
 * ~300 partidas medidas antes de este cambio). Bajar `comboWeight` es un instrumento demasiado
 * grueso: también debilita reacciones legítimas de Garfio a amenazas reales, no solo la
 * sobreinversión en protectores. El diagnóstico raíz (prepareCombo ahogando sus intenciones
 * propias) sigue siendo válido — el arreglo correcto es un contrapeso DENTRO de
 * eliminateProtectorsIntention (como se hizo para Jhon), no una rebaja generalizada de la
 * categoría 'combo'. Pendiente de intentar esa vía específica. */
export const aiWeights: VillainWeightProfile = { ...DEFAULT_VILLAIN_WEIGHTS };

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
  category: 'fate',
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
  category: 'objective',
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

/** Amenaza estructural de Garfio: Burla (Objeto adjunto) y Tic Tac son los únicos héroes que
 *  bloquean CUALQUIER otro Vencer en su ubicación — máxima prioridad estructural, no solo
 *  disrupción genérica. basePenalty/perRemaining (30/8) son refactor puro, mismos valores que ya
 *  tenía. vanquishBonus/approachBonusPerUnit en 0: se probó copiar los valores ya calibrados de
 *  Maléfica (15/2) y, medido con el simulador (N=60), empeoró justo el emparejamiento que se
 *  quería mejorar (Jhon vs Garfio: 23.3%→11.7% victorias de Garfio) — probablemente desvía
 *  Aliados/turnos hacia vencer protectores a costa de buscar/escoltar a Peter Pan, su cuello de
 *  botella real contra Jhon. Revertido a 0 (comportamiento idéntico al de antes del refactor).
 *  Calibrar esto para Garfio necesita su propia investigación dedicada, no heredar el número de
 *  otro villano — pendiente como tarea aparte. */
const protectorThreat: StructuralThreatDef = {
  id: 'hook-protector',
  isThreatHero: (state, heroId) =>
    heroHasBurla(state, heroId) || state.allCards[heroId]?.defId === CardDefId.HOOK_TIC_TAC,
  strengthGap: { basePenalty: 30, perRemaining: 8, vanquishBonus: 0, approachBonusPerUnit: 0 },
};

export const structuralThreats: StructuralThreatDef[] = [protectorThreat];

/** Eliminar protectores (Burla/Tic Tac): mientras vivan, bloquean CUALQUIER otro Vencer —
 *  máxima prioridad estructural, no solo disrupción genérica. Urgencia CONTINUA (el hueco de
 *  Fuerza que falta por cubrir, no un salto de golpe) para que cada Aliado invertido rebaje la
 *  urgencia un poco — y con polarity −1, rebajarla puntúa como logro al puntuar la acción. */
const eliminateProtectorsIntention: IntentionDef = {
  id: 'HOOK_ELIMINATE_PROTECTORS',
  name: 'Eliminar protectores (Burla/Tic Tac)',
  polarity: -1,
  category: 'heroRemoval',
  evaluate: (ctx: AIContext) => evaluateStrengthGapPenalty(ctx, protectorThreat),
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
  // "¡A la orden, señor!" mueve un Aliado YA en juego — sin ningún Aliado en el reino no tiene
  // nada que mover. Sin marcarla muerta se quedaba en mano jugando siempre en negativo (mismo
  // patrón que Flecha Dorada/Arco con Flechas del Príncipe Juan, ver memoria
  // project_ai_frozen_hand_deadlock_fix): la mano nunca se ciclaba y Garfio dejaba de robar
  // cartas nuevas — confirmado con el simulador, partidas de 150+ rondas con la mano congelada.
  const hasAllyInKingdom = Object.values(p.locationStates)
    .some(ls => ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.ALLY));

  return p.handInstIds.filter(id => {
    const card = state.allCards[id];
    const defId = card?.defId ?? '';
    if (pp && (defId.startsWith(CardDefPrefix.HOOK_RIVAL) || defId.startsWith(CardDefPrefix.HOOK_SUSTO))) return true;
    if (hangmanUnlocked && defId.startsWith(CardDefPrefix.HOOK_MAPA)) return true;
    if (!hasAllyInKingdom && (card?.effectIds ?? []).includes(EffectId.A_LA_ORDEN)) return true;
    if (!oppHasF4Ally && defId.startsWith(CardDefPrefix.HOOK_PERSPICAZ)) return true;
    if (!oppHasF4Hero && defId.startsWith(CardDefPrefix.HOOK_OBSESION)) return true;
    return false;
  });
}

// isPeterPanAtJollyRoger se re-exporta por si algún consumidor futuro la necesita sin pasar por
// aiHelpers directamente (mantiene el mismo punto de entrada que las intenciones de arriba).
export { isPeterPanAtJollyRoger };

// ─── Intenciones específicas de Maléfica ─────────────────────────────────────────
// Sustituye a ai.ts (heurística implícita por pesos) por 3 intenciones con nombre propio.
import { ActionType, CardType } from '../../types';
import type { CardInstId, GameState, LocationId, LocationState, PlayerState } from '../../types';
import type { AIContext, IntentionDef, StructuralThreatDef, VillainWeightProfile } from '../../ai/intent/types';
import { getEffectDef, getPlugin } from '../registry';
import { evaluateStrengthGapPenalty } from '../../ai/intent/structuralThreats';
import { DEFAULT_VILLAIN_WEIGHTS } from '../../ai/intent/villainWeights';
import { CardDefPrefix } from '../effectIds';

/** Perfil de pesos dinámicos de Maléfica (ver VillainWeightProfile) — en 1.0 hasta calibrar con
 *  el simulador; ya está ganando en línea con Garfio/Jhon, no urge tocarlo primero. */
export const aiWeights: VillainWeightProfile = { ...DEFAULT_VILLAIN_WEIGHTS };

function locHasCurse(state: GameState, ls: LocationState): boolean {
  return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
}

function anyCurseBreakerAlive(state: GameState, p: PlayerState): boolean {
  return Object.values(p.locationStates).some(ls => {
    if (locHasCurse(state, ls)) return false;
    return ls.heroCardInstIds.some(id => state.allCards[id]?.effectIds.some(eid => getEffectDef(eid)?.blocksCursePlay));
  });
}

/** Fuego Verde se autodescarta en cuanto Maléfica vuelve a pisar esa ubicación (ON_PAWN_ARRIVES) —
 *  jugarlo la sella para siempre. "Crítico" = perdería para siempre una ranura de Vencer que aún
 *  hace falta (queda un bloqueante vivo en otro sitio), o la última ranura de Mover Aliado/Objeto
 *  que le queda accesible (la otra ya está sellada por un Fuego Verde anterior). Pedido por el
 *  usuario: reservar Fuego Verde para ubicaciones "baratas" y no perder Vencer/Mover Aliado por
 *  jugarlo sin pensar en la primera ubicación libre. */
export function fuegoVerdeWouldSealCritical(state: GameState, p: PlayerState, targetLocId: LocationId): boolean {
  const plugin = getPlugin(p.villainId);
  const targetLocDef = plugin.locations.find(l => l.id === targetLocId);
  if (!targetLocDef) return false;

  const isSealed = (locId: LocationId) =>
    (p.locationStates[locId]?.villainCardInstIds ?? []).some(
      id => state.allCards[id]?.defId.startsWith(CardDefPrefix.MAL_FUEGO),
    );
  const hasActionElsewhere = (type: string) =>
    plugin.locations.some(loc =>
      loc.id !== targetLocId && !isSealed(loc.id) && loc.actions.some(a => a.type === type),
    );

  const targetActionTypes = targetLocDef.actions.map(a => a.type);
  if (targetActionTypes.includes(ActionType.VANQUISH) && anyCurseBreakerAlive(state, p) && !hasActionElsewhere(ActionType.VANQUISH)) {
    return true;
  }
  if (targetActionTypes.includes(ActionType.MOVE_ITEM_ALLY) && !hasActionElsewhere(ActionType.MOVE_ITEM_ALLY)) {
    return true;
  }
  return false;
}

/** Amenaza estructural de Maléfica: Primavera es el único héroe de todo el juego con
 *  `blocksCursePlay` (verificado por grep) — cualquier otro héroe solo tapa ranuras, este es el
 *  ÚNICO que de verdad hace falta vencer para poder ganar. `locationStillRelevant` excluye
 *  ubicaciones ya malditas (el bloqueante ahí, si sigue vivo, ya dejó de importar). Los valores
 *  vanquishBonus/approachBonusPerUnit son los ya calibrados con el simulador (empezaron en 30/4,
 *  bajados a 15/2 tras medir que un empujón tan fuerte desviaba recursos de las otras 3
 *  ubicaciones — ver memoria project_maleficent_curse_regression_fixes). */
export const curseBreakerThreat: StructuralThreatDef = {
  id: 'mal-curse-breaker',
  isThreatHero: (state, heroId) =>
    state.allCards[heroId]?.effectIds.some(eid => getEffectDef(eid)?.blocksCursePlay) ?? false,
  locationStillRelevant: (ctx, locId) => {
    const ls = ctx.player.locationStates[locId];
    return !(ls?.villainCardInstIds.some(id => ctx.state.allCards[id]?.cardType === CardType.CURSE) ?? false);
  },
  strengthGap: { basePenalty: 35, perRemaining: 8, vanquishBonus: 15, approachBonusPerUnit: 2 },
};

export const structuralThreats: StructuralThreatDef[] = [curseBreakerThreat];

/** Jugar maldiciones: urgente cuando quedan ubicaciones sin cubrir; si no hay ninguna en mano
 *  hay que ciclar la mano para encontrarla (motor de ciclado). */
const playCursesIntention: IntentionDef = {
  id: 'MAL_PLAY_CURSES',
  name: 'Jugar maldiciones',
  polarity: -1,
  category: 'objective',
  evaluate: (ctx: AIContext) => {
    const uncovered = ctx.locations.filter(l => !locHasCurse(ctx.state, {
      id: l.id, isLocked: l.isLocked, villainCardInstIds: l.villainCardInstIds, heroCardInstIds: l.heroCardInstIds,
    })).length;
    if (uncovered === 0) return 0;
    const cursesInHand = ctx.player.handInstIds.filter(id => ctx.state.allCards[id]?.cardType === CardType.CURSE).length;
    let v = uncovered * 20;
    // Ciclar para encontrar una Maldición: bono MENOR que el de cubrir una ubicación (uncovered
    // × 20), o jugar la ÚLTIMA maldición en mano (mano queda vacía) se compensaba exactamente
    // con este término y la acción de jugarla parecía "neutra" en vez de resolver la urgencia
    // (trampa de gradiente: coincidencia numérica entre "vacía la mano" y "reduce lo que falta").
    if (cursesInHand === 0) v += (4 - ctx.player.handInstIds.length) * 1.5;
    return v;
  },
};

/** Proteger maldiciones: urgente cuando un héroe rival ha llegado a una ubicación ya cubierta y
 *  podría retirarla. */
const protectCursesIntention: IntentionDef = {
  id: 'MAL_PROTECT_CURSES',
  name: 'Proteger maldiciones',
  polarity: -1,
  category: 'objective',
  evaluate: (ctx: AIContext) => {
    let v = 0;
    for (const loc of ctx.locations) {
      const ls: LocationState = { id: loc.id, isLocked: loc.isLocked, villainCardInstIds: loc.villainCardInstIds, heroCardInstIds: loc.heroCardInstIds };
      if (locHasCurse(ctx.state, ls) && loc.heroCardInstIds.length > 0) v += 25 + loc.heroStrength * 3;
    }
    return v;
  },
};

/** Eliminar héroes que rompen maldiciones: el héroe que bloquea la ÚLTIMA ubicación sin cubrir
 *  (p. ej. Primavera) es más urgente que vencer a cualquier otro — sin él no se puede ganar. */
const eliminateCurseBreakersIntention: IntentionDef = {
  id: 'MAL_ELIMINATE_CURSE_BREAKERS',
  name: 'Eliminar héroes que rompen maldiciones',
  polarity: -1,
  category: 'heroRemoval',
  evaluate: (ctx: AIContext) => evaluateStrengthGapPenalty(ctx, curseBreakerThreat),
};

export const intentions: IntentionDef[] = [playCursesIntention, protectCursesIntention, eliminateCurseBreakersIntention];

/** Maldiciones sobrantes en mano: solo son útiles para las ubicaciones aún sin cubrir (+1 de
 *  reserva por si un héroe retira una); el resto solo ocupa espacio. */
export function deadCards(state: GameState, p: PlayerState): CardInstId[] {
  const uncovered = Object.values(p.locationStates).filter(ls => !locHasCurse(state, ls)).length;
  const cursesInHand = p.handInstIds.filter(id => state.allCards[id]?.cardType === CardType.CURSE);
  const surplus = cursesInHand.length - (uncovered + 1);
  const dead = surplus > 0 ? cursesInHand.slice(-surplus) : [];

  // Sin ninguna Maldición en mano y aún queda al menos una ubicación por cubrir: ciclar
  // activamente para ir a buscarla. Sin esto, deadCards() nunca marcaba nada en este caso, y como
  // DEAD_HAND_CARD (actionScoring.ts) es el único término que premia Descartar, la IA se quedaba
  // sentada sobre Condiciones/Efectos sin usar en vez de refrescar la mano — medido con el
  // simulador: 65% de los turnos de Maléfica sin ninguna Maldición en mano y 0/30 partidas
  // llegando a 4/4 ubicaciones malditas. Solo se marcan Condición/Efecto (nunca Aliado/Objeto, que
  // hacen falta para desarrollo y para vencer a los héroes que bloquean el maldecido — ver
  // eliminateCurseBreakersIntention): jugarlas cuando SÍ compensa (p. ej. Forma de Dragón con un
  // héroe válido delante) sigue siendo una jugada PLAY_CARD aparte que puntúa por su propio
  // mérito; esta lista solo decide si vale la pena descartarlas cuando no se están usando.
  if (uncovered > 0 && cursesInHand.length === 0) {
    const cyclable = p.handInstIds.filter(id => {
      const t = state.allCards[id]?.cardType;
      return t === CardType.CONDITION || t === CardType.EFFECT;
    });
    dead.push(...cyclable);

    // Objetos sueltos: sin ninguna Maldición que buscar todavía, no compensa guardarlos "por si
    // acaso" — necesitan un Aliado ya en juego para servir de algo, y sacan a Maléfica de mano
    // muerta. Se marcan TODOS (antes solo uno como último recurso): un solo Objeto de sobra
    // apenas mueve la aguja de drawCards (needed = handSize - handInstIds.length), y con la
    // Condición/Efecto ya ciclados, una mano de 3-4 Objetos podía quedar CASI intacta turno tras
    // turno. Antes, además, esto no tenía ningún efecto real: genDiscard() excluía los Objetos de
    // discardable por completo (bug corregido en legalMoves.ts), así que un Objeto marcado
    // "muerto" aquí se filtraba en silencio antes de convertirse en una jugada legal.
    const looseItems = p.handInstIds.filter(id => state.allCards[id]?.cardType === CardType.ITEM);
    dead.push(...looseItems);

    // OJO: se probó también reservar solo los 2 Aliados más fuertes de la mano y descartar el
    // resto en sequía — medido con el simulador, empeoró el resultado final (victorias 11/80→8/80,
    // llega a 3ª maldición 55%→39%, partidas atascadas en 1 sola maldición 23%→45%) pese a mejorar
    // los indicadores de mano/bloqueante. Los Aliados en mano aportan desarrollo/presión aunque no
    // se jueguen ese turno — descartarlos "de sobra" mientras aún faltan Maldiciones les cuesta más
    // tempo del que ahorran ciclando. Revertido; los Objetos (arriba) sí se quedan.
  }

  // Fuego Verde sin ningún destino seguro: si TODAS las ubicaciones sin cubrir sellarían para
  // siempre una ranura de Vencer o Mover Aliado que aún hace falta (ver
  // fuegoVerdeWouldSealCritical), no vale la pena guardarlo esperando un hueco que quizá no
  // llegue — mejor descartarlo y ciclar hacia otra cosa jugable. Independiente del resto de este
  // bloque: aplica aunque SÍ haya otras Maldiciones en mano.
  const fuegoInHand = p.handInstIds.filter(id => state.allCards[id]?.defId.startsWith(CardDefPrefix.MAL_FUEGO) && !dead.includes(id));
  if (fuegoInHand.length > 0) {
    const uncoveredLocIds = Object.entries(p.locationStates)
      .filter(([, ls]) => !locHasCurse(state, ls) && !ls.isLocked)
      .map(([locId]) => locId);
    const hasSafeTarget = uncoveredLocIds.some(locId => !fuegoVerdeWouldSealCritical(state, p, locId));
    if (!hasSafeTarget) dead.push(...fuegoInHand);
  }
  return dead;
}

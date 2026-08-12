// ─── Intenciones específicas de Maléfica ─────────────────────────────────────────
// Sustituye a ai.ts (heurística implícita por pesos) por 3 intenciones con nombre propio.
import { CardType } from '../../types';
import type { CardInstId, GameState, LocationState, PlayerState } from '../../types';
import type { AIContext, IntentionDef } from '../../ai/intent/types';
import { getEffectDef } from '../registry';
import { getEffectiveStrength } from '../../engine/stateHelpers';

function locHasCurse(state: GameState, ls: LocationState): boolean {
  return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
}

/** Jugar maldiciones: urgente cuando quedan ubicaciones sin cubrir; si no hay ninguna en mano
 *  hay que ciclar la mano para encontrarla (motor de ciclado). */
const playCursesIntention: IntentionDef = {
  id: 'MAL_PLAY_CURSES',
  name: 'Jugar maldiciones',
  polarity: -1,
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
  evaluate: (ctx: AIContext) => {
    let v = 0;
    for (const loc of ctx.locations) {
      const ls: LocationState = { id: loc.id, isLocked: loc.isLocked, villainCardInstIds: loc.villainCardInstIds, heroCardInstIds: loc.heroCardInstIds };
      if (locHasCurse(ctx.state, ls)) continue;
      const blockingHero = loc.heroCardInstIds.find(id =>
        ctx.state.allCards[id]?.effectIds.some(eid => getEffectDef(eid)?.blocksCursePlay),
      );
      if (!blockingHero) continue;
      const heroStr = getEffectiveStrength(ctx.state, blockingHero);
      const remaining = Math.max(0, heroStr - loc.allyStrength);
      v += 35 + remaining * 8; // 35 mientras exista el bloqueante; el resto baja con la inversión
    }
    return v;
  },
};

export const intentions: IntentionDef[] = [playCursesIntention, protectCursesIntention, eliminateCurseBreakersIntention];

/** Maldiciones sobrantes en mano: solo son útiles para las ubicaciones aún sin cubrir (+1 de
 *  reserva por si un héroe retira una); el resto solo ocupa espacio. */
export function deadCards(state: GameState, p: PlayerState): CardInstId[] {
  const uncovered = Object.values(p.locationStates).filter(ls => !locHasCurse(state, ls)).length;
  const cursesInHand = p.handInstIds.filter(id => state.allCards[id]?.cardType === CardType.CURSE);
  const surplus = cursesInHand.length - (uncovered + 1);
  return surplus > 0 ? cursesInHand.slice(-surplus) : [];
}

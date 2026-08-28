// ─── Intenciones específicas de la Reina de Corazones ────────────────────────────
import { CardType } from '../../types';
import type { CardInstId, GameState, PlayerState } from '../../types';
import type { AIContext, IntentionDef, StructuralThreatDef, VillainWeightProfile } from '../../ai/intent/types';
import { evaluateFixedThreatPenalty } from '../../ai/intent/structuralThreats';
import { DEFAULT_VILLAIN_WEIGHTS } from '../../ai/intent/villainWeights';

// TODO: sin datos del simulador todavía (villano nuevo) — pesos por defecto (no-op) hasta poder
// correr scripts/simulate.ts Reina-vs-cada-villano y calibrar como se hizo con los otros 3.
export const aiWeights: VillainWeightProfile = { ...DEFAULT_VILLAIN_WEIGHTS };

/** Alicia bloquea TODO movimiento de Aliados/Objetos — paraliza por completo la mecánica central
 *  (nunca se puede redistribuir Soldados/Postigos entre ubicaciones mientras viva). */
const aliciaThreat: StructuralThreatDef = {
  id: 'queen-alicia',
  isThreatHero: (state, heroId) => state.allCards[heroId]?.defId === 'queen_f_alicia',
  fixedPenaltyWhileAlive: 45,
};
/** Dodo bloquea la conversión Soldado→Postigo solo en su propia ubicación — penalización más
 *  ligera que Alicia (binaria, pero de alcance local, no total sobre el reino). */
const dodoThreat: StructuralThreatDef = {
  id: 'queen-dodo',
  isThreatHero: (state, heroId) => state.allCards[heroId]?.defId === 'queen_f_dodo',
  fixedPenaltyWhileAlive: 20,
};
export const structuralThreats: StructuralThreatDef[] = [aliciaThreat, dodoThreat];

/** Nº de ubicaciones del Reino con al menos un Postigo. */
function wicketCoverage(ctx: AIContext): number {
  return ctx.locations.filter(l => l.villainCardInstIds.some(id => ctx.state.allCards[id]?.isWicket)).length;
}

/**
 * Cubrir el Reino de Postigos: URGENCIA formulada como hueco restante (ubicaciones aún sin
 * Postigo) para que cada conversión parcial sume alineación, no solo la última que completa la
 * cobertura — mismo patrón que UNLOCK_LOCATIONS (universal) y PREPARE_COMBO. Resta la
 * penalización de Alicia/Dodo (mientras bloquean, el hueco es más urgente/costoso de cerrar).
 */
const coverLocationsIntention: IntentionDef = {
  id: 'QUEEN_COVER_LOCATIONS',
  name: 'Cubrir el Reino de Postigos',
  polarity: -1,
  category: 'objective',
  evaluate: (ctx: AIContext) => {
    const totalLocs = ctx.locations.length;
    const missing = totalLocs - wicketCoverage(ctx);
    if (missing === 0) return 0;
    let v = missing * 30;
    v += evaluateFixedThreatPenalty(ctx, aliciaThreat);
    v += evaluateFixedThreatPenalty(ctx, dodoThreat);
    return v;
  },
};

/**
 * Efectuar el tiro: LOGRO que permanece en 0 hasta cubrir las 4 ubicaciones, y da un salto grande
 * en cuanto la carta es jugable — empuja a rematar en vez de seguir acumulando Postigos de más
 * una vez alcanzada la cobertura completa.
 */
const takeTheShotIntention: IntentionDef = {
  id: 'QUEEN_TAKE_THE_SHOT',
  name: 'Efectúa el tiro',
  polarity: 1,
  category: 'objective',
  evaluate: (ctx: AIContext) => {
    const totalLocs = ctx.locations.length;
    if (wicketCoverage(ctx) < totalLocs) return 0;
    const hasTiroInHand = ctx.player.handInstIds.some(id => ctx.state.allCards[id]?.effectIds.includes('queen_efectua_el_tiro'));
    return hasTiroInHand ? 200 : 120;
  },
};

export const intentions: IntentionDef[] = [coverLocationsIntention, takeTheShotIntention];

/**
 * Cartas de mano muertas: Menguar/Furia sin ningún Héroe rival en el reino, Lanza sin ningún
 * Aliado al que unirse, y Efectúa el tiro mientras aún falte cubrir alguna ubicación (evita el
 * bug ya documentado de mano congelada — ver memoria project_ai_frozen_hand_deadlock_fix).
 */
export function deadCards(state: GameState, p: PlayerState): CardInstId[] {
  const out: CardInstId[] = [];
  const hasHeroInKingdom = Object.values(p.locationStates).some(ls => ls.heroCardInstIds.length > 0);
  const hasAllyInKingdom = Object.values(p.locationStates)
    .some(ls => ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.ALLY));
  const totalLocs = Object.keys(p.locationStates).length;
  const coveredLocs = Object.values(p.locationStates)
    .filter(ls => ls.villainCardInstIds.some(id => state.allCards[id]?.isWicket)).length;
  const fullyCovered = coveredLocs >= totalLocs;

  const seenCondNames = new Set<string>();
  for (const id of p.handInstIds) {
    const c = state.allCards[id];
    if (!c) continue;
    if (!hasHeroInKingdom && (c.effectIds.includes('queen_menguar') || c.effectIds.includes('queen_cabeza'))) {
      out.push(id); continue;
    }
    if (!hasAllyInKingdom && c.effectIds.includes('queen_lanza_attach')) { out.push(id); continue; }
    if (!fullyCovered && c.effectIds.includes('queen_efectua_el_tiro')) { out.push(id); continue; }
    if (c.cardType === CardType.CONDITION) {
      if (seenCondNames.has(c.name)) { out.push(id); continue; }
      seenCondNames.add(c.name);
    }
  }
  return out;
}

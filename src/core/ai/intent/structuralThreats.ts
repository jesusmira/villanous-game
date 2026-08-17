// ─── Motor genérico de amenazas estructurales ─────────────────────────────────────
// Generaliza un patrón que existía reinventado 3 veces (Maléfica: Primavera/blocksCursePlay,
// Garfio: Burla/Tic Tac, Jhon: Robin Hood/Rey Ricardo/Poder retenido) en un único mecanismo
// declarativo — ver StructuralThreatDef (core/ai/intent/types.ts). Cada villano solo declara
// DATOS (qué héroe cuenta, cuánto penaliza, cuánto bonifica resolverlo); el cálculo vive aquí,
// una sola vez, para los 3 villanos actuales y cualquiera futuro.
import { ActionType } from '../../types';
import type { CardInstId, LocationId } from '../../types';
import type { AIContext, ActionCandidate, StructuralThreatDef } from './types';
import { getEffectiveStrength } from '../../engine/stateHelpers';
import { bfsDistances } from './universalIntentions';

/** Fuerza de Aliados propios "de camino" hacia `targetLocId`, ponderada por cercanía (BFS sobre
 *  adjacentIds) — para que cada salto de acercamiento puntúe algo, no solo el que completa el
 *  trayecto. Mismo cálculo que usaba en exclusiva el bloqueante de Maléfica, generalizado. */
function nearbyAllyProgress(ctx: AIContext, targetLocId: LocationId): number {
  const distances = bfsDistances(ctx.plugin.locations, targetLocId);
  let total = 0;
  for (const loc of ctx.locations) {
    if (loc.id === targetLocId || loc.allyStrength === 0) continue;
    const dist = distances.get(loc.id);
    if (dist === undefined) continue;
    total += loc.allyStrength / (dist + 1);
  }
  return total;
}

/** Ubicaciones propias donde vive un héroe de `threat` y la amenaza sigue siendo relevante ahí
 *  (ver `locationStillRelevant`). Vacío para amenazas sin `strengthGap` (binarias/por recurso). */
export function threatBlockedLocationIds(ctx: AIContext, threat: StructuralThreatDef): LocationId[] {
  if (!threat.strengthGap) return [];
  return ctx.locations
    .filter(loc => threat.locationStillRelevant?.(ctx, loc.id) ?? true)
    .filter(loc => loc.heroCardInstIds.some(id => threat.isThreatHero(ctx.state, id)))
    .map(loc => loc.id);
}

/** Fuerza de la amenaza aún sin cubrir en `locId` (Fuerza del héroe − Aliados ya ahí − progreso
 *  ponderado de Aliados en camino). 0 si la amenaza no está presente/relevante ahí. */
function threatRemainingAt(ctx: AIContext, threat: StructuralThreatDef, locId: LocationId): number {
  if (!threat.strengthGap) return 0;
  const loc = ctx.locations.find(l => l.id === locId);
  if (!loc) return 0;
  const heroStr = loc.heroCardInstIds
    .filter(id => threat.isThreatHero(ctx.state, id))
    .reduce((sum, id) => sum + getEffectiveStrength(ctx.state, id), 0);
  if (heroStr === 0) return 0;
  return Math.max(0, heroStr - loc.allyStrength - nearbyAllyProgress(ctx, locId));
}

/** Penalización de "hueco de fuerza" de una amenaza `strengthGap`, sumada sobre todas las
 *  ubicaciones donde bloquea — para usar DENTRO de la intención propia del villano (mismo
 *  espíritu que el resto de intenciones "de urgencia": baja con cada Aliado invertido). */
export function evaluateStrengthGapPenalty(ctx: AIContext, threat: StructuralThreatDef): number {
  if (!threat.strengthGap) return 0;
  let v = 0;
  for (const locId of threatBlockedLocationIds(ctx, threat)) {
    v += threat.strengthGap.basePenalty + threatRemainingAt(ctx, threat, locId) * threat.strengthGap.perRemaining;
  }
  return v;
}

/** Penalización fija/escalada de una amenaza binaria o por recurso (`fixedPenaltyWhileAlive`/
 *  `scaledPenalty`) — para usar dentro de la intención propia del villano. 0 para amenazas
 *  `strengthGap` (esas usan `evaluateStrengthGapPenalty`). */
export function evaluateFixedThreatPenalty(ctx: AIContext, threat: StructuralThreatDef): number {
  const heroesInKingdom: CardInstId[] = ctx.locations
    .flatMap(l => l.heroCardInstIds)
    .filter(id => threat.isThreatHero(ctx.state, id));
  let v = 0;
  if (threat.fixedPenaltyWhileAlive && heroesInKingdom.length > 0) v += threat.fixedPenaltyWhileAlive;
  if (threat.scaledPenalty) {
    v += heroesInKingdom.reduce((sum, id) => sum + threat.scaledPenalty!(ctx.state, id), 0);
  }
  return v;
}

/** Bono estructural (fuera de intentionAlignment, en actionScoring.ts) por vencer o acercarse a
 *  una amenaza `strengthGap` — reemplaza el `computeCurseBreakerBonus` que antes solo existía
 *  para Maléfica. Independiente de la intención elegida ese turno: vencer al héroe que de verdad
 *  bloquea la victoria (o acercarse) siempre suma, la haya elegido o no `chooseIntention()`. */
export function computeStructuralThreatBonus(
  ctxBefore: AIContext, ctxAfter: AIContext, candidate: ActionCandidate,
): number {
  let total = 0;
  for (const threat of ctxBefore.plugin.structuralThreats ?? []) {
    if (!threat.strengthGap) continue;
    const blockedBefore = threatBlockedLocationIds(ctxBefore, threat);
    if (blockedBefore.length === 0) continue;

    if (candidate.kind === ActionType.VANQUISH) {
      const blockedAfter = threatBlockedLocationIds(ctxAfter, threat);
      if (blockedAfter.length < blockedBefore.length) total += threat.strengthGap.vanquishBonus;
    } else if (candidate.kind === ActionType.MOVE_ITEM_ALLY) {
      const remainingBefore = blockedBefore.reduce((sum, locId) => sum + threatRemainingAt(ctxBefore, threat, locId), 0);
      const blockedAfter = threatBlockedLocationIds(ctxAfter, threat);
      const remainingAfter = blockedAfter.reduce((sum, locId) => sum + threatRemainingAt(ctxAfter, threat, locId), 0);
      total += Math.max(0, remainingBefore - remainingAfter) * threat.strengthGap.approachBonusPerUnit;
    }
  }
  return total;
}

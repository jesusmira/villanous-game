// ─── Valor de ubicación avanzado ──────────────────────────────────────────────────
// Score multi-factor de una ubicación PROPIA: acciones disponibles, héroes presentes, Aliados
// presentes, bloqueos, sinergia con la mano, sinergia con lo ya en juego, oportunidades futuras.
// Uso deliberadamente conservador (ver planner.ts): NO sustituye la búsqueda real de destino
// (el rollout ya validado), solo AMPLÍA qué candidatos se exploran a fondo — mismo patrón ya
// probado con el destino favorito del rival humano (opponentModel.ts).
import { CardType } from '../../types';
import type { LocationDef, LocationId } from '../../types';
import type { AIContext } from './types';
import { SLOT_DAMAGE } from './actionScoring';
import { bfsDistances } from './universalIntentions';

export interface LocationValueBreakdown {
  actionsAvailable: number;
  heroesPresent: number;
  alliesPresent: number;
  blockage: number;
  handSynergy: number;
  boardSynergy: number;
  futureOpportunity: number;
  total: number;
}

function slotValue(locDef: LocationDef): number {
  return locDef.actions.reduce((sum, a) => sum + (SLOT_DAMAGE[a.type] ?? 3), 0);
}

export function computeLocationValue(ctx: AIContext, locId: LocationId): LocationValueBreakdown {
  const locDef = ctx.plugin.locations.find(l => l.id === locId);
  const loc = ctx.locations.find(l => l.id === locId);
  if (!locDef || !loc || loc.isLocked) {
    return { actionsAvailable: 0, heroesPresent: 0, alliesPresent: 0, blockage: 0, handSynergy: 0, boardSynergy: 0, futureOpportunity: 0, total: -100 };
  }

  const hasHeroes = loc.heroCardInstIds.length > 0;
  const blockedSlotCount = hasHeroes ? Math.min(2, locDef.actions.length) : 0;
  const blockedValue = locDef.actions.slice(0, blockedSlotCount).reduce((sum, a) => sum + (SLOT_DAMAGE[a.type] ?? 3), 0);
  const actionsAvailable = (slotValue(locDef) - (loc.blocksSlots ? blockedValue : 0)) * 0.3;

  const heroesPresent = loc.blocksSlots ? -loc.heroStrength * 0.8 : 0;
  const alliesPresent = loc.allyStrength * 0.5;
  const blockage = loc.blocksSlots ? -blockedValue * 0.4 : 0;

  const hasPlayCardSlot = locDef.actions.some(a => a.type === 'PLAY_CARD');
  const handSynergy = hasPlayCardSlot
    ? ctx.player.handInstIds.filter(id => {
        const c = ctx.state.allCards[id];
        if (!c) return false;
        const cost = Math.max(0, c.baseCost + c.costModifier);
        return ctx.player.power >= cost;
      }).length * 2
    : 0;

  const boardSynergy = loc.villainCardInstIds
    .filter(id => ctx.state.allCards[id]?.cardType === CardType.ITEM)
    .length * 1.5;

  // Oportunidades futuras: cuanto más cerca esté esta ubicación de la amenaza (héroe propio) más
  // fuerte sin vencer, más vale visitarla para acercar Aliados/objetos en los próximos turnos.
  let priorityLoc: LocationId | null = null;
  let priorityStr = 0;
  for (const l of ctx.locations) {
    if (l.heroStrength > priorityStr && l.allyStrength < l.heroStrength) { priorityStr = l.heroStrength; priorityLoc = l.id; }
  }
  let futureOpportunity = 0;
  if (priorityLoc) {
    const distances = bfsDistances(ctx.plugin.locations, priorityLoc);
    const dist = distances.get(locId) ?? 99;
    futureOpportunity = 5 / (1 + dist);
  }

  const total = actionsAvailable + heroesPresent + alliesPresent + blockage + handSynergy + boardSynergy + futureOpportunity;
  return { actionsAvailable, heroesPresent, alliesPresent, blockage, handSynergy, boardSynergy, futureOpportunity, total };
}

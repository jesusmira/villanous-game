// ─── Intenciones universales ───────────────────────────────────────────────────────
// Válidas para cualquier villano — la parte específica de cada uno vive en
// villains/<id>/intentions.ts y se mezcla con estas en el planificador.
//
// Nota de diseño (polarity): las intenciones "de urgencia" (sube cuando hay un problema sin
// resolver, p. ej. un héroe bloqueando) están formuladas como "hueco restante" — decrecen
// SUAVEMENTE con cada paso de inversión, no solo de golpe al completarse — para que
// intentionAlignment (ver actionScoring.ts) premie tanto el progreso parcial como la resolución
// final. Ver IntentionDef.polarity para el porqué del signo.
import { CardType } from '../../types';
import type { LocationDef, LocationId } from '../../types';
import type { IntentionDef, AIContext } from './types';
import { lerpCurve } from './curve';

/** Distancia (en saltos) desde `fromId` a cada ubicación alcanzable, vía adjacentIds. Exportada
 *  para que locationValue.ts (Fase 4) reutilice el mismo cálculo de "oportunidades futuras". */
export function bfsDistances(locations: LocationDef[], fromId: LocationId): Map<LocationId, number> {
  const dist = new Map<LocationId, number>([[fromId, 0]]);
  const queue: LocationId[] = [fromId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curDef = locations.find(l => l.id === cur);
    if (!curDef) continue;
    const curDist = dist.get(cur)!;
    for (const adjId of curDef.adjacentIds) {
      if (!dist.has(adjId)) { dist.set(adjId, curDist + 1); queue.push(adjId); }
    }
  }
  return dist;
}

export const IntentId = {
  ADVANCE_OBJECTIVE: 'ADVANCE_OBJECTIVE',
  ELIMINATE_HEROES: 'ELIMINATE_HEROES',
  SEEK_KEY_CARD: 'SEEK_KEY_CARD',
  GENERATE_POWER: 'GENERATE_POWER',
  PREPARE_COMBO: 'PREPARE_COMBO',
  SLOW_ENEMY_FATE: 'SLOW_ENEMY_FATE',
  PREPARE_VICTORY: 'PREPARE_VICTORY',
  UNLOCK_LOCATIONS: 'UNLOCK_LOCATIONS',
  DISCARD_DEAD_HAND: 'DISCARD_DEAD_HAND',
} as const;

/** Avanzar el objetivo de victoria: LOGRO — más urgente (vale más seguir empujando) cuanto más
 *  avanzado ya está (momentum: rematar vale más que empezar algo nuevo), curva continua. */
const advanceObjective: IntentionDef = {
  id: IntentId.ADVANCE_OBJECTIVE,
  name: 'Avanzar objetivo',
  polarity: 1,
  evaluate: (ctx: AIContext) => lerpCurve(ctx.ownProgress, [[0, 5], [40, 15], [70, 35], [90, 70]]),
};

/** Eliminar héroes: URGENCIA — el hueco de Fuerza que falta por cubrir baja con cada Aliado
 *  invertido; un término base por hero presente se mantiene hasta que el héroe desaparece de
 *  verdad (Vencer), para que la resolución complete siga sumando alineación al final. */
const eliminateHeroes: IntentionDef = {
  id: IntentId.ELIMINATE_HEROES,
  name: 'Eliminar héroes',
  polarity: -1,
  evaluate: (ctx: AIContext) => {
    let v = 0;
    for (const loc of ctx.locations) {
      if (loc.heroStrength === 0) continue;
      const remaining = Math.max(0, loc.heroStrength - loc.allyStrength);
      v += Math.min(loc.heroStrength, 6) * 2 + remaining * 3;
    }
    return v;
  },
};

/** Buscar carta clave: URGENCIA — mano llena de cartas muertas hay que ciclarla. */
const seekKeyCard: IntentionDef = {
  id: IntentId.SEEK_KEY_CARD,
  name: 'Buscar carta clave',
  polarity: -1,
  evaluate: (ctx: AIContext) => {
    const dead = ctx.deadHandCardIds.length;
    const handSize = ctx.player.handInstIds.length;
    if (handSize === 0) return 0;
    return (dead / handSize) * 40;
  },
};

/** Generar poder: URGENCIA — decrece a partir de un colchón razonable. */
const generatePower: IntentionDef = {
  id: IntentId.GENERATE_POWER,
  name: 'Generar poder',
  polarity: -1,
  evaluate: (ctx: AIContext) => lerpCurve(ctx.player.power, [[0, 40], [4, 20], [8, 5], [14, 0]]),
};

/** Preparar combo: URGENCIA — el hueco de Fuerza que falta en el héroe/bloqueante MÁS urgente
 *  baja con cada Aliado invertido AHÍ, y el "hueco de distancia" de Aliados libres baja cuanto
 *  más se acercan a esa amenaza — sin esto, mover un Aliado un paso más cerca de un héroe fuerte
 *  puntúa igual que dejarlo quieto (ver memoria project_jhon_ally_gradient_fix, generalizado a
 *  cualquier villano). Vale 0 en cuanto no queda ningún hueco (héroe vencido o ya cubierto). */
const prepareCombo: IntentionDef = {
  id: IntentId.PREPARE_COMBO,
  name: 'Preparar combo',
  polarity: -1,
  evaluate: (ctx: AIContext) => {
    let v = 0;
    let priorityLoc: LocationId | null = null;
    let priorityHeroStr = 0;
    for (const loc of ctx.locations) {
      if (loc.heroStrength <= 0) continue;
      const remaining = Math.max(0, loc.heroStrength - loc.allyStrength);
      v += remaining * 6;
      if (loc.heroStrength > priorityHeroStr && remaining > 0) {
        priorityHeroStr = loc.heroStrength;
        priorityLoc = loc.id;
      }
    }
    if (priorityLoc) {
      const distances = bfsDistances(ctx.plugin.locations, priorityLoc);
      for (const loc of ctx.locations) {
        if (loc.heroStrength > 0 || loc.allyStrength === 0) continue; // ya contado arriba, o vacío
        const dist = distances.get(loc.id) ?? 99;
        // hueco de distancia: máximo cuando está lejos, 0 cuando ya está en la ubicación destino
        v += loc.allyStrength * 3 * (dist / (1 + dist));
      }
    }
    return v;
  },
};

/** Frenar al enemigo con Destino: URGENCIA — cuanto más avanzado esté el rival hacia su victoria. */
const slowEnemyFate: IntentionDef = {
  id: IntentId.SLOW_ENEMY_FATE,
  name: 'Frenar al enemigo con Destino',
  polarity: -1,
  evaluate: (ctx: AIContext) => lerpCurve(ctx.oppProgress, [[0, 2], [40, 10], [70, 30], [90, 55]]),
};

/** Preparar victoria en 1-2 turnos: LOGRO — domina el turno cuando el objetivo está prácticamente
 *  resuelto, evita que otra intención "distraiga" a la IA cerca de la línea de meta. */
const prepareVictory: IntentionDef = {
  id: IntentId.PREPARE_VICTORY,
  name: 'Preparar victoria en 1-2 turnos',
  polarity: 1,
  evaluate: (ctx: AIContext) => lerpCurve(ctx.ownProgress, [[0, 0], [70, 0], [85, 60], [95, 150]]),
};

/** Desbloquear ubicaciones: URGENCIA — quedan ubicaciones propias bloqueadas. */
const unlockLocations: IntentionDef = {
  id: IntentId.UNLOCK_LOCATIONS,
  name: 'Desbloquear ubicaciones',
  polarity: -1,
  evaluate: (ctx: AIContext) => ctx.locations.filter(l => l.isLocked).length * 20,
};

/** Descartar mano muerta: URGENCIA — cartas muertas ocupando hueco. */
const discardDeadHand: IntentionDef = {
  id: IntentId.DISCARD_DEAD_HAND,
  name: 'Descartar mano muerta',
  polarity: -1,
  evaluate: (ctx: AIContext) => ctx.deadHandCardIds.length * 12,
};

export const universalIntentions: IntentionDef[] = [
  advanceObjective,
  eliminateHeroes,
  seekKeyCard,
  generatePower,
  prepareCombo,
  slowEnemyFate,
  prepareVictory,
  unlockLocations,
  discardDeadHand,
];

// Re-exportado para que actionScoring.ts pueda medir "sinergia con la mano" sin duplicar el
// filtro CardType.CONDITION en varios sitios.
export function handHasPlayableCard(ctx: AIContext): boolean {
  return ctx.player.handInstIds.some(id => ctx.state.allCards[id]?.cardType !== CardType.CONDITION);
}

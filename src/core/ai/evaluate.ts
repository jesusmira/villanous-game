import { ActionType, CardType } from '../types';
import type { GameState, PlayerId } from '../types';
import { getPlugin } from '../villains/registry';
import { EffectId } from '../villains/effectIds';
import { getPlayer, getEffectiveStrength } from '../engine/stateHelpers';

// ─── State evaluation for 1-ply lookahead ────────────────────────────────────────
// Cuanto más alto, mejor para `playerId`. Usado por la IA para elegir, entre las
// acciones posibles, la que deja el mejor estado resultante.
//
// La lógica propia de cada villano (objetivo de victoria, conciencia del rival, etc.)
// vive en `villains/<id>/ai.ts` y se expone aquí vía `plugin.aiHeuristics` — este
// archivo solo contiene heurística GENÉRICA, válida para cualquier villano.
const WEIGHTS = {
  // Poder/mano genérico: rendimientos decrecientes a partir del tope.
  POWER_CAP: 6,
  POWER_USEFUL: 0.55,           // cada moneda hasta el tope
  POWER_HOARD_PENALTY: 0.35,    // penaliza acaparar poder pasado el tope
  HAND_CARD: 0.15,              // opciones en mano (poco peso: no frena jugar)

  OWN_ALLY_STRENGTH: 0.8,       // desarrollo propio: incentiva jugar/cuidar aliados
  OWN_HERO_STRENGTH_PENALTY: 0.9, // héroes en TU reino tapan ranuras: penaliza tenerlos

  BURLA_HERO: -18,              // héroes con Burla bloquean TODOS los demás Vencer

  // Disrupción al rival (leve): cuánto vale estorbarle.
  OPP_LOC_COVERED: 10,          // por ubicación rival con al menos un héroe nuestro
  OPP_HERO_PRESENCE: 0.8,       // por cada héroe nuestro en el reino rival
  OPP_POWER_CAP: 10,
  OPP_POWER_PENALTY: 0.25,      // penaliza dejar acaparar poder al rival
};

// Items con acción extra permanente: Cañón (VANQUISH), Estuche (GAIN_POWER), Mecanismo (MOVE_HERO).
// El bonus VANQUISH vale más si la ubicación tiene héroes a los que aplicarlo.
const EXTRA_SLOT_BONUS = {
  VANQUISH_WITH_HERO: 10,
  VANQUISH_EMPTY: 4,
  GAIN_POWER: 3,
  MOVE_HERO: 4,
  OTHER: 2,
};

export function evaluateState(state: GameState, playerId: PlayerId): number {
  const p = getPlayer(state, playerId);
  const plugin = getPlugin(p.villainId);

  // Terminales.
  if (state.winner === playerId) return 1_000_000;
  if (state.winner && state.winner !== playerId) return -1_000_000;
  if (plugin.checkWinCondition(state, playerId)) return 1_000_000;

  // ── Poder/mano genérico: rendimientos decrecientes a partir del tope ──
  // Cada villano puede sumarle su propio bono o, si su condición de victoria lo exige
  // (p. ej. el Príncipe Juan, que necesita acumular poder sin tope), ignorarlo del todo.
  const genericPowerScore = Math.min(p.power, WEIGHTS.POWER_CAP) * WEIGHTS.POWER_USEFUL
    - Math.max(0, p.power - WEIGHTS.POWER_CAP) * WEIGHTS.POWER_HOARD_PENALTY
    + p.handInstIds.length * WEIGHTS.HAND_CARD;
  let v = plugin.aiHeuristics?.scoreState
    ? plugin.aiHeuristics.scoreState(state, p, genericPowerScore)
    : genericPowerScore;

  // ── Desarrollo propio: aliados en juego (incentiva jugar cartas y construir fuerza) ──
  const ownAllyStr = plugin.locations.reduce((sum, l) => {
    const ls = p.locationStates[l.id];
    return sum + ls.villainCardInstIds.reduce((t, id) => {
      const c = state.allCards[id];
      return c?.cardType === CardType.ALLY ? t + getEffectiveStrength(state, id) : t;
    }, 0);
  }, 0);
  v += ownAllyStr * WEIGHTS.OWN_ALLY_STRENGTH;

  // ── Héroes en TU reino estorban (tapan ranuras): retirarlos (Vencer) sube la nota.
  // El premio por vencer = quitar esta penalización; usar aliados mínimos lo hace rentable.
  const ownHeroStr = plugin.locations.reduce((sum, l) => {
    const ls = p.locationStates[l.id];
    return sum + ls.heroCardInstIds.reduce((t, id) => t + getEffectiveStrength(state, id), 0);
  }, 0);
  v -= ownHeroStr * WEIGHTS.OWN_HERO_STRENGTH_PENALTY;

  // Solo el primero de cada tipo de slot extra por ubicación aporta valor: duplicados no añaden
  // acciones útiles.
  const slotBonus = plugin.locations.reduce((sum, l) => {
    const ls = p.locationStates[l.id];
    const locHasHero = ls.heroCardInstIds.length > 0;
    const seenSlotTypes = new Set<ActionType>();
    return sum + ls.villainCardInstIds.reduce((t, id) => {
      const c = state.allCards[id];
      if (!c?.grantsActionSlot) return t;
      const slotType = c.grantsActionSlot.type;
      if (seenSlotTypes.has(slotType)) return t;
      seenSlotTypes.add(slotType);
      switch (slotType) {
        case ActionType.VANQUISH:
          return t + (locHasHero ? EXTRA_SLOT_BONUS.VANQUISH_WITH_HERO : EXTRA_SLOT_BONUS.VANQUISH_EMPTY);
        case ActionType.GAIN_POWER: return t + EXTRA_SLOT_BONUS.GAIN_POWER;
        case ActionType.MOVE_HERO:  return t + EXTRA_SLOT_BONUS.MOVE_HERO;
        default:                    return t + EXTRA_SLOT_BONUS.OTHER;
      }
    }, 0);
  }, 0);
  v += slotBonus;

  // ── Héroes con Burla: bloquean TODOS los demás Vencer → penalización extra urgente
  const burlaCount = plugin.locations.reduce((n, l) =>
    n + p.locationStates[l.id].heroCardInstIds.filter(id =>
      (state.allCards[id]?.attachedItemInstIds ?? []).some(
        itemId => state.allCards[itemId]?.effectIds.includes(EffectId.BURLA_ATTACH),
      ),
    ).length, 0,
  );
  v += burlaCount * WEIGHTS.BURLA_HERO;

  // ── Disrupción al rival (leve): héroes que le estorban y su poder ──
  const opp = state.players.find(pl => pl.id !== playerId);
  if (opp) {
    const oppPlugin = getPlugin(opp.villainId);
    const oppHeroes = oppPlugin.locations.reduce(
      (n, l) => n + (opp.locationStates[l.id]?.heroCardInstIds.length ?? 0), 0,
    );
    // Cubrir una ubicación nueva bloquea ranuras — vale más cuanto más cerca esté el rival de ganar.
    const oppLocsCovered = oppPlugin.locations.filter(
      l => (opp.locationStates[l.id]?.heroCardInstIds.length ?? 0) > 0,
    ).length;
    // Urgencia escalada: cada villano define cuánto crece su propia amenaza al acercarse a la victoria.
    const fateUrgency = oppPlugin.aiHeuristics?.threatUrgency?.(state, opp) ?? 1.0;
    v += oppLocsCovered * WEIGHTS.OPP_LOC_COVERED * fateUrgency;
    v += oppHeroes * WEIGHTS.OPP_HERO_PRESENCE;
    v -= Math.min(opp.power, WEIGHTS.OPP_POWER_CAP) * WEIGHTS.OPP_POWER_PENALTY;
  }

  return v;
}

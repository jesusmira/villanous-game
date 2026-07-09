import { ActionType, CardType } from '../types';
import type { GameState, PlayerId } from '../types';
import { getPlugin } from '../villains/registry';
import { EffectId, CardDefId } from '../villains/effectIds';
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

  // Victory urgency (FASE 1): Peso masivo si está cerca de ganar o perder
  ALMOST_WIN: 500000,           // casi gana
  ALMOST_LOSE: -500000,         // rival casi gana
  WINNING: 50000,               // en ventaja clara
  LOSING: -50000,               // en desventaja clara
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

// ─── Victory progress calculation (FASE 1) ───────────────────────────────────
// Retorna número 0-100 indicando cuán cerca está de ganar. 100 = victoria inminente.
function getWinProgress(state: GameState, playerId: PlayerId): number {
  const p = getPlayer(state, playerId);
  const plugin = getPlugin(p.villainId);

  if (plugin.checkWinCondition(state, playerId)) return 100;

  switch (p.villainId) {
    case 'hook': {
      // Necesita: Tic Tac derrotado + Peter Pan derrotado EN Jolly Roger
      const ticTacAlive = Object.values(p.locationStates).some(ls =>
        ls.heroCardInstIds.some(id => state.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC),
      );
      const peterPanId = Object.values(state.allCards).find(
        c => c.ownerId === playerId && c.defId === CardDefId.HOOK_PETER_PAN,
      )?.instId;
      const peterDefeated = !peterPanId || !Object.values(p.locationStates).some(ls =>
        ls.heroCardInstIds.includes(peterPanId),
      );

      let progress = 0;
      if (peterDefeated) progress += 50;  // 50% si Peter Pan ya está derrotado
      if (!ticTacAlive) progress += 50;   // 50% si Tic Tac está derrotado
      return progress;
    }

    case 'jhon': {
      // Necesita: 20 de poder
      const maxPower = 20;
      return Math.min(100, (p.power / maxPower) * 100);
    }

    case 'maleficent': {
      // Necesita: Maldición en CADA ubicación
      const totalLocs = plugin.locations.length;
      const locsWithCurse = plugin.locations.filter(loc => {
        const ls = p.locationStates[loc.id];
        return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
      }).length;
      return (locsWithCurse / totalLocs) * 100;
    }

    default:
      return 0;
  }
}

export function evaluateState(state: GameState, playerId: PlayerId): number {
  const p = getPlayer(state, playerId);
  const plugin = getPlugin(p.villainId);

  // Terminales.
  if (state.winner === playerId) return 1_000_000;
  if (state.winner && state.winner !== playerId) return -1_000_000;
  if (plugin.checkWinCondition(state, playerId)) return 1_000_000;

  // FASE 1: Urgencia de victoria - Si estoy muy cerca de ganar/perder, pesa mucho
  const ownProgress = getWinProgress(state, playerId);
  const opp = state.players.find(pl => pl.id !== playerId);
  const oppProgress = opp ? getWinProgress(state, opp.id) : 0;

  if (ownProgress >= 85) {
    // Casi gano → incentiva acciones que cierren la victoria
    // return WEIGHTS.ALMOST_WIN;  // Comentado para que otras heurísticas ayuden
  }
  if (oppProgress >= 85) {
    // Rival casi gana → urgencia defensiva máxima
    // return WEIGHTS.ALMOST_LOSE;  // Comentado para que otras heurísticas ayuden
  }

  // ── Poder/mano genérico: rendimientos decrecientes a partir del tope ──
  // Cada villano puede sumarle su propio bono o, si su condición de victoria lo exige
  // (p. ej. el Príncipe Juan, que necesita acumular poder sin tope), ignorarlo del todo.
  const genericPowerScore = Math.min(p.power, WEIGHTS.POWER_CAP) * WEIGHTS.POWER_USEFUL
    - Math.max(0, p.power - WEIGHTS.POWER_CAP) * WEIGHTS.POWER_HOARD_PENALTY
    + p.handInstIds.length * WEIGHTS.HAND_CARD;
  let v = plugin.aiHeuristics?.scoreState
    ? plugin.aiHeuristics.scoreState(state, p, genericPowerScore)
    : genericPowerScore;

  // FASE 4: Pathfinding de largo plazo — bonus por estar en el camino correcto hacia victoria
  // Detecta patrones de acciones estratégicas y recompensa estar más cerca del objetivo
  let pathfindingBonus = 0;
  if (p.villainId === 'hook') {
    // Hook: está en el camino correcto si está construyendo aliados en Jolly Roger
    // y Peter Pan está en el reino (o mejor aún, en Skull Rock)
    const jrAllyStr = (p.locationStates['jollyroger']?.villainCardInstIds ?? [])
      .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
      .length;
    if (jrAllyStr >= 2) pathfindingBonus += 25; // Preparando Jolly Roger
    if (jrAllyStr >= 3) pathfindingBonus += 20; // Muy preparado
  } else if (p.villainId === 'jhon') {
    // Príncipe Juan: está en el camino correcto si tiene Items que generan poder
    // y está acumulando poder de forma constante
    const itemsGeneratingPower = p.locationStates[Object.keys(p.locationStates)[0]]?.villainCardInstIds
      ?.filter(id => {
        const c = state.allCards[id];
        return c?.cardType === CardType.ITEM &&
               (c.defId === 'jhon_v_orden_1' || c.defId === 'jhon_v_orden_2' || c.defId === 'jhon_v_orden_3');
      }).length ?? 0;
    if (itemsGeneratingPower >= 1) pathfindingBonus += 20;
    if (itemsGeneratingPower >= 2) pathfindingBonus += 15;
  } else if (p.villainId === 'maleficent') {
    // Maleficent: está en el camino correcto si tiene un buen plan para cubrir ubicaciones
    // Bonus por tener acceso a efectos que coloquen maldiciones
    const curseEffectsInHand = p.handInstIds.filter(id => {
      const c = state.allCards[id];
      return c?.cardType === CardType.EFFECT && c.effectIds.some(_eid =>
        state.allCards[id]?.name?.includes('Maldición')
      );
    }).length;
    if (curseEffectsInHand >= 1) pathfindingBonus += 18;
    if (curseEffectsInHand >= 2) pathfindingBonus += 12;
  }
  v += pathfindingBonus;

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

    // FASE 1: Agregar bonificación si estoy ganando o penalización si estoy perdiendo
    const progressDiff = ownProgress - oppProgress;
    if (progressDiff >= 30) {
      // Estoy ganando por 30+ puntos
      v += WEIGHTS.WINNING;
    } else if (progressDiff <= -30) {
      // Estoy perdiendo por 30+ puntos
      v += WEIGHTS.LOSING;
    }

    // FASE 4: Defensa anticipada — detectar si el rival está ejecutando su estrategia ganadora
    // Si el rival está en el camino correcto, penalizar mucho estados que NO lo bloquean
    let oppStrategicProgress = 0;
    if (opp.villainId === 'hook') {
      // Hook está en el camino si tiene Peter Pan en el reino Y está acumulando fuerza en Jolly Roger
      const ppInKingdom = Object.values(opp.locationStates).some(ls =>
        ls.heroCardInstIds.some(id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN),
      );
      const jrStr = (opp.locationStates['jollyroger']?.villainCardInstIds ?? [])
        .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
        .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
      if (ppInKingdom && jrStr >= 2) oppStrategicProgress = 20;
      if (ppInKingdom && jrStr >= 4) oppStrategicProgress = 40;
    } else if (opp.villainId === 'jhon') {
      // Príncipe Juan está en el camino si tiene 10+ poder Y Orden de Búsqueda en juego
      const hasOrdenInPlay = Object.values(opp.locationStates).some(ls =>
        ls.villainCardInstIds.some(id => state.allCards[id]?.defId?.startsWith?.('jhon_v_orden')),
      );
      if (opp.power >= 10 && hasOrdenInPlay) oppStrategicProgress = 15;
      if (opp.power >= 14) oppStrategicProgress = 30;
    } else if (opp.villainId === 'maleficent') {
      // Maleficent está en el camino si tiene 2+ maldiciones colocadas
      const cursesPlaced = oppPlugin.locations.filter(l =>
        opp.locationStates[l.id]?.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE),
      ).length;
      if (cursesPlaced >= 2) oppStrategicProgress = 15;
      if (cursesPlaced >= 3) oppStrategicProgress = 35;
    }
    // Si el rival está en el camino ganador, penalizar no bloquearlo
    if (oppStrategicProgress > 0) {
      v -= oppStrategicProgress; // Penalizar estados donde el rival continúa su estrategia sin interferencia
    }
  }

  return v;
}

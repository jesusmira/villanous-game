import { CardType, ActionType } from '../types';
import type { GameState, PlayerId } from '../types';
import { getPlugin, getEffectDef } from '../villains/registry';
import { getPlayer, getEffectiveStrength } from '../engine/stateHelpers';
import { CardDefId, EffectId } from '../villains/effectIds';
import { HookLocationId, HookObjectiveStep } from '../villains/hook/cards';
import { locHasCurse } from './scoring';

// ─── State evaluation for 1-ply lookahead ────────────────────────────────────────
// Cuanto más alto, mejor para `playerId`. Usado por la IA para elegir, entre las
// acciones posibles, la que deja el mejor estado resultante.
export function evaluateState(state: GameState, playerId: PlayerId): number {
  const p = getPlayer(state, playerId);
  const plugin = getPlugin(p.villainId);

  // Terminales.
  if (state.winner === playerId) return 1_000_000;
  if (state.winner && state.winner !== playerId) return -1_000_000;
  if (plugin.checkWinCondition(state, playerId)) return 1_000_000;

  let v = 0;
  v += Math.min(p.power, 6) * 0.55;       // poder útil, tope bajo
  if (p.power > 6) v -= (p.power - 6) * 0.35; // penaliza acaparar desde 6
  v += p.handInstIds.length * 0.15;       // opciones en mano (poco peso: no frena jugar)

  // ── Maléfica: cubrir las 4 ubicaciones con maldición ──
  if (p.villainId === 'maleficent') {
    const covered = plugin.locations.filter(l => locHasCurse(state, p.locationStates[l.id])).length;
    v += covered * 30;
    // Maldición amenazada = héroe en esa ubicación que puede retirarla.
    // Penaliza fuerte para incentivar vencer en esas ubicaciones de forma urgente.
    for (const l of plugin.locations) {
      const ls = p.locationStates[l.id];
      if (locHasCurse(state, ls) && ls.heroCardInstIds.length > 0) v -= 12;
    }
  }

  // ── Garfio: desbloquear Árbol + traer y vencer a Peter Pan ──
  if (p.villainId === 'hook') {
    const steps = p.completedObjectiveSteps ?? [];
    if (steps.includes(HookObjectiveStep.HANGMAN_UNLOCKED)) v += 40;

    // Helper local — reutilizado varias veces abajo
    const heroHasBurla = (id: string) =>
      (state.allCards[id]?.attachedItemInstIds ?? []).some(
        itemId => state.allCards[itemId]?.effectIds.includes(EffectId.BURLA_ATTACH),
      );

    const hasBurlaHero = plugin.locations.some(l =>
      p.locationStates[l.id].heroCardInstIds.some(heroHasBurla),
    );
    const ticTacAlive = plugin.locations.some(l =>
      p.locationStates[l.id].heroCardInstIds.some(id =>
        state.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC,
      ),
    );
    if (ticTacAlive) v -= 22;
    const hasBlocker = hasBurlaHero || ticTacAlive;

    // ── Posicionamiento de aliados para vencer bloqueantes ──────────────────────
    // evaluateState da el MISMO valor a un aliado en JR que en Roca Calavera.
    // Sin este bonus, tryMoveItemAlly nunca mueve aliados hacia los bloqueantes
    // porque val == currentVal (no mejora). Con el bonus, co-ubicar aliados con
    // bloqueantes vale más → la IA los mueve anticipando el Vencer.
    if (hasBlocker) {
      for (const l of plugin.locations) {
        const ls = p.locationStates[l.id];
        // Fix C: separar Burla de Tic Tac para dar bonus mayor a aliados co-ubicados con Burla
        const burlaHere = ls.heroCardInstIds.filter(heroHasBurla);
        const ticTacHere = ls.heroCardInstIds.filter(
          id => !heroHasBurla(id) && state.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC,
        );
        const blockersHere = [...burlaHere, ...ticTacHere];
        if (blockersHere.length === 0) continue;
        const blockersStr = blockersHere.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
        const alliesHere = ls.villainCardInstIds.filter(id => state.allCards[id]?.cardType === CardType.ALLY);
        const allyStrHere = alliesHere.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
        const isBurlaLoc = burlaHere.length > 0;
        v += Math.min(allyStrHere, blockersStr) * (isBurlaLoc ? 1.5 : 1.8);
        if (allyStrHere >= blockersStr) v += isBurlaLoc ? 12 : 15;
        // Héroes con requiresMultiple (Niños Perdidos): bonus extra con 2+ aliados
        const needsMultiple = blockersHere.some(id =>
          state.allCards[id]?.effectIds.some(eid => getEffectDef(eid)?.requiresMultipleAlliesToVanquish),
        );
        if (needsMultiple && alliesHere.length >= 2 && allyStrHere >= blockersStr) v += 8;
      }
      // Pelotones en JR pueden vencer héroes en Roca Calavera (adyacente) sin moverse
      const jollyVIds = p.locationStates[HookLocationId.JOLLY_ROGER]?.villainCardInstIds ?? [];
      const pelotonsAtJR = jollyVIds.filter(id => {
        const a = state.allCards[id];
        return a?.cardType === CardType.ALLY && a.effectIds.includes(EffectId.PELOTON_ADJ_VANQUISH);
      });
      const burlaAtRoca = (p.locationStates[HookLocationId.SKULL_ROCK]?.heroCardInstIds ?? []).some(heroHasBurla);
      if (burlaAtRoca && pelotonsAtJR.length >= 2) {
        const ninosStr = (p.locationStates[HookLocationId.SKULL_ROCK]?.heroCardInstIds ?? [])
          .filter(heroHasBurla)
          .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
        const pelStr = pelotonsAtJR.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
        v += Math.min(pelStr, ninosStr) * 1.5;
        if (pelStr >= ninosStr) v += 12; // Pelotones listos para vencer en Roca (adj)
      }
    }

    // Héroes normales (no Burla, no TicTac): incentivar co-ubicación con aliados
    // para vencerlos y liberar ranuras aunque no sean bloqueantes de victoria.
    for (const l of plugin.locations) {
      const ls = p.locationStates[l.id];
      const normHeroes = ls.heroCardInstIds.filter(
        id => !heroHasBurla(id) && state.allCards[id]?.defId !== CardDefId.HOOK_TIC_TAC,
      );
      if (normHeroes.length === 0) continue;
      const heroStr = normHeroes.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
      const allyStr = ls.villainCardInstIds
        .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
        .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
      v += Math.min(allyStr, heroStr) * 1.0;
      if (allyStr >= heroStr && heroStr > 0) v += 6;
    }

    // Penalización por ranuras bloqueadas: 1+ héroe = 2 primeros slots inaccesibles.
    // Los valores reflejan el coste real de perder cada tipo de acción para Garfio.
    const slotDmg = (type: ActionType): number => {
      switch (type) {
        case ActionType.PLAY_CARD:      return 9;
        case ActionType.VANQUISH:       return 8;
        case ActionType.GAIN_POWER:     return 5;
        case ActionType.MOVE_HERO:      return 5;
        case ActionType.FATE:           return 4;
        case ActionType.MOVE_ITEM_ALLY: return 4;
        case ActionType.DISCARD:        return 2;
        default:                        return 3;
      }
    };
    for (const l of plugin.locations) {
      const ls = p.locationStates[l.id];
      if (ls.heroCardInstIds.length === 0) continue;
      const blocked = Math.min(2, l.actions.length);
      for (let i = 0; i < blocked; i++) {
        v -= slotDmg(l.actions[i].type);
      }
    }

    let ppId: string | undefined;
    let ppLoc: string | undefined;
    for (const [locId, ls] of Object.entries(p.locationStates)) {
      const found = ls.heroCardInstIds.find(id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN);
      if (found) { ppId = found; ppLoc = locId; break; }
    }
    if (ppId && ppLoc) {
      v += 15;
      // Fix: bonus de proximidad de PP siempre activo (con o sin bloqueantes).
      // Mover PP del Árbol a la Laguna, de la Laguna a Roca, vale algo aunque Burla siga viva.
      const ppDistToJR = ppLoc === HookLocationId.JOLLY_ROGER ? 0
        : ppLoc === HookLocationId.SKULL_ROCK ? 1
        : ppLoc === HookLocationId.LAGOON ? 2
        : 3; // hangman u otro
      if (ppDistToJR > 0) v += (4 - ppDistToJR) * 3; // +9 Roca, +6 Laguna, +3 Árbol
      // Con bloqueantes vivos, acumular aliados en JR para PP no avanza hacia la victoria
      if (!hasBlocker) {
        const ppStr = getEffectiveStrength(state, ppId);
        const jollyLocDef = plugin.locations.find(l => l.id === HookLocationId.JOLLY_ROGER);
        const sameAllies = (p.locationStates[HookLocationId.JOLLY_ROGER]?.villainCardInstIds ?? [])
          .filter(id => state.allCards[id]?.cardType === CardType.ALLY);
        const adjAllies = (jollyLocDef?.adjacentIds ?? []).flatMap(adjId =>
          (p.locationStates[adjId]?.villainCardInstIds ?? []).filter(id => {
            const a = state.allCards[id];
            return a?.cardType === CardType.ALLY && a.effectIds.includes(EffectId.PELOTON_ADJ_VANQUISH);
          }),
        );
        const allyStr = [...sameAllies, ...adjAllies].reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
        v += Math.min(allyStr, ppStr) * 1.5;
        if (ppStr > 0 && allyStr >= ppStr) v += 25;
        if (ppLoc === HookLocationId.JOLLY_ROGER) v += 12;
      }
    }

    // Rival Digno y Susto solo sirven para encontrar a PP en el mazo de Destino.
    // Si PP ya está en el reino, son cartas muertas → penalizar tenerlas en mano.
    if (ppId) {
      const deadCount = p.handInstIds.filter(id => {
        const c = state.allCards[id];
        return c?.defId.startsWith('hook_v_rival') || c?.defId.startsWith('hook_v_susto');
      }).length;
      v -= deadCount * 2.5;
    }

    // Condiciones muertas: Perspicaz y Obsesión no aportan si su trigger no puede disparar.
    // Penalizarlas hace que tryDiscard las elimine proactivamente para liberar espacio en mano.
    const oppForCond = state.players.find(pl => pl.id !== playerId);
    if (oppForCond) {
      // Perspicaz: "si otro jugador tiene un Aliado de F4+"
      const oppHasF4Ally = Object.values(oppForCond.locationStates).some(ls =>
        ls.villainCardInstIds.some(id => {
          const c = state.allCards[id];
          return c?.cardType === CardType.ALLY && getEffectiveStrength(state, id) >= 4;
        }),
      );
      const perspicazCount = p.handInstIds.filter(id =>
        state.allCards[id]?.defId.startsWith('hook_v_perspicaz'),
      ).length;
      if (!oppHasF4Ally && perspicazCount > 0) v -= perspicazCount * 2.5;

      // Obsesión: "cuando otro jugador derrote un Héroe de F4+"
      // Muerta si el oponente no tiene héroes F4+ en su reino que se puedan vencer.
      const oppHasF4Hero = Object.values(oppForCond.locationStates).some(ls =>
        ls.heroCardInstIds.some(id => getEffectiveStrength(state, id) >= 4),
      );
      const obsesionCount = p.handInstIds.filter(id =>
        state.allCards[id]?.defId.startsWith('hook_v_obsesion'),
      ).length;
      if (!oppHasF4Hero && obsesionCount > 0) v -= obsesionCount * 2.5;
    }
  }

  // ── Desarrollo propio: aliados en juego (incentiva jugar cartas y construir fuerza) ──
  const ownAllyStr = plugin.locations.reduce((sum, l) => {
    const ls = p.locationStates[l.id];
    return sum + ls.villainCardInstIds.reduce((t, id) => {
      const c = state.allCards[id];
      return c?.cardType === CardType.ALLY ? t + getEffectiveStrength(state, id) : t;
    }, 0);
  }, 0);
  v += ownAllyStr * 0.8;

  // ── Héroes en TU reino estorban (tapan ranuras): retirarlos (Vencer) sube la nota.
  // El premio por vencer = quitar esta penalización; usar aliados mínimos lo hace rentable.
  const ownHeroStr = plugin.locations.reduce((sum, l) => {
    const ls = p.locationStates[l.id];
    return sum + ls.heroCardInstIds.reduce((t, id) => t + getEffectiveStrength(state, id), 0);
  }, 0);
  v -= ownHeroStr * 0.9;

  // Items con acción extra permanente: Cañón (VANQUISH), Estuche (GAIN_POWER), Mecanismo (MOVE_HERO).
  // Solo el primero de cada tipo por ubicación aporta valor: duplicados no añaden acciones útiles.
  // El bonus VANQUISH se evalúa por ubicación: vale más si ESA ubicación tiene héroes.
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
        case ActionType.VANQUISH:   return t + (locHasHero ? 10 : 4);
        case ActionType.GAIN_POWER: return t + 3;
        case ActionType.MOVE_HERO:  return t + 4;
        default:                    return t + 2;
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
  v -= burlaCount * 18;

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
    // Urgencia escalada: multiplicador crece según proximidad a victoria del rival.
    let fateUrgency = 1.0;
    if (opp.villainId === 'maleficent') {
      const oppCurses = oppPlugin.locations.filter(l => locHasCurse(state, opp.locationStates[l.id])).length;
      if (oppCurses >= 3) fateUrgency = 7.0;    // una maldición más = derrota inminente
      else if (oppCurses >= 2) fateUrgency = 3.0;
      else if (oppCurses >= 1) fateUrgency = 1.5;
    }
    if (opp.villainId === 'hook') {
      const oppHookSteps = opp.completedObjectiveSteps ?? [];
      const oppPPAtJolly = opp.locationStates[HookLocationId.JOLLY_ROGER]?.heroCardInstIds.some(
        id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN,
      );
      if (oppPPAtJolly) fateUrgency = 6.0;
      else if (oppHookSteps.includes(HookObjectiveStep.HANGMAN_UNLOCKED)) fateUrgency = 3.5;
      else fateUrgency = 1.8; // Garfio siempre merece presión, no solo al final
    }
    v += oppLocsCovered * 10 * fateUrgency;
    v += oppHeroes * 0.8;
    v -= Math.min(opp.power, 10) * 0.25;

    // ── Para Maléfica: conciencia del avance de Garfio ──
    if (p.villainId === 'maleficent' && opp.villainId === 'hook') {
      const hookPlugin = getPlugin(opp.villainId);
      const hookSteps = opp.completedObjectiveSteps ?? [];
      // Árbol del Ahorcado desbloqueado: Garfio en fase final.
      if (hookSteps.includes(HookObjectiveStep.HANGMAN_UNLOCKED)) v -= 30;
      // Peter Pan en el reino de Garfio.
      let ppInstId: string | undefined;
      let ppLoc: string | undefined;
      for (const [locId, ls] of Object.entries(opp.locationStates)) {
        const found = ls.heroCardInstIds.find(id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN);
        if (found) { ppInstId = found; ppLoc = locId; break; }
      }
      if (ppInstId && ppLoc) {
        v -= 12;
        const ppStr = getEffectiveStrength(state, ppInstId);
        const locDef = hookPlugin.locations.find(l => l.id === ppLoc);
        const sameAllies = (opp.locationStates[ppLoc]?.villainCardInstIds ?? []).filter(
          id => state.allCards[id]?.cardType === CardType.ALLY,
        );
        const adjAllies = (locDef?.adjacentIds ?? []).flatMap(adjId =>
          (opp.locationStates[adjId]?.villainCardInstIds ?? []).filter(id => {
            const a = state.allCards[id];
            return a?.cardType === CardType.ALLY && a.effectIds.includes(EffectId.PELOTON_ADJ_VANQUISH);
          }),
        );
        const allyStr = [...sameAllies, ...adjAllies].reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
        if (allyStr >= ppStr) v -= 20; // Garfio listo para vencer: urgencia máxima.
        if (ppLoc === HookLocationId.JOLLY_ROGER) v -= 8;
      }
    }

    // ── Para Garfio: conciencia del avance de Maléfica ──
    if (p.villainId === 'hook' && opp.villainId === 'maleficent') {
      const malPlugin = getPlugin(opp.villainId);
      // Cada maldición en pie acerca la victoria de Maléfica — penalizar fuerte.
      const cursesInPlay = malPlugin.locations.filter(
        l => locHasCurse(state, opp.locationStates[l.id]),
      ).length;
      v -= cursesInPlay * 10;
      // Héroe en la ubicación del peón rival bloquea sus acciones actuales — muy disruptivo.
      if ((opp.locationStates[opp.pawnLocationId]?.heroCardInstIds.length ?? 0) > 0) {
        v += 12;
      }
      // Héroes en ubicaciones SIN maldición son especialmente valiosos:
      // bloquean ranuras de acción y retrasan/impiden colocar la maldición allí.
      for (const l of malPlugin.locations) {
        const ls = opp.locationStates[l.id];
        if (ls.heroCardInstIds.length === 0) continue;
        if (!locHasCurse(state, ls)) {
          v += 12 + ls.heroCardInstIds.length * 4; // sin maldición → muy disruptivo
        } else {
          v += 5; // con maldición → bloquea ranuras, menos crítico
        }
      }
    }
  }

  return v;
}

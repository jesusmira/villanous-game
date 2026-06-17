import { ActionType, CardType } from '../types';
import type { GameState, PlayerState, LocationState, CardInstId, LocationId } from '../types';
import { getPlugin, getEffectDef } from '../villains/registry';
import { CardDefId, CardDefPrefix, EffectId } from '../villains/effectIds';
import { HookLocationId } from '../villains/hook/cards';
import { heroHasBurla, findPeterPan, isPeterPanAtJollyRoger } from '../villains/hook/aiHelpers';
import { getEffectiveStrength } from '../engine/stateHelpers';
import { getAvailableSlotIndices, getActionAtSlot } from '../engine/slotHelpers';

// ─── Maleficent curse helpers ───────────────────────────────────────────────────
export function locHasCurse(state: GameState, ls: LocationState): boolean {
  return ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE);
}
function locHasSueno(state: GameState, ls: LocationState): boolean {
  return ls.villainCardInstIds.some(id => state.allCards[id]?.defId.startsWith(CardDefPrefix.MAL_SUENO));
}
function locHasFuego(state: GameState, ls: LocationState): boolean {
  return ls.villainCardInstIds.some(id => state.allCards[id]?.defId.startsWith(CardDefPrefix.MAL_FUEGO));
}
function countUncovered(state: GameState, player: PlayerState): number {
  return Object.values(player.locationStates).filter(ls => !locHasCurse(state, ls)).length;
}

export function scoreLocation(
  state: GameState,
  player: PlayerState,
  locId: LocationId,
  // Inyectable para que los tests puedan fijar el desempate y obtener un resultado reproducible;
  // en partidas reales usa Math.random() (variedad real entre turnos/partidas).
  rng: () => number = Math.random,
): number {
  const plugin = getPlugin(player.villainId);
  const loc = plugin.locations.find(l => l.id === locId);
  if (!loc) return 0;
  const locState = player.locationStates[locId];
  if (locState.isLocked) return -100;
  if (locId === player.pawnLocationId) return -100;

  let score = 0;
  const available = getAvailableSlotIndices(state, player.id, locId);

  for (const idx of available) {
    const slot = getActionAtSlot(state, player.id, idx);
    if (!slot) continue;
    switch (slot.type) {
      case ActionType.GAIN_POWER: {
        const base = slot.value ?? 2;
        // Rendimientos decrecientes: penaliza acaparar poder antes (tope 6 en evaluate).
        const p = player.power;
        const scale = p >= 8 ? 0.15 : p >= 5 ? 0.4 : p >= 3 ? 0.7 : 1;
        score += base * scale;
        break;
      }
      case ActionType.PLAY_CARD:
        score += player.handInstIds.length > 0 ? 3 : 1;
        if (player.villainId === 'maleficent') {
          const hasCurseInHand = player.handInstIds.some(
            id => state.allCards[id]?.cardType === CardType.CURSE,
          );
          // Cubrir una ubicación SIN maldición es la prioridad; urgente al final (3/4).
          if (hasCurseInHand && !locHasCurse(state, locState)) {
            const uncovered = countUncovered(state, player);
            score += 8 + (uncovered <= 2 ? 6 : 0);
          }
        }
        break;
      case ActionType.VANQUISH: {
        const heroes = Object.values(player.locationStates).flatMap(ls => ls.heroCardInstIds);
        if (heroes.length > 0) {
          // Comprobar si hay al menos un héroe que pueda vencerse con los aliados actuales.
          // Sin esto el VANQUISH infla el score aunque sea imposible ejecutarlo.
          const canActuallyVanquish = heroes.some(heroId => {
            const heroLoc = state.allCards[heroId]?.locationId;
            if (!heroLoc) return false;
            const heroLocDef = plugin.locations.find(l => l.id === heroLoc);
            const sameAllies = (player.locationStates[heroLoc]?.villainCardInstIds ?? []).filter(
              id => state.allCards[id]?.cardType === CardType.ALLY,
            );
            const adjAllies = (heroLocDef?.adjacentIds ?? []).flatMap(adjId =>
              (player.locationStates[adjId]?.villainCardInstIds ?? []).filter(id => {
                const a = state.allCards[id];
                return a?.cardType === CardType.ALLY && a.effectIds.includes(EffectId.PELOTON_ADJ_VANQUISH);
              }),
            );
            const totalStr = [...sameAllies, ...adjAllies].reduce(
              (sum, id) => sum + getEffectiveStrength(state, id), 0,
            );
            const heroStr = getEffectiveStrength(state, heroId);
            const needsMultiple = (state.allCards[heroId]?.effectIds ?? []).some(
              id => getEffectDef(id)?.requiresMultipleAlliesToVanquish,
            );
            return totalStr >= heroStr && (!needsMultiple || (sameAllies.length + adjAllies.length) >= 2);
          });
          const strongHeroes = heroes.filter(id => (state.allCards[id]?.baseStrength ?? 0) >= 4);
          const baseVanquishScore = 4 + (strongHeroes.length * 2) + heroes.length;
          score += canActuallyVanquish ? baseVanquishScore : Math.ceil(baseVanquishScore * 0.25);
        }
        // Fix F: cuantos más héroes haya en el reino, más urgente es vencer alguno (ranuras bloqueadas)
        if (heroes.length > 3) score += (heroes.length - 3) * 4;
        if (player.villainId === 'hook' && isPeterPanAtJollyRoger(state, player)) {
          score += 20;
        }
        if (player.villainId === 'maleficent') {
          // Defender maldiciones: matar héroes en ubicaciones con maldición.
          const heroAtCurseLoc = Object.values(player.locationStates).some(
            ls => ls.heroCardInstIds.length > 0 && locHasCurse(state, ls),
          );
          if (heroAtCurseLoc) score += 6;
          // Vencer al héroe que bloquea la ÚLTIMA ubicación sin maldición es la prioridad
          // máxima: sin él, Maléfica no puede ganar aunque tenga maldiciones de sobra en mano.
          const heroBlockingUncovered = Object.values(player.locationStates).some(ls =>
            !locHasCurse(state, ls) && ls.heroCardInstIds.some(id =>
              state.allCards[id]?.effectIds.some(effId => getEffectDef(effId)?.blocksCursePlay),
            ),
          );
          if (heroBlockingUncovered) score += 14;
        }
        break;
      }
      case ActionType.FATE: {
        const opponent = state.players.find(p => p.id !== player.id);
        const opponentProgress = Object.values(player.locationStates).flatMap(ls => ls.villainCardInstIds).length;
        let fateBonus = (opponent?.power ?? 0) > player.power + 3 ? 4 : opponentProgress > 3 ? 3 : 2;
        if (player.villainId === 'hook') {
          // Fate vale mucho mientras haya ubicaciones del rival sin héroe.
          const oppPlayer = state.players.find(p => p.id !== player.id);
          if (oppPlayer) {
            const oppPlugin = getPlugin(oppPlayer.villainId);
            const uncoveredOppLocs = oppPlugin.locations.filter(
              l => (oppPlayer.locationStates[l.id]?.heroCardInstIds.length ?? 0) === 0,
            ).length;
            fateBonus = uncoveredOppLocs > 0 ? Math.max(fateBonus, 8) : Math.min(fateBonus, 3);
          } else {
            fateBonus = Math.max(fateBonus, 8);
          }
        }
        // Maléfica: Destino sigue siendo secundario pero no ignorable.
        // Cuantas menos perturbaciones tenga Garfio, más vale usarlo.
        if (player.villainId === 'maleficent') {
          const oppPlayer = state.players.find(p => p.id !== player.id);
          if (oppPlayer) {
            const oppPlugin = getPlugin(oppPlayer.villainId);
            const alreadyDisrupted = oppPlugin.locations.filter(
              l => (oppPlayer.locationStates[l.id]?.heroCardInstIds.length ?? 0) > 0,
            ).length;
            fateBonus = alreadyDisrupted <= 1 ? Math.max(fateBonus, 5)
                      : alreadyDisrupted <= 2 ? Math.max(fateBonus, 3)
                      : Math.min(fateBonus, 2);
          } else {
            fateBonus = Math.max(fateBonus, 4);
          }
        }
        score += fateBonus;
        break;
      }
      case ActionType.MOVE_ITEM_ALLY:
        score += 2;
        break;
      case ActionType.MOVE_HERO:
        if (player.villainId === 'hook') {
          if (findPeterPan(state, player)) score += 10;
          const hasBurlaBlocker = Object.values(player.locationStates).some(ls =>
            ls.heroCardInstIds.some(id => heroHasBurla(state, id)),
          );
          if (hasBurlaBlocker) score += 10;
        }
        break;
      case ActionType.ACTIVATE_CARD:
        score += 2;
        break;
      case ActionType.DISCARD:
        score += 1;
        break;
    }
  }
  // Maléfica: NO mover el peón a una ubicación con su propio Fuego Verde (lo descarta).
  if (player.villainId === 'maleficent' && locHasFuego(state, locState)) {
    score -= 25;
  }
  // Fix A: Garfio → ir a la ubicación de Tic Tac descarta toda la mano. Penalizar según tamaño de mano.
  if (player.villainId === 'hook') {
    const ticTacHere = locState.heroCardInstIds.some(
      id => state.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC,
    );
    if (ticTacHere) score -= 8 + player.handInstIds.length * 3;
  }

  // Ruido pequeño para desempatar sin tapar la señal real.
  score += rng() * 0.6 - 0.3;

  return score;
}

export function pickBestPlayTarget(
  state: GameState,
  player: PlayerState,
  cardInstId: CardInstId,
  // Mismo motivo que en scoreLocation(): inyectable para tests deterministas.
  rng: () => number = Math.random,
): LocationId {
  const plugin = getPlugin(player.villainId);
  const card = state.allCards[cardInstId];

  if (card.cardType === CardType.CURSE) {
    // Evalúa todas las ubicaciones válidas con puntuación táctica + ruido
    const candidates = plugin.locations
      .filter(loc => {
        const ls = player.locationStates[loc.id];
        if (ls.isLocked) return false;
        if (ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.CURSE)) return false;
        return !ls.heroCardInstIds.some(id =>
          state.allCards[id]?.effectIds.some(effId => getEffectDef(effId)?.blocksCursePlay),
        );
      })
      .map(loc => {
        const ls = player.locationStates[loc.id];
        let score = 0;
        // Fuego Verde: preferir ubicaciones con más acciones disponibles (más valioso bloquear)
        if (card.defId.startsWith(CardDefPrefix.MAL_FUEGO)) {
          score += loc.actions.length * 2;
        }
        // Sueño Sin Sueños: preferir ubicaciones donde ya hay héroes o muchas acciones
        if (card.defId.startsWith(CardDefPrefix.MAL_SUENO)) {
          score += ls.heroCardInstIds.length * 3;
          score += loc.actions.length;
        }
        // Selva: preferir ubicaciones con muchas acciones (más tráfico de héroes)
        if (card.defId.startsWith(CardDefPrefix.MAL_SELVA)) {
          score += loc.actions.length * 1.5;
        }
        // Preferir ubicaciones sin héroes (más seguras para la maldición)
        score -= ls.heroCardInstIds.length;
        // Ruido alto para asegurar variedad entre partidas
        score += rng() * 4 - 2;
        return { locId: loc.id, score };
      });

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0].locId;
    }
  }

  if (card.cardType === CardType.ALLY) {
    if (player.villainId === 'maleficent') {
      // Maléfica: NUNCA un aliado sobre Sueño Sin Sueños (lo descartaría).
      // Prioridad 1: ubicación SIN maldición bloqueada por un héroe (Primavera y similares) que
      // aún no tiene aliados suficientes — es lo único que impide cubrirla y ganar.
      // Prioridad 2: defender una ubicación que ya tiene maldición.
      const candidates = plugin.locations
        .filter(loc => {
          const ls = player.locationStates[loc.id];
          return !ls.isLocked && !locHasSueno(state, ls);
        })
        .map(loc => {
          const ls = player.locationStates[loc.id];
          let score = ls.heroCardInstIds.length * 2;
          if (locHasCurse(state, ls)) {
            score += 3; // defender la maldición
          } else {
            const blockedByHero = ls.heroCardInstIds.some(id =>
              state.allCards[id]?.effectIds.some(effId => getEffectDef(effId)?.blocksCursePlay),
            );
            if (blockedByHero) {
              const heroStr = ls.heroCardInstIds.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
              const allyStr = ls.villainCardInstIds
                .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
                .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
              // Mientras no se haya juntado fuerza suficiente, vale más que defender una
              // maldición ya puesta: sin esto, los aliados nunca se acumulan aquí.
              if (allyStr < heroStr) score += 20 + heroStr;
            }
          }
          score -= ls.villainCardInstIds.length;
          score += rng() * 1.2 - 0.6;
          return { locId: loc.id, score };
        });
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0].locId;
      }
    } else {
      // Garfio: routing de aliados según bloqueantes. Burla primero (prerrequisito), luego Tic Tac, luego JR.
      const burlaHeroLocs = plugin.locations
        .filter(l => player.locationStates[l.id].heroCardInstIds.some(id => heroHasBurla(state, id)))
        .map(l => l.id);
      const hasTicTac = plugin.locations.some(l =>
        player.locationStates[l.id].heroCardInstIds.some(
          id => !heroHasBurla(state, id) && state.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC,
        ),
      );

      const candidates = plugin.locations
        .filter(loc => !player.locationStates[loc.id]?.isLocked)
        .map(loc => {
          const ls = player.locationStates[loc.id];
          let score = 0;

          if (burlaHeroLocs.length > 0) {
            // Burla existe: prioridad absoluta. Enviar aliados a la ubicación del héroe con Burla.
            if (burlaHeroLocs.includes(loc.id)) {
              score += 30;
            } else {
              const locDef = plugin.locations.find(l => l.id === loc.id);
              if (locDef?.adjacentIds.some(a => burlaHeroLocs.includes(a))) score += 15;
            }
          } else if (hasTicTac) {
            // Tic Tac vivo: enviar aliados a su ubicación para vencerlo
            const ticTacHeroes = ls.heroCardInstIds.filter(
              id => state.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC,
            );
            if (ticTacHeroes.length > 0) {
              score += 10 + ticTacHeroes.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
            } else if (loc.id === HookLocationId.JOLLY_ROGER) {
              score += 5;
            }
          } else {
            // Sin Burla ni Tic Tac: limpiar héroes no-PP primero, luego JR para Peter Pan
            const nonPPHeroes = ls.heroCardInstIds.filter(
              id => state.allCards[id]?.defId !== CardDefId.HOOK_PETER_PAN,
            );
            if (nonPPHeroes.length > 0) {
              const heroStr = nonPPHeroes.reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
              const allyStr = ls.villainCardInstIds
                .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
                .reduce((sum, id) => sum + getEffectiveStrength(state, id), 0);
              if (allyStr < heroStr) score += 10 + heroStr;
            }
            if (loc.id === HookLocationId.JOLLY_ROGER) score += 10;
            else if (loc.id === HookLocationId.SKULL_ROCK) score += 3;
          }

          score -= ls.villainCardInstIds.filter(id => state.allCards[id]?.cardType === CardType.ALLY).length * 2;
          score += rng() * 2 - 1;
          return { locId: loc.id, score };
        });
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0].locId;
      }
    }
  }

  if (card.cardType === CardType.HERO) {
    // Distribuir héroes usando scoreLocation en lugar de siempre el peón
    const scores = plugin.locations.map(loc => ({
      locId: loc.id,
      score: scoreLocation(state, player, loc.id, rng),
    }));
    scores.sort((a, b) => b.score - a.score);
    return scores[0].locId;
  }

  // Ítems que requieren adjuntarse a un Aliado: redirigir a la ubicación con el aliado más débil
  // (el que más se beneficia del +2). Sin esto el ítem se juega sin adjuntar y no aporta nada.
  if (card.cardType === CardType.ITEM) {
    const reqTarget = card.effectIds.map(id => getEffectDef(id)?.requiresTargetCard).find(Boolean);
    if (reqTarget === 'ALLY') {
      const allyLocs = plugin.locations
        .filter(loc => !player.locationStates[loc.id]?.isLocked)
        .flatMap(loc =>
          player.locationStates[loc.id].villainCardInstIds
            .filter(id => state.allCards[id]?.cardType === CardType.ALLY)
            .map(id => ({ locId: loc.id, str: getEffectiveStrength(state, id) })),
        );
      if (allyLocs.length > 0) {
        // Preferir el aliado con MENOR fuerza actual (el que más gana del +2)
        allyLocs.sort((a, b) => a.str - b.str);
        return allyLocs[0].locId;
      }
      // Sin aliados en el reino: no es buen momento para jugar este ítem
    }
  }

  // Garfio ítems con grantsActionSlot: Cañón (VANQUISH extra) no debe ir a JR (ya lo tiene).
  // Preferir Skullrock o Lagoon; evitar Lagoon si Tic Tac está allí (descarta mano).
  if (player.villainId === 'hook' && card.grantsActionSlot != null) {
    if (card.grantsActionSlot.type === ActionType.VANQUISH) {
      const candidates = plugin.locations
        .filter(loc => !player.locationStates[loc.id]?.isLocked && loc.id !== HookLocationId.JOLLY_ROGER)
        .map(loc => {
          const ls = player.locationStates[loc.id];
          let sc = 0;
          if (ls.heroCardInstIds.some(id => state.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC)) sc -= 8;
          sc += ls.villainCardInstIds.filter(id => state.allCards[id]?.cardType === CardType.ALLY).length * 3;
          sc += ls.heroCardInstIds.filter(
            id => heroHasBurla(state, id) || state.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC,
          ).length * 4;
          if (loc.id === HookLocationId.SKULL_ROCK) sc += 2;
          return { locId: loc.id, sc };
        });
      candidates.sort((a, b) => b.sc - a.sc);
      if (candidates.length > 0) return candidates[0].locId;
    }
  }

  const pawnLoc = player.locationStates[player.pawnLocationId];
  // Maléfica: si va a jugar un aliado y el peón está sobre Sueño, no lo descartes.
  if (player.villainId === 'maleficent' && card.cardType === CardType.ALLY && pawnLoc && locHasSueno(state, pawnLoc)) {
    const safe = plugin.locations.find(l => {
      const ls = player.locationStates[l.id];
      return !ls.isLocked && !locHasSueno(state, ls);
    });
    if (safe) return safe.id;
  }
  if (!pawnLoc?.isLocked) return player.pawnLocationId;
  return plugin.locations.find(l => !player.locationStates[l.id]?.isLocked)?.id
    ?? plugin.locations[0].id;
}

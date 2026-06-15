import { ActionType, CardType, TurnPhase } from '../types';
import type { GameState, CardInstId, LocationId, PlayerId } from '../types';
import { getPlugin, getEffectDef } from '../villains/registry';
import { EffectId, CardDefId } from '../villains/effectIds';
import { HookLocationId } from '../villains/hook/cards';
import { getPlayer, getEffectiveStrength, computeKingdomCostMod } from '../engine/stateHelpers';
import { getAvailableSlotIndices, getActionAtSlot } from '../engine/slotHelpers';
import {
  canPlayCard, canVanquish, canMoveItemAlly,
  canMoveHero, canFate, canActivateCard, canDiscard,
} from '../engine/RuleEngine';
import {
  movePawn, skipMove, gainPower, playCard, vanquish, moveItemAlly,
  moveHero, startFate, resolveFate, activateCard, discardFromHand,
  endActivatePhase, drawCards, activateRaven,
} from '../engine/GameEngine';
import { resolveCuervo } from '../engine/PendingStateResolver';
import { scoreLocation, pickBestPlayTarget, locHasCurse } from './scoring';
import { evaluateState } from './evaluate';
import { buildPlayCtx } from './contextBuilder';

// ─── AI TURN EXECUTION ────────────────────────────────────────────────────────

export function runAITurn(state: GameState): GameState[] {
  const steps: GameState[] = [];
  let s = state;
  const playerId = s.players[s.currentPlayerIndex].id;

  // RAVEN — Maléfica puede mover el Cuervo ANTES de mover el peón (una vez por turno).
  if (s.turnPhase === TurnPhase.MOVE) {
    const player0 = getPlayer(s, playerId);
    if (!player0.ravenUsedThisTurn) {
      const ravenId = Object.values(s.allCards).find(
        c => c.ownerId === playerId && c.effectIds.includes(EffectId.RAVEN_ACTIVATE) && c.locationId,
      )?.instId;
      if (ravenId) {
        const plugin0 = getPlugin(player0.villainId);
        const openLocs = plugin0.locations.filter(l => !player0.locationStates[l.id]?.isLocked);
        let bestRavenDest: LocationId | undefined;
        let bestRavenVal = evaluateState(s, playerId); // solo mover si mejora
        for (const loc of openLocs) {
          const afterRaven = activateRaven(s, playerId, ravenId, loc.id);
          // Auto-resolver el pendingCuervo para ver el efecto completo.
          const resolved = afterRaven.pendingCuervo
            ? (() => { const { action, params } = chooseCuervoAction(afterRaven); return resolveCuervo(afterRaven, action, params); })()
            : afterRaven;
          const val = evaluateState(playOutActivate(movePawn(resolved, playerId, player0.pawnLocationId === loc.id ? openLocs.find(l => l.id !== player0.pawnLocationId)?.id ?? loc.id : player0.pawnLocationId), playerId), playerId);
          if (val > bestRavenVal) { bestRavenVal = val; bestRavenDest = loc.id; }
        }
        if (bestRavenDest) {
          s = activateRaven(s, playerId, ravenId, bestRavenDest);
          if (s.pendingCuervo) {
            const { action, params } = chooseCuervoAction(s);
            s = resolveCuervo(s, action, params);
          }
          steps.push(s);
        }
      }
    }
  }

  // MOVE phase — lookahead profundidad-2: simula el TURNO COMPLETO en cada destino
  // y se mueve al que deja el mejor estado final (piensa qué podrá hacer allí).
  if (s.turnPhase === TurnPhase.MOVE) {
    const player = getPlayer(s, playerId);
    if (player.skipNextMove) {
      s = skipMove(s, playerId);
    } else {
      const plugin = getPlugin(player.villainId);
      const dests = plugin.locations
        .filter(loc => loc.id !== player.pawnLocationId && !player.locationStates[loc.id]?.isLocked);

      if (dests.length > 0) {
        s = movePawn(s, playerId, minimaxBestDest(s, playerId));
      }
    }
    steps.push(s);
  }

  if (s.turnPhase !== TurnPhase.ACTIVATE) {
    if (s.turnPhase === TurnPhase.DRAW) { s = drawCards(s, playerId); steps.push(s); }
    return steps;
  }

  // ACTIVATE phase (real) — mismo razonamiento que el rollout, registrando pasos.
  s = playOutActivate(s, playerId, steps);

  // DRAW phase
  if (s.turnPhase === TurnPhase.ACTIVATE) s = endActivatePhase(s);
  if (s.turnPhase === TurnPhase.DRAW) { s = drawCards(s, playerId); steps.push(s); }

  return steps;
}

// ─── ACTIVATE play-out: lookahead 1-ply, aplica la mejor acción hasta agotar ─────
// Si `steps` se pasa, registra cada estado intermedio (para la animación de la IA).
function playOutActivate(state: GameState, playerId: PlayerId, steps?: GameState[]): GameState {
  let s = state;
  const MAX_ITERATIONS = 20;
  let iterations = 0;
  while (s.turnPhase === TurnPhase.ACTIVATE && iterations++ < MAX_ITERATIONS) {
    const player = getPlayer(s, playerId);
    const available = getAvailableSlotIndices(s, playerId, player.pawnLocationId);
    if (available.length === 0) break;

    const currentVal = evaluateState(s, playerId);
    let best: GameState | null = null;
    let bestVal = -Infinity;

    for (const slotIdx of available) {
      const slot = getActionAtSlot(s, playerId, slotIdx);
      if (!slot) continue;
      const next = tryActionForSlot(s, playerId, slotIdx, slot);
      if (!next) continue;
      const val = evaluateState(next, playerId);
      if (val > bestVal) { bestVal = val; best = next; }
    }

    if (!best) break;
    // No realizar acciones que empeoren claramente nuestra posición (p. ej. malgastar aliados).
    if (bestVal < currentVal - 0.9) break;
    s = best;
    if (steps) steps.push(s);
  }
  return s;
}

// ─── Candidate action producers (puros: devuelven el estado resultante o null) ───

function tryActionForSlot(
  s: GameState, playerId: PlayerId, slotIdx: number, slot: { type: ActionType; value?: number },
): GameState | null {
  switch (slot.type) {
    case ActionType.GAIN_POWER:     return gainPower(s, playerId, slotIdx);
    case ActionType.PLAY_CARD:      return tryPlayCard(s, playerId, slotIdx);
    case ActionType.VANQUISH:       return tryVanquish(s, playerId, slotIdx);
    case ActionType.MOVE_ITEM_ALLY: return tryMoveItemAlly(s, playerId, slotIdx);
    case ActionType.MOVE_HERO:      return tryMoveHero(s, playerId, slotIdx);
    case ActionType.FATE:           return tryFate(s, playerId, slotIdx);
    case ActionType.ACTIVATE_CARD:  return tryActivateCard(s, playerId, slotIdx);
    case ActionType.DISCARD:        return tryDiscard(s, playerId, slotIdx);
    default:                        return null;
  }
}

/** Elige, entre las cartas asequibles de la mano, la jugada que deja el mejor estado. */
function tryPlayCard(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  const player = getPlayer(s, playerId);
  let best: GameState | null = null;
  let bestVal = -Infinity;
  for (const id of player.handInstIds) {
    const card = s.allCards[id];
    if (!card) continue;
    const targetLoc = pickBestPlayTarget(s, player, id);
    if (!canPlayCard(s, playerId, id, slotIdx, targetLoc).valid) continue;
    const ctx = buildPlayCtx(s, playerId, id, targetLoc);
    const next = playCard(s, playerId, id, slotIdx, targetLoc, ctx);
    const val = evaluateState(next, playerId);
    if (val > bestVal) { bestVal = val; best = next; }
  }
  return best;
}

/** Vence un héroe (prioriza Burla → Peter Pan en Jolly Roger → resto) con los aliados mínimos suficientes. */
function tryVanquish(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  const player = getPlayer(s, playerId);
  const plugin = getPlugin(player.villainId);
  const heroEntries = Object.entries(player.locationStates).flatMap(([, ls]) => ls.heroCardInstIds);

  // Heroes with Burla block ALL other vanquish — they go first
  const heroHasBurla = (id: CardInstId) =>
    (s.allCards[id]?.attachedItemInstIds ?? []).some(
      itemId => s.allCards[itemId]?.effectIds.includes(EffectId.BURLA_ATTACH),
    );
  const burlaHeroes = heroEntries.filter(heroHasBurla);

  // Tic Tac must be defeated before Hook can win — second priority
  const ticTacId = heroEntries.find(
    id => s.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC && !heroHasBurla(id),
  );

  const ppAtJollyId = player.locationStates[HookLocationId.JOLLY_ROGER]?.heroCardInstIds.find(
    id => s.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN,
  );
  // Fix G: entre el resto, Wendy primero (eliminarla quita el aura +1 a todos los demás héroes).
  // Wendy tiene effectIds:[] y defId 'hook_f_wendy' — NO tiene hook_wendy_aura en sus propios efectos.
  const others = heroEntries.filter(id => !heroHasBurla(id) && id !== ticTacId && id !== ppAtJollyId);
  const feasible = (heroId: CardInstId) => {
    const heroLoc = s.allCards[heroId]?.locationId;
    if (!heroLoc) return false;
    const allyStr = (player.locationStates[heroLoc]?.villainCardInstIds ?? [])
      .filter(aid => s.allCards[aid]?.cardType === CardType.ALLY)
      .reduce((sum, aid) => sum + getEffectiveStrength(s, aid), 0);
    return allyStr >= getEffectiveStrength(s, heroId);
  };
  // Coste de slots bloqueados por ubicación: 1+ héroe siempre bloquea los 2 primeros slots.
  const slotDmgForHero = (heroId: CardInstId): number => {
    const heroLoc = s.allCards[heroId]?.locationId;
    if (!heroLoc) return 0;
    const locDef = plugin.locations.find(l => l.id === heroLoc);
    if (!locDef) return 0;
    const blocked = Math.min(2, locDef.actions.length);
    let dmg = 0;
    for (let i = 0; i < blocked; i++) {
      switch (locDef.actions[i].type) {
        case ActionType.PLAY_CARD:      dmg += 9; break;
        case ActionType.VANQUISH:       dmg += 8; break;
        case ActionType.GAIN_POWER:     dmg += 5; break;
        case ActionType.MOVE_HERO:      dmg += 5; break;
        case ActionType.FATE:           dmg += 4; break;
        case ActionType.MOVE_ITEM_ALLY: dmg += 4; break;
        case ActionType.DISCARD:        dmg += 2; break;
        default:                        dmg += 3; break;
      }
    }
    return dmg;
  };
  others.sort((a, b) => {
    const aIsWendy = s.allCards[a]?.defId === CardDefId.HOOK_WENDY ? -1 : 0;
    const bIsWendy = s.allCards[b]?.defId === CardDefId.HOOK_WENDY ? -1 : 0;
    if (aIsWendy !== bIsWendy) return aIsWendy - bIsWendy;
    const af = feasible(a) ? 0 : 1;
    const bf = feasible(b) ? 0 : 1;
    if (af !== bf) return af - bf;
    const dmgDiff = slotDmgForHero(b) - slotDmgForHero(a);
    if (dmgDiff !== 0) return dmgDiff;
    return getEffectiveStrength(s, a) - getEffectiveStrength(s, b);
  });
  const ordered = [
    ...burlaHeroes,
    ...(ticTacId ? [ticTacId] : []),
    ...(ppAtJollyId && !heroHasBurla(ppAtJollyId) && ppAtJollyId !== ticTacId ? [ppAtJollyId] : []),
    ...others,
  ];

  for (const heroId of ordered) {
    const heroLoc = s.allCards[heroId]?.locationId;
    if (!heroLoc) continue;
    const hero = s.allCards[heroId];
    const heroLocDef = plugin.locations.find(l => l.id === heroLoc);
    const sameLocAllies = (player.locationStates[heroLoc]?.villainCardInstIds ?? []).filter(
      id => s.allCards[id]?.cardType === CardType.ALLY,
    );
    const adjAllies: CardInstId[] = (heroLocDef?.adjacentIds ?? []).flatMap(adjId => {
      const adjLs = player.locationStates[adjId];
      return (adjLs?.villainCardInstIds ?? []).filter(id => {
        const a = s.allCards[id];
        return a?.cardType === CardType.ALLY && a.effectIds.includes(EffectId.PELOTON_ADJ_VANQUISH);
      });
    });
    const cand = [...sameLocAllies, ...adjAllies];
    if (cand.length === 0) continue;
    const heroStr = getEffectiveStrength(s, heroId);
    const needsMultiple = hero?.effectIds.some(id => getEffectDef(id)?.requiresMultipleAlliesToVanquish) ?? false;
    const sorted = [...cand].sort((a, b) => getEffectiveStrength(s, b) - getEffectiveStrength(s, a));
    let total = 0;
    const chosen: CardInstId[] = [];
    for (const ally of sorted) {
      chosen.push(ally);
      total += getEffectiveStrength(s, ally);
      if (total >= heroStr && (!needsMultiple || chosen.length >= 2)) break;
    }
    if (total >= heroStr && canVanquish(s, playerId, heroId, chosen, slotIdx).valid) {
      return vanquish(s, playerId, heroId, chosen, slotIdx);
    }
  }
  return null;
}

/** Mueve un Objeto/Aliado: evalúa todas las combinaciones (carta × destino) y elige la mejor. */
function tryMoveItemAlly(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  const player = getPlayer(s, playerId);
  const plugin = getPlugin(player.villainId);
  const currentVal = evaluateState(s, playerId);
  let best: GameState | null = null;
  let bestVal = currentVal; // solo mover si mejora el estado

  for (const [locId, ls] of Object.entries(player.locationStates)) {
    const curLocDef = plugin.locations.find(l => l.id === locId);
    if (!curLocDef) continue;
    for (const cardId of ls.villainCardInstIds) {
      const c = s.allCards[cardId];
      if (c?.cardType !== CardType.ITEM && c?.cardType !== CardType.ALLY) continue;
      for (const adjId of curLocDef.adjacentIds) {
        if (!canMoveItemAlly(s, playerId, cardId, adjId, slotIdx).valid) continue;
        const next = moveItemAlly(s, playerId, cardId, adjId, slotIdx);
        const val = evaluateState(next, playerId);
        if (val > bestVal) { bestVal = val; best = next; }
      }
    }
  }
  return best;
}

/** Garfio: mueve héroes bloqueantes (Burla → Tic Tac → Peter Pan) hacia Jolly Roger. */
function tryMoveHero(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  const player = getPlayer(s, playerId);
  if (player.villainId !== 'hook') return null;
  const plugin = getPlugin(player.villainId);

  const heroHasBurla = (id: CardInstId) =>
    (s.allCards[id]?.attachedItemInstIds ?? []).some(
      itemId => s.allCards[itemId]?.effectIds.includes(EffectId.BURLA_ATTACH),
    );

  // Orden de prioridad: Burla → Tic Tac → Peter Pan
  // Para cada uno, intentar acercarlos a Jolly Roger si no están ya allí
  const candidateHeroIds: CardInstId[] = [];
  for (const [, ls] of Object.entries(player.locationStates)) {
    candidateHeroIds.push(...ls.heroCardInstIds.filter(heroHasBurla));
  }
  for (const [, ls] of Object.entries(player.locationStates)) {
    const tt = ls.heroCardInstIds.find(id => s.allCards[id]?.defId === CardDefId.HOOK_TIC_TAC && !heroHasBurla(id));
    if (tt) candidateHeroIds.push(tt);
  }
  for (const [locId, ls] of Object.entries(player.locationStates)) {
    if (locId === HookLocationId.JOLLY_ROGER) continue;
    const ppId = ls.heroCardInstIds.find(id => s.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN && !heroHasBurla(id));
    if (ppId) candidateHeroIds.push(ppId);
  }

  for (const heroId of candidateHeroIds) {
    const heroLoc = s.allCards[heroId]?.locationId;
    if (!heroLoc || heroLoc === HookLocationId.JOLLY_ROGER) continue;
    // Peter Pan solo se puede vencer en JR → siempre moverlo hacia allí, sin excepción.
    // Para Burla/Tic Tac: gestión inteligente según fuerza co-ubicada.
    const isPeterPan = s.allCards[heroId]?.defId === CardDefId.HOOK_PETER_PAN;
    if (!isPeterPan) {
      const heroStr = getEffectiveStrength(s, heroId);
      const coLocAllies = (player.locationStates[heroLoc]?.villainCardInstIds ?? []).filter(
        id => s.allCards[id]?.cardType === CardType.ALLY,
      );
      const coLocStr = coLocAllies.reduce((sum, id) => sum + getEffectiveStrength(s, id), 0);
      const needsMultiple = (s.allCards[heroId]?.effectIds ?? []).some(
        id => getEffectDef(id)?.requiresMultipleAlliesToVanquish,
      );
      // Fuerza suficiente: no mover, vencer en su ubicación actual
      if (coLocStr >= heroStr && (!needsMultiple || coLocAllies.length >= 2)) continue;
      // Fuerza insuficiente pero hay aliados en mano: jugarlos primero antes de mover
      const hasAllyInHand = player.handInstIds.some(id => s.allCards[id]?.cardType === CardType.ALLY);
      if (hasAllyInHand) continue;
    }

    const curLocDef = plugin.locations.find(l => l.id === heroLoc);
    if (!curLocDef) continue;
    const dest = curLocDef.adjacentIds.find(a => a === HookLocationId.JOLLY_ROGER) ?? curLocDef.adjacentIds[0];
    if (dest && canMoveHero(s, playerId, heroId, dest, slotIdx).valid) {
      return moveHero(s, playerId, heroId, dest, slotIdx);
    }
  }
  return null;
}

/** Acción Destino contra el rival: elige una carta revelada y la resuelve. */
function tryFate(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  if (!canFate(s, playerId, slotIdx).valid) return null;
  const oppIdx = (s.currentPlayerIndex + 1) % s.players.length;
  let st = startFate(s, playerId, oppIdx, slotIdx);
  if (!st.pendingFate) return st;

  const { revealedInstIds, targetPlayerIndex } = st.pendingFate;
  const oppPlayer = st.players[targetPlayerIndex];
  const oppPlugin = getPlugin(oppPlayer.villainId);

  const validFateLocs = oppPlugin.locations.filter(l => !oppPlayer.locationStates[l.id]?.isLocked);
  const fallbackLoc = validFateLocs[0] ?? oppPlugin.locations[0];

  // Evaluar TODAS las cartas reveladas × TODAS las ubicaciones; escoger el mejor resultado.
  let bestResult: GameState | null = null;
  let bestVal = -Infinity;

  for (const cardId of revealedInstIds) {
    const card = st.allCards[cardId];
    if (!card) continue;

    if (card.cardType === CardType.HERO) {
      for (const locDef of validFateLocs) {
        const result = resolveFate(st, cardId, locDef.id, {});
        const val = evaluateState(result, playerId);
        if (val > bestVal) { bestVal = val; bestResult = result; }
      }
    } else if (card.cardType === CardType.ITEM) {
      for (const locDef of validFateLocs) {
        const heroAtLoc = oppPlayer.locationStates[locDef.id]?.heroCardInstIds[0];
        const ctx = heroAtLoc ? { targetCardInstId: heroAtLoc } : {};
        const result = resolveFate(st, cardId, locDef.id, ctx);
        const val = evaluateState(result, playerId);
        if (val > bestVal) { bestVal = val; bestResult = result; }
      }
    } else {
      // Efecto/condición: solo necesita una ubicación de referencia.
      const result = resolveFate(st, cardId, fallbackLoc.id, {});
      const val = evaluateState(result, playerId);
      if (val > bestVal) { bestVal = val; bestResult = result; }
    }
  }

  return bestResult ?? resolveFate(st, revealedInstIds[0] ?? '', fallbackLoc.id, {});
}

/** Activa una carta (El Cuervo se mueve libremente y resuelve su acción en destino). */
function tryActivateCard(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  const player = getPlayer(s, playerId);
  const plugin = getPlugin(player.villainId);
  for (const [, ls] of Object.entries(player.locationStates)) {
    for (const cardId of ls.villainCardInstIds) {
      if (!canActivateCard(s, playerId, cardId, slotIdx).valid) continue;
      const card = s.allCards[cardId];
      const ctx: { targetLocationId?: LocationId; targetCardInstId?: CardInstId } = {};

      if (card.effectIds.includes(EffectId.RAVEN_ACTIVATE)) {
        // El Cuervo se mueve LIBREMENTE (moverlo no quita maldiciones).
        const openLocs = plugin.locations.filter(l => !player.locationStates[l.id]?.isLocked);
        let target: LocationId | undefined;
        if (player.villainId === 'maleficent' && player.handInstIds.some(id => s.allCards[id]?.cardType === CardType.CURSE)) {
          const cover = openLocs.find(l => {
            const ls2 = player.locationStates[l.id];
            const hasPlay = l.actions.some(a => a.type === ActionType.PLAY_CARD);
            const blocked = ls2.heroCardInstIds.some(hid =>
              s.allCards[hid]?.effectIds.some(eid => getEffectDef(eid)?.blocksCursePlay),
            );
            return hasPlay && !locHasCurse(s, ls2) && !blocked;
          });
          if (cover) target = cover.id;
        }
        if (!target) {
          const ranked = openLocs
            .map(l => ({ id: l.id, sc: scoreLocation(s, player, l.id) }))
            .sort((a, b) => b.sc - a.sc);
          target = ranked[0]?.id ?? card.locationId;
        }
        ctx.targetLocationId = target;
      }

      let next = activateCard(s, playerId, cardId, slotIdx, ctx);
      // Resuelve la acción del Cuervo en su destino para que el estado refleje su efecto.
      if (next.pendingCuervo) {
        const { action, params } = chooseCuervoAction(next);
        next = resolveCuervo(next, action, params);
      }
      return next;
    }
  }
  return null;
}

/** Descarta solo cuando es beneficioso: nunca objetos, solo si mano grande o mejora estado. */
function tryDiscard(s: GameState, playerId: PlayerId, slotIdx: number): GameState | null {
  const player = getPlayer(s, playerId);
  if (player.handInstIds.length === 0 || !canDiscard(s, playerId, slotIdx).valid) return null;
  // Fix I: nunca descartar objetos
  const discardable = player.handInstIds.filter(
    id => s.allCards[id]?.cardType !== CardType.ITEM,
  );
  if (discardable.length === 0) return null;
  // Fix J: solo descartar si la mano es grande o el descarte mejora genuinamente el estado
  const handTooBig = player.handInstIds.length > 5;
  if (!handTooBig) {
    const currentVal = evaluateState(s, playerId);
    const anyImproves = discardable.some(id => {
      const next = discardFromHand(s, playerId, [id], slotIdx);
      return evaluateState(next, playerId) > currentVal;
    });
    if (!anyImproves) return null;
  }
  // Elegir la carta cuyo descarte mejora más evaluateState.
  // Si hay empate, condiciones > efectos > aliados (las condiciones raramente se necesitan).
  const currentVal = handTooBig ? 0 : evaluateState(s, playerId);
  const withDeltas = discardable.map(id => ({
    id,
    delta: evaluateState(discardFromHand(s, playerId, [id], slotIdx), playerId) - currentVal,
  }));
  withDeltas.sort((a, b) => {
    if (Math.abs(b.delta - a.delta) > 0.01) return b.delta - a.delta;
    const typeOrder: Record<string, number> = { [CardType.CONDITION]: 0, [CardType.EFFECT]: 1, [CardType.ALLY]: 2 };
    const ta = typeOrder[s.allCards[a.id]?.cardType ?? ''] ?? 3;
    const tb = typeOrder[s.allCards[b.id]?.cardType ?? ''] ?? 3;
    return ta - tb;
  });
  // Descartar todas las cartas beneficiosas a la vez (el juego permite cualquier cantidad).
  const beneficial = withDeltas.filter(d => d.delta > 0).map(d => d.id);
  if (!handTooBig && beneficial.length === 0) return null;
  const toDiscard = beneficial.length > 0 ? beneficial : [withDeltas[0].id];
  return discardFromHand(s, playerId, toDiscard, slotIdx);
}

// ─── CUERVO (El Cuervo) auto-resolution for the AI ───────────────────────────────
// Antes el Cuervo siempre ganaba poder. Ahora, para Maléfica, intenta cubrir la
// ubicación donde está con una Maldición de la mano (su condición de victoria).
export function chooseCuervoAction(state: GameState): {
  action: ActionType;
  params: { cardInstId?: CardInstId; targetLocationId?: LocationId };
} {
  const pc = state.pendingCuervo;
  if (!pc) return { action: ActionType.GAIN_POWER, params: {} };
  const player = getPlayer(state, pc.playerId);
  const ls = player.locationStates[pc.locationId];
  const locDef = getPlugin(player.villainId).locations.find(l => l.id === pc.locationId);
  const hasPlayCardAction = locDef?.actions.some(a => a.type === ActionType.PLAY_CARD) ?? false;

  if (player.villainId === 'maleficent' && ls && hasPlayCardAction && !locHasCurse(state, ls)) {
    const blockedByHero = ls.heroCardInstIds.some(hid =>
      state.allCards[hid]?.effectIds.some(eid => getEffectDef(eid)?.blocksCursePlay),
    );
    if (!blockedByHero) {
      const curseId = player.handInstIds.find(id => {
        const c = state.allCards[id];
        if (c?.cardType !== CardType.CURSE) return false;
        const cost = Math.max(0, c.baseCost + c.costModifier + computeKingdomCostMod(state, player.id, c, pc.locationId));
        return player.power >= cost;
      });
      if (curseId) {
        return { action: ActionType.PLAY_CARD, params: { cardInstId: curseId, targetLocationId: pc.locationId } };
      }
    }
  }

  return { action: ActionType.GAIN_POWER, params: {} };
}

// ─── MINIMAX profundidad-2 + poda alpha-beta ─────────────────────────────────
// Cada nodo del árbol representa un turno completo (MOVE → ACTIVATE → DRAW).
// Profundidad-2 = mi turno + respuesta del rival (~9-16 simulaciones por decisión).

/** Simula un turno completo en `dest`: MOVE → ACTIVATE → DRAW. */
function simulateTurnAtDest(state: GameState, playerId: PlayerId, dest: LocationId): GameState {
  let s = movePawn(state, playerId, dest);
  s = playOutActivate(s, playerId);
  if (s.turnPhase === TurnPhase.ACTIVATE) s = endActivatePhase(s);
  if (s.turnPhase === TurnPhase.DRAW) s = drawCards(s, playerId);
  return s;
}

/**
 * Devuelve el mejor destino para `playerId` con minimax profundidad-2 y poda alpha-beta.
 * El rival responde eligiendo el destino que maximiza su propio evaluador (minimiza el nuestro).
 */
function minimaxBestDest(state: GameState, playerId: PlayerId): LocationId {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const dests = plugin.locations.filter(
    l => l.id !== player.pawnLocationId && !player.locationStates[l.id]?.isLocked,
  );
  if (dests.length === 0) return player.pawnLocationId;

  // Pre-ordenar por evaluación 1-ply (mejor primero) para maximizar la poda alpha.
  const candidates = dests
    .map(d => {
      const hint = evaluateState(playOutActivate(movePawn(state, playerId, d.id), playerId), playerId);
      return { id: d.id, hint };
    })
    .sort((a, b) => b.hint - a.hint);

  let bestDest = candidates[0].id;
  let alpha = -Infinity;

  for (const { id: dest } of candidates) {
    const afterMyTurn = simulateTurnAtDest(state, playerId, dest);
    const val = afterMyTurn.winner
      ? evaluateState(afterMyTurn, playerId)
      : minimaxOppResponse(afterMyTurn, playerId, alpha);

    if (val > alpha) { alpha = val; bestDest = dest; }
  }
  return bestDest;
}

/**
 * Nodo rival: el rival elige el destino que MINIMIZA la evaluación de `originalPlayerId`.
 * Aplica poda alpha: si el rival ya encontró una respuesta tan mala para nosotros que la
 * rama padre no la elegiría, se corta.
 */
function minimaxOppResponse(
  state: GameState,
  originalPlayerId: PlayerId,
  alpha: number,
): number {
  const opp = state.players[state.currentPlayerIndex];
  const oppPlugin = getPlugin(opp.villainId);

  if (opp.skipNextMove) {
    let s = skipMove(state, opp.id);
    s = playOutActivate(s, opp.id);
    if (s.turnPhase === TurnPhase.ACTIVATE) s = endActivatePhase(s);
    if (s.turnPhase === TurnPhase.DRAW) s = drawCards(s, opp.id);
    return evaluateState(s, originalPlayerId);
  }

  const dests = oppPlugin.locations.filter(
    l => l.id !== opp.pawnLocationId && !opp.locationStates[l.id]?.isLocked,
  );
  if (dests.length === 0) return evaluateState(state, originalPlayerId);

  // Pre-ordenar ascendente (peor para nosotros primero) para alcanzar el beta-cutoff cuanto antes.
  const candidates = dests
    .map(d => {
      const hint = evaluateState(playOutActivate(movePawn(state, opp.id, d.id), opp.id), originalPlayerId);
      return { id: d.id, hint };
    })
    .sort((a, b) => a.hint - b.hint);

  let minVal = Infinity;

  for (const { id: dest } of candidates) {
    const afterOppTurn = simulateTurnAtDest(state, opp.id, dest);
    const val = evaluateState(afterOppTurn, originalPlayerId);
    if (val < minVal) minVal = val;
    if (minVal <= alpha) break; // poda: el padre (MAX) ya tiene algo mejor
  }
  return minVal;
}

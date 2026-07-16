import { ActionType, TurnPhase, CardType } from '../types';
import type { GameState, PlayerId, LocationId, CardInstId } from '../types';
import { getPlugin, getEffectDef } from '../villains/registry';
import { EffectId, CardDefId } from '../villains/effectIds';
import { getPlayer, getEffectiveStrength, computeKingdomCostMod, heroBlockedFromLocation } from './stateHelpers';
import { getAvailableSlotIndices, getActionAtSlot } from './slotHelpers';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

const ok: ValidationResult = { valid: true };
const fail = (reason: string): ValidationResult => ({ valid: false, reason });

// ─── MOVE PAWN ───────────────────────────────────────────────────────────────

export function canMovePawn(
  state: GameState,
  playerId: PlayerId,
  locationId: LocationId,
): ValidationResult {
  if (state.turnPhase !== TurnPhase.MOVE) return fail('No es la fase de Mover.');
  if (state.players[state.currentPlayerIndex].id !== playerId)
    return fail('No es tu turno.');
  const player = getPlayer(state, playerId);
  if (player.pawnLocationId === locationId) return fail('Ya estás en esa ubicación.');
  const plugin = getPlugin(player.villainId);
  const locDef = plugin.locations.find(l => l.id === locationId);
  if (!locDef) return fail('Ubicación no existe.');
  const locState = player.locationStates[locationId];
  if (locState.isLocked) return fail('Ubicación bloqueada.');
  return ok;
}

// ─── ACTION SLOT ─────────────────────────────────────────────────────────────

export function canUseSlot(
  state: GameState,
  playerId: PlayerId,
  slotIndex: number,
): ValidationResult {
  if (state.turnPhase !== TurnPhase.ACTIVATE) return fail('No es la fase de Acciones.');
  if (state.players[state.currentPlayerIndex].id !== playerId)
    return fail('No es tu turno.');
  const player = getPlayer(state, playerId);
  const available = getAvailableSlotIndices(state, playerId, player.pawnLocationId);
  if (!available.includes(slotIndex)) return fail('Esa acción no está disponible.');
  return ok;
}

// ─── PLAY CARD ────────────────────────────────────────────────────────────────

export function canPlayCard(
  state: GameState,
  playerId: PlayerId,
  cardInstId: CardInstId,
  slotIndex: number,
  targetLocationId: LocationId,
): ValidationResult {
  const slotCheck = canUseSlot(state, playerId, slotIndex);
  if (!slotCheck.valid) return slotCheck;

  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const slot = getActionAtSlot(state, playerId, slotIndex);
  if (!slot || slot.type !== ActionType.PLAY_CARD) return fail('Esa ranura no es Jugar Carta.');

  if (!player.handInstIds.includes(cardInstId)) return fail('Carta no está en tu mano.');

  const card = state.allCards[cardInstId];
  const kingdomCostMod = computeKingdomCostMod(state, playerId, card, targetLocationId);
  const effectiveCost = Math.max(0, card.baseCost + card.costModifier + kingdomCostMod);
  if (player.power < effectiveCost) return fail('No tienes suficiente Poder.');

  // Validate target location
  const targetLocDef = plugin.locations.find(l => l.id === targetLocationId);
  if (!targetLocDef) return fail('Ubicación destino no existe.');
  const targetLocState = player.locationStates[targetLocationId];
  if (targetLocState.isLocked) return fail('Ubicación destino bloqueada.');

  // Heroes (fate cards) can only be played by opponents — handled in fate flow
  if (card.deck === 'FATE' && card.cardType === CardType.HERO) {
    return fail('Los Héroes se juegan mediante la acción Destino.');
  }

  // Special: Selva de Mortales Espinos — heroes need 4+ strength
  const specialRules = targetLocDef.specialRules ?? [];
  for (const rule of specialRules) {
    if (rule.type === 'HERO_MIN_STRENGTH') {
      if (card.cardType === CardType.HERO) {
        const str = (card.baseStrength ?? 0) + card.strengthModifier;
        if (str < rule.minStrength) {
          return fail(`El Héroe necesita ${rule.minStrength}+ de Fuerza para esta ubicación.`);
        }
      }
    }
  }

  // Primavera / blocksCursePlay: no curses allowed at this location
  if (card.cardType === CardType.CURSE) {
    const curseBlocked = targetLocState.heroCardInstIds.some(id =>
      state.allCards[id]?.effectIds.some(effId => getEffectDef(effId)?.blocksCursePlay),
    );
    if (curseBlocked) return fail('No se puede jugar una Maldición aquí (Primavera).');
  }

  // Rey Ricardo / blocksEffectPlay: sin ubicación específica en su texto (a diferencia de
  // Primavera) — bloquea en TODO el reino mientras siga vivo, no solo donde está parado.
  if (card.cardType === CardType.EFFECT) {
    const effectBlocked = Object.values(player.locationStates).some(ls =>
      ls.heroCardInstIds.some(id => state.allCards[id]?.effectIds.some(effId => getEffectDef(effId)?.blocksEffectPlay)),
    );
    if (effectBlocked) return fail('No se pueden jugar Efectos mientras Rey Ricardo esté en el Reino.');
  }

  return ok;
}

// ─── VANQUISH ─────────────────────────────────────────────────────────────────

export function canVanquish(
  state: GameState,
  playerId: PlayerId,
  heroInstId: CardInstId,
  allyInstIds: CardInstId[],
  slotIndex: number,
): ValidationResult {
  const slotCheck = canUseSlot(state, playerId, slotIndex);
  if (!slotCheck.valid) return slotCheck;

  const slot = getActionAtSlot(state, playerId, slotIndex);
  if (!slot || slot.type !== ActionType.VANQUISH) return fail('Esa ranura no es Vencer.');

  return canVanquishFree(state, playerId, heroInstId, allyInstIds);
}

/**
 * Validación de Vencer SIN consumir casilla de acción — para efectos que otorgan un
 * Vencer gratuito (p. ej. Trampa del Príncipe Juan tras mover el Aliado).
 */
export function canVanquishFree(
  state: GameState,
  playerId: PlayerId,
  heroInstId: CardInstId,
  allyInstIds: CardInstId[],
): ValidationResult {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);

  if (allyInstIds.length === 0) return fail('Necesitas al menos un Aliado para Vencer.');

  const hero = state.allCards[heroInstId];
  if (!hero) return fail('Héroe no encontrado.');
  if (hero.cardType !== CardType.HERO) return fail('El objetivo no es un Héroe.');

  // Hero must be in player's kingdom
  const heroLocState = player.locationStates[hero.locationId!];
  if (!heroLocState?.heroCardInstIds.includes(heroInstId))
    return fail('El Héroe no está en tu Reino.');

  // All allies must be in the same location as the hero, except those with canVanquishFromAdjacent
  for (const allyId of allyInstIds) {
    const ally = state.allCards[allyId];
    if (!ally) return fail(`Aliado ${allyId} no encontrado.`);
    if (ally.cardType !== CardType.ALLY) return fail('Solo Aliados pueden Vencer.');
    if (ally.locationId !== hero.locationId) {
      const canFromAdj = ally.effectIds.some(id => getEffectDef(id)?.canVanquishFromAdjacent);
      if (!canFromAdj) return fail('El Aliado debe estar en la misma ubicación que el Héroe.');
      const heroLocDef = plugin.locations.find(l => l.id === hero.locationId);
      if (!heroLocDef?.adjacentIds.includes(ally.locationId!))
        return fail('El Aliado con habilidad adyacente no está en una ubicación contigua.');
    }
  }

  // Combined strength must meet or exceed hero strength
  const heroStr = getEffectiveStrength(state, heroInstId);
  const allyTotalStr = allyInstIds.reduce(
    (sum, id) => sum + getEffectiveStrength(state, id),
    0,
  );
  if (allyTotalStr < heroStr)
    return fail(`Fuerza combinada (${allyTotalStr}) < Fuerza del Héroe (${heroStr}).`);

  // Some heroes require multiple allies (e.g. Niños Perdidos, Guardias)
  if (hero.effectIds.some(effId => getEffectDef(effId)?.requiresMultipleAlliesToVanquish) && allyInstIds.length < 2) {
    return fail(`${hero.name} requiere al menos dos Aliados para ser derrotado.`);
  }

  // Burla: heroes with Burla attached must be defeated before any non-Burla hero
  const heroHasBurla = (id: CardInstId) =>
    (state.allCards[id]?.attachedItemInstIds ?? []).some(
      itemId => state.allCards[itemId]?.effectIds.includes(EffectId.BURLA_ATTACH),
    );
  if (!heroHasBurla(heroInstId)) {
    const burlaHeroExists = Object.values(player.locationStates).some(ls =>
      ls.heroCardInstIds.some(id => id !== heroInstId && heroHasBurla(id)),
    );
    if (burlaHeroExists) return fail('Debes derrotar primero a los Héroes con Burla.');
  }

  // Hook: Peter Pan solo puede vencerse en el Jolly Roger
  if (hero.defId === CardDefId.HOOK_PETER_PAN && hero.locationId !== 'jollyroger') {
    return fail('Peter Pan solo puede ser derrotado en el Jolly Roger.');
  }

  return ok;
}

// ─── MOVE ITEM/ALLY ───────────────────────────────────────────────────────────

export function canMoveItemAlly(
  state: GameState,
  playerId: PlayerId,
  cardInstId: CardInstId,
  targetLocationId: LocationId,
  slotIndex: number,
): ValidationResult {
  const slotCheck = canUseSlot(state, playerId, slotIndex);
  if (!slotCheck.valid) return slotCheck;

  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const slot = getActionAtSlot(state, playerId, slotIndex);
  if (!slot || slot.type !== ActionType.MOVE_ITEM_ALLY) return fail('Esa ranura no es Mover Objeto/Aliado.');

  const card = state.allCards[cardInstId];
  if (!card) return fail('Carta no encontrada.');
  if (card.cardType !== CardType.ALLY && card.cardType !== CardType.ITEM)
    return fail('Solo se pueden mover Aliados u Objetos.');
  if (card.attachedToInstId) return fail('No se puede mover un Objeto unido a otro.');

  const srcLocId = card.locationId;
  if (!srcLocId) return fail('La carta no está en el Reino.');
  if (player.locationStates[srcLocId]?.isLocked) return fail('Ubicación origen bloqueada.');

  // Must move to adjacent location
  const srcLocDef = plugin.locations.find(l => l.id === srcLocId);
  if (!srcLocDef?.adjacentIds.includes(targetLocationId))
    return fail('Solo puedes mover a una ubicación adyacente.');

  const targetLocState = player.locationStates[targetLocationId];
  if (targetLocState?.isLocked) return fail('Ubicación destino bloqueada.');


  return ok;
}

// ─── MOVE HERO ────────────────────────────────────────────────────────────────

export function canMoveHero(
  state: GameState,
  playerId: PlayerId,
  heroInstId: CardInstId,
  targetLocationId: LocationId,
  slotIndex: number,
): ValidationResult {
  const slotCheck = canUseSlot(state, playerId, slotIndex);
  if (!slotCheck.valid) return slotCheck;

  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const slot = getActionAtSlot(state, playerId, slotIndex);
  if (!slot || slot.type !== ActionType.MOVE_HERO) return fail('Esa ranura no es Mover Héroe.');

  const hero = state.allCards[heroInstId];
  if (!hero || hero.cardType !== CardType.HERO) return fail('No es un Héroe.');
  if (!hero.locationId) return fail('El Héroe no está en el Reino.');
  if (player.locationStates[hero.locationId]?.isLocked) return fail('Ubicación origen bloqueada.');

  const srcLocDef = plugin.locations.find(l => l.id === hero.locationId);
  if (!srcLocDef?.adjacentIds.includes(targetLocationId))
    return fail('Solo puedes mover Héroes a ubicaciones adyacentes.');

  const targetLocState = player.locationStates[targetLocationId];
  if (targetLocState?.isLocked) return fail('Ubicación destino bloqueada.');

  // Lady Kluck: no puede ser movida a La Prisión (cannotEnterLocationId).
  if (heroBlockedFromLocation(state, heroInstId, targetLocationId))
    return fail(`${hero.name} no puede moverse a esa ubicación.`);

  return ok;
}

// ─── FATE ─────────────────────────────────────────────────────────────────────

export function canFate(
  state: GameState,
  playerId: PlayerId,
  slotIndex: number,
): ValidationResult {
  const slotCheck = canUseSlot(state, playerId, slotIndex);
  if (!slotCheck.valid) return slotCheck;

  const slot = getActionAtSlot(state, playerId, slotIndex);
  if (!slot || slot.type !== ActionType.FATE) return fail('Esa ranura no es Destino.');
  if (state.players.length < 2) return fail('Necesitas un oponente.');
  return ok;
}

// ─── ACTIVATE CARD ────────────────────────────────────────────────────────────

export function canActivateCard(
  state: GameState,
  playerId: PlayerId,
  cardInstId: CardInstId,
  slotIndex: number,
): ValidationResult {
  const slotCheck = canUseSlot(state, playerId, slotIndex);
  if (!slotCheck.valid) return slotCheck;

  const player = getPlayer(state, playerId);
  const slot = getActionAtSlot(state, playerId, slotIndex);
  if (!slot || slot.type !== ActionType.ACTIVATE_CARD) return fail('Esa ranura no es Activar.');

  const card = state.allCards[cardInstId];
  if (!card) return fail('Carta no encontrada.');
  if (!card.locationId) return fail('La carta no está en el Reino.');
  if (player.locationStates[card.locationId]?.isLocked)
    return fail('La carta está en una ubicación bloqueada.');

  const hasActivatedEffect = card.effectIds.some(id => {
    const eff = getEffectDef(id);
    return eff?.trigger === 'ACTIVATED';
  });
  if (!hasActivatedEffect) return fail('Esta carta no tiene habilidad Activada.');

  const activationCost = card.activationCost ?? 0;
  if (player.power < activationCost)
    return fail(`Necesitas ${activationCost} de Poder para activar.`);

  return ok;
}

// ─── DISCARD ─────────────────────────────────────────────────────────────────

export function canDiscard(
  state: GameState,
  playerId: PlayerId,
  slotIndex: number,
): ValidationResult {
  const slotCheck = canUseSlot(state, playerId, slotIndex);
  if (!slotCheck.valid) return slotCheck;

  const slot = getActionAtSlot(state, playerId, slotIndex);
  if (!slot || slot.type !== ActionType.DISCARD) return fail('Esa ranura no es Descartar.');
  return ok;
}

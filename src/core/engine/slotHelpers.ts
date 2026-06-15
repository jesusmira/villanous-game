import type { GameState, PlayerId, LocationId, CardInstId, ActionType } from '../types';
import { getPlayer } from './stateHelpers';
import { getPlugin } from '../villains/registry';

export const ITEM_SLOT_OFFSET = 100;

export function getItemGrantedSlotEntries(
  state: GameState,
  playerId: PlayerId,
  locationId: LocationId,
): Array<{ slotIndex: number; type: ActionType; value?: number; itemInstId: CardInstId }> {
  const player = getPlayer(state, playerId);
  const locState = player.locationStates[locationId];
  if (!locState) return [];
  let extra = ITEM_SLOT_OFFSET;
  const result: Array<{ slotIndex: number; type: ActionType; value?: number; itemInstId: CardInstId }> = [];
  for (const cardId of locState.villainCardInstIds) {
    const card = state.allCards[cardId];
    if (card?.grantsActionSlot) {
      result.push({ slotIndex: extra, type: card.grantsActionSlot.type, value: card.grantsActionSlot.value, itemInstId: cardId });
      extra++;
    }
  }
  return result;
}

export function getActionAtSlot(
  state: GameState,
  playerId: PlayerId,
  slotIndex: number,
): { type: ActionType; value?: number } | undefined {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const locDef = plugin.locations.find(l => l.id === player.pawnLocationId);
  if (!locDef) return undefined;
  if (slotIndex < locDef.actions.length) return locDef.actions[slotIndex];
  return getItemGrantedSlotEntries(state, playerId, player.pawnLocationId).find(e => e.slotIndex === slotIndex);
}

export function getCoveredSlotIndices(
  state: GameState,
  playerId: PlayerId,
  locationId: LocationId,
): number[] {
  const player = getPlayer(state, playerId);
  const locState = player.locationStates[locationId];
  const locDef = getPlugin(player.villainId).locations.find(l => l.id === locationId);
  if (!locDef) return [];
  const heroCount = locState.heroCardInstIds.length;
  const coveredCount = heroCount > 0 ? Math.min(2, locDef.actions.length) : 0;
  return locDef.actions.slice(0, coveredCount).map((_, i) => i);
}

export function getAvailableSlotIndices(
  state: GameState,
  playerId: PlayerId,
  locationId: LocationId,
): number[] {
  const player = getPlayer(state, playerId);
  const locDef = getPlugin(player.villainId).locations.find(l => l.id === locationId);
  if (!locDef || player.locationStates[locationId].isLocked) return [];
  const covered = getCoveredSlotIndices(state, playerId, locationId);
  const used = state.usedActionSlotIndices;
  const base = locDef.actions.map((_, i) => i).filter(i => !covered.includes(i) && !used.includes(i));
  const extra = getItemGrantedSlotEntries(state, playerId, locationId)
    .filter(e => !used.includes(e.slotIndex))
    .map(e => e.slotIndex);
  return [...base, ...extra];
}

import { useState } from 'react';
import { ActionType, CardType } from '../core/types';
import type { GameState, CardInstId, LocationId } from '../core/types';
import { getPlugin, getEffectDef } from '../core/villains/registry';
import { getPlayer, getEffectiveStrength } from '../core/engine/stateHelpers';
import { getAvailableSlotIndices, ITEM_SLOT_OFFSET } from '../core/engine/slotHelpers';
import { canVanquish, canMoveItemAlly, canMoveHero } from '../core/engine/RuleEngine';
import { useGameStore } from '../state/gameStore';
import { useShallow } from 'zustand/react/shallow';

export function useActionPanelState(state: GameState, playerId: string) {
  const store = useGameStore(useShallow(s => ({
    doGainPower:       s.doGainPower,
    doFateStart:       s.doFateStart,
    doMovePawn:        s.doMovePawn,
    doSkipMove:        s.doSkipMove,
    doPlayCard:        s.doPlayCard,
    doVanquish:        s.doVanquish,
    doMoveItemAlly:    s.doMoveItemAlly,
    doMoveHero:        s.doMoveHero,
    doDrawCards:        s.doDrawCards,
    doEndActivate:      s.doEndActivate,
    doRevertToActivate: s.doRevertToActivate,
    doActivateCard:     s.doActivateCard,
    doDiscardFromHand:  s.doDiscardFromHand,
  })));
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);

  const [selectedCardId,    setSelectedCardId]    = useState<CardInstId | null>(null);
  const [selectedAllyIds,   setSelectedAllyIds]   = useState<CardInstId[]>([]);
  const [pendingSlot,       setPendingSlot]        = useState<number | null>(null);
  const [pendingAction,     setPendingAction]      = useState<ActionType | null>(null);
  const [targetLocId,       setTargetLocId]        = useState<LocationId | null>(null);
  const [targetCardId,      setTargetCardId]       = useState<CardInstId | null>(null);
  const [effectTargetLocId, setEffectTargetLocId]  = useState<LocationId | null>(null);
  const [useMapaId,         setUseMapaId]          = useState<CardInstId | null>(null);

  function resetSelection() {
    setSelectedCardId(null);
    setSelectedAllyIds([]);
    setTargetLocId(null);
    setTargetCardId(null);
    setUseMapaId(null);
  }

  function clearPending() {
    setPendingSlot(null);
    setPendingAction(null);
  }

  function handleSlotClick(slotIdx: number, actionOverride?: { type: ActionType; value?: number }) {
    const locDef = plugin.locations.find(l => l.id === player.pawnLocationId);
    if (!locDef) return;
    const slot = actionOverride ?? locDef.actions[slotIdx];
    setPendingSlot(slotIdx);
    setPendingAction(slot.type);
    resetSelection();
    if (slot.type === ActionType.GAIN_POWER) {
      store.doGainPower(slotIdx, actionOverride?.value);
      clearPending();
    }
    if (slot.type === ActionType.FATE) {
      store.doFateStart((state.currentPlayerIndex + 1) % state.players.length, slotIdx);
      clearPending();
    }
  }

  function execPlayCard() {
    if (pendingSlot === null || !selectedCardId || !targetLocId) return;
    const ctx: { mapaInstId?: CardInstId; targetCardInstId?: CardInstId; targetLocationId?: LocationId } = {};
    if (useMapaId)         ctx.mapaInstId        = useMapaId;
    if (targetCardId)      ctx.targetCardInstId   = targetCardId;
    if (effectTargetLocId) ctx.targetLocationId   = effectTargetLocId;
    store.doPlayCard(selectedCardId, pendingSlot, targetLocId, ctx);
    setEffectTargetLocId(null);
    resetSelection();
    clearPending();
  }

  function execVanquish() {
    if (pendingSlot === null || !selectedCardId || selectedAllyIds.length === 0) return;
    const result = canVanquish(state, playerId, selectedCardId, selectedAllyIds, pendingSlot);
    if (!result.valid) { alert(result.reason); return; }
    store.doVanquish(selectedCardId, selectedAllyIds, pendingSlot);
    resetSelection();
    clearPending();
  }

  function execMoveItemAlly() {
    if (pendingSlot === null || !selectedCardId || !targetLocId) return;
    const result = canMoveItemAlly(state, playerId, selectedCardId, targetLocId, pendingSlot);
    if (!result.valid) { alert(result.reason); return; }
    store.doMoveItemAlly(selectedCardId, targetLocId, pendingSlot);
    resetSelection();
    clearPending();
  }

  function execMoveHero() {
    if (pendingSlot === null || !selectedCardId || !targetLocId) return;
    const result = canMoveHero(state, playerId, selectedCardId, targetLocId, pendingSlot);
    if (!result.valid) { alert(result.reason); return; }
    store.doMoveHero(selectedCardId, targetLocId, pendingSlot);
    resetSelection();
    clearPending();
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const locDef = plugin.locations.find(l => l.id === player.pawnLocationId);
  const availableSlots = locDef ? getAvailableSlotIndices(state, playerId, player.pawnLocationId) : [];
  const extraSlots = (player.locationStates[player.pawnLocationId]?.villainCardInstIds ?? [])
    .map(cId => state.allCards[cId])
    .filter(c => c?.grantsActionSlot)
    .map((c, i) => ({
      slotIndex: ITEM_SLOT_OFFSET + i,
      slot: c!.grantsActionSlot!,
      itemName: c!.name,
    }));

  const kingdomCards = Object.values(player.locationStates)
    .flatMap(ls => [...ls.villainCardInstIds, ...ls.heroCardInstIds])
    .map(id => state.allCards[id])
    .filter(Boolean);

  const heroesInKingdom  = kingdomCards.filter(c => c.cardType === CardType.HERO);
  const alliesInKingdom  = kingdomCards.filter(c => c.cardType === CardType.ALLY);
  const movableCards     = kingdomCards.filter(
    c => (c.cardType === CardType.ALLY || c.cardType === CardType.ITEM || c.cardType === CardType.CURSE)
      && !c.attachedToInstId,
  );
  const allUnlockedLocs  = plugin.locations.filter(l => !player.locationStates[l.id]?.isLocked);

  // ── VANQUISH helpers ──────────────────────────────────────────────────────
  const vanquishCombinedStr = selectedAllyIds.reduce(
    (sum, id) => sum + getEffectiveStrength(state, id), 0,
  );

  function vanquishEligibleAllies(heroInstId: CardInstId) {
    const hero = state.allCards[heroInstId];
    if (!hero) return [];
    return alliesInKingdom.filter(ally => {
      if (ally.locationId === hero.locationId) return true;
      const canFromAdj = ally.effectIds.some(id => getEffectDef(id)?.canVanquishFromAdjacent);
      if (!canFromAdj) return false;
      const heroLocDef = plugin.locations.find(l => l.id === hero.locationId);
      return heroLocDef?.adjacentIds.includes(ally.locationId!) ?? false;
    });
  }

  return {
    store, player, plugin, locDef,
    selectedCardId,    setSelectedCardId,
    selectedAllyIds,   setSelectedAllyIds,
    pendingSlot,       setPendingSlot,
    pendingAction,     setPendingAction,
    targetLocId,       setTargetLocId,
    targetCardId,      setTargetCardId,
    effectTargetLocId, setEffectTargetLocId,
    useMapaId,         setUseMapaId,
    handleSlotClick,
    execPlayCard, execVanquish, execMoveItemAlly, execMoveHero,
    resetSelection, clearPending,
    availableSlots, extraSlots,
    kingdomCards, heroesInKingdom, alliesInKingdom, movableCards, allUnlockedLocs,
    vanquishCombinedStr, vanquishEligibleAllies,
  };
}

export type ActionPanelCtx = ReturnType<typeof useActionPanelState>;

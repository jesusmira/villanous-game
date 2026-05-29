import { CardType } from '../types';
import type { GameState, CardInstId, LocationId, PlayerId } from '../types';
import { getPlugin } from '../villains/registry';
import { EffectId, CardDefId } from '../villains/effectIds';
import { HookLocationId } from '../villains/hook/cards';
import { getPlayer } from '../engine/stateHelpers';

export function buildPlayCtx(
  state: GameState,
  playerId: PlayerId,
  cardInstId: CardInstId,
  _targetLocId: LocationId,
): { targetCardInstId?: CardInstId; auxiliaryInstIds?: CardInstId[]; targetLocationId?: LocationId } {
  const card = state.allCards[cardInstId];
  const ctx: { targetCardInstId?: CardInstId; targetLocationId?: LocationId } = {};

  // Espada de la Verdad: needs a hero to attach to
  if (card.effectIds.includes(EffectId.ESPADA_ON_PLAY)) {
    const player = getPlayer(state, playerId);
    for (const ls of Object.values(player.locationStates)) {
      const heroId = ls.heroCardInstIds.find(
        id => state.allCards[id]?.attachedItemInstIds.length === 0,
      );
      if (heroId) { ctx.targetCardInstId = heroId; break; }
    }
  }

  // ¡A la orden, señor!: mover un aliado adyacente al Jolly Roger cuando PP está allí
  if (card.effectIds.includes(EffectId.A_LA_ORDEN)) {
    const player3 = getPlayer(state, playerId);
    const ppAtJolly3 = player3.locationStates[HookLocationId.JOLLY_ROGER]?.heroCardInstIds.some(
      id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN,
    );
    if (ppAtJolly3) {
      const plugin3 = getPlugin(player3.villainId);
      const skullrockLs = player3.locationStates[HookLocationId.SKULL_ROCK];
      const allyId = skullrockLs?.villainCardInstIds.find(
        id => state.allCards[id]?.cardType === CardType.ALLY,
      );
      if (allyId) {
        const allyLoc = state.allCards[allyId]?.locationId;
        const allyLocDef = allyLoc ? plugin3.locations.find(l => l.id === allyLoc) : undefined;
        if (allyLocDef?.adjacentIds.includes(HookLocationId.JOLLY_ROGER)) {
          ctx.targetCardInstId = allyId;
          return { ...ctx, targetLocationId: HookLocationId.JOLLY_ROGER };
        }
      }
    }
  }

  // Sr. Starkey: mover héroe; priorizar PP hacia Jolly Roger
  if (card.effectIds.includes(EffectId.STARKEY_MOVE_HERO)) {
    const player = getPlayer(state, playerId);
    const plugin = getPlugin(player.villainId);
    let heroId: CardInstId | undefined;
    let heroLocId: LocationId | undefined;
    for (const [locId, ls] of Object.entries(player.locationStates)) {
      const ppId = ls.heroCardInstIds.find(id => state.allCards[id]?.defId === CardDefId.HOOK_PETER_PAN);
      if (ppId) { heroId = ppId; heroLocId = locId; break; }
    }
    if (!heroId) {
      for (const [locId, ls] of Object.entries(player.locationStates)) {
        if (ls.heroCardInstIds.length > 0) { heroId = ls.heroCardInstIds[0]; heroLocId = locId; break; }
      }
    }
    if (heroId && heroLocId) {
      const locDef = plugin.locations.find(l => l.id === heroLocId);
      const adjs = locDef?.adjacentIds ?? [];
      const dest = adjs.find(a => a === HookLocationId.JOLLY_ROGER)
        ?? adjs.find(a => !player.locationStates[a]?.isLocked)
        ?? adjs[0];
      if (dest) return { targetCardInstId: heroId, targetLocationId: dest };
    }
  }

  return ctx;
}

import type { GameState, PlayerState, CardInstId } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { assetUrl } from '../lib/assets';

const BOARD_IMAGES: Record<string, string> = {
  hook:       assetUrl('boards/hook.webp'),
  maleficent: assetUrl('boards/maleficent.webp'),
  jhon:       assetUrl('boards/jhon.webp'),
  queen:      assetUrl('boards/queen.webp'),
};
import { getCoveredSlotIndices, getAvailableSlotIndices, getHissChoiceSlotIndices } from '../core/engine/slotHelpers';
import { LocationTile } from './LocationTile';

interface Props {
  state: GameState;
  player: PlayerState;
  isActive: boolean;
  /** Aviso "contra ti": ubicación → clave que cambia en cada aviso (reinicia el pulso rojo). */
  alertLocKeys?: Record<string, number>;
  onCardClick: (id: CardInstId) => void;
  selectedCardId: CardInstId | null;
  /** ACTIVATE phase: called with slot index when a token is clicked */
  onActionSlotClick?: (slotIdx: number) => void;
  /** MOVE phase: called with location id when a valid destination is clicked */
  onLocationClick?: (locId: string) => void;
  /** MOVE phase: which location ids are valid move targets */
  movableLocIds?: string[];
  /** ACTIVATE phase: play highlights for the selected hand card */
  playHighlights?: Record<string, { playState: 'valid' | 'cant-afford' | 'blocked'; cost: number }>;
  /** ACTIVATE phase: called when a card is dropped on this location */
  onCardDrop?: (locId: string) => void;
  /** Fate click-select: clicking a valid location plays the selected fate card */
  onFateLocationClick?: (locId: string) => void;
  /** ACTIVATE phase: drag a villain card from the board */
  onVillainCardDragStart?: (cardId: string) => void;
  onVillainCardDragEnd?: () => void;
  /** ACTIVATE phase: drag a hero card from the board */
  onHeroCardDragStart?: (cardId: string) => void;
  onHeroCardDragEnd?: () => void;
  /** MOVE phase: raven card instance id */
  ravenInstId?: string;
  onRavenDragStart?: (cardId: string) => void;
  onRavenDragEnd?: () => void;
  /** MOVE phase: sheriff card instance id (Príncipe Juan) */
  sherifInstId?: string;
  onSherifDragStart?: (cardId: string) => void;
  onSherifDragEnd?: () => void;
}

export function PlayerBoard({ state, player, isActive, alertLocKeys, onCardClick, selectedCardId, onActionSlotClick, onLocationClick, movableLocIds, playHighlights, onCardDrop, onVillainCardDragStart, onVillainCardDragEnd, onHeroCardDragStart, onHeroCardDragEnd, onFateLocationClick, ravenInstId, onRavenDragStart, onRavenDragEnd, sherifInstId, onSherifDragStart, onSherifDragEnd }: Props) {
  const plugin        = getPlugin(player.villainId);

  // Héroes Agrandados (Reina de Corazones) de este Reino, indexados por la ubicación VECINA que
  // tapan — ver `isEnlarged`/`enlargedTargetLocationId`/`enlargedTargetSlotIndex` en CardInst y
  // `getCoveredSlotIndices` (slotHelpers.ts), que ya cuenta esa casilla como tapada. Se calcula
  // una vez aquí (recorre TODO el Reino) en vez de dentro de cada LocationTile, que solo conoce
  // su propia ubicación.
  const enlargedByTargetLoc = new Map<string, { slotIndex: number; card: typeof state.allCards[string] }[]>();
  for (const ls of Object.values(player.locationStates)) {
    for (const heroId of ls.heroCardInstIds) {
      const hero = state.allCards[heroId];
      if (!hero?.isEnlarged || !hero.enlargedTargetLocationId || hero.enlargedTargetSlotIndex === undefined) continue;
      const list = enlargedByTargetLoc.get(hero.enlargedTargetLocationId) ?? [];
      list.push({ slotIndex: hero.enlargedTargetSlotIndex, card: hero });
      enlargedByTargetLoc.set(hero.enlargedTargetLocationId, list);
    }
  }

  return (
    <article className="space-y-2 sm:space-y-5" data-player-board={player.id}>

      {/* La ficha del villano (avatar, objetivo, recursos) vive ahora en el desplegable de la barra
          superior (NavVillainChip); el tablero empieza directamente por las ubicaciones. */}

      {/* ── Location grid ────────────────────────────────── */}
      {/* Retrato (vertical): 1 ubicación a la vez, a todo el ancho, con scroll-snap. Horizontal
          (landscape, incluido desktop): sin cambios, las 4 en grid como siempre — el criterio es
          la orientación real, no el ancho, para que un móvil en landscape también quede como antes. */}
      <div className="overflow-x-auto landscape:overflow-x-visible snap-x snap-mandatory landscape:snap-none pb-2 scrollbar-hide">
        <div className="flex landscape:grid landscape:grid-cols-4 gap-3 md:gap-5 landscape:min-w-160 items-start relative z-20">
          {plugin.locations.map((locDef, locIndex) => {
            const locState      = player.locationStates[locDef.id];
            const covered        = getCoveredSlotIndices(state, player.id, locDef.id);
            const isPawnHere     = player.pawnLocationId === locDef.id;
            const available      = isActive && isPawnHere
              ? getAvailableSlotIndices(state, player.id, locDef.id)
              : [];
            const hissChoices    = isActive && isPawnHere
              ? getHissChoiceSlotIndices(state, player.id, locDef.id)
              : [];
            const isMovable      = movableLocIds?.includes(locDef.id) ?? false;
            const boardImageUrl  = BOARD_IMAGES[player.villainId] ?? null;
            return (
              <div key={locDef.id} className="w-full shrink-0 snap-center landscape:snap-align-none">
              <LocationTile
                locDef={locDef}
                locState={locState}
                state={state}
                villainColor={plugin.color}
                isCurrentPawn={isPawnHere}
                coveredSlotIndices={covered}
                availableSlotIndices={available}
                usedSlotIndices={isActive && isPawnHere ? state.usedActionSlotIndices : undefined}
                hissChoiceSlotIndices={hissChoices}
                alertKey={alertLocKeys?.[locDef.id]}
                selectedCardId={selectedCardId}
                onCardClick={onCardClick}
                onSlotClick={onActionSlotClick}
                onLocationClick={onLocationClick ? () => onLocationClick(locDef.id) : undefined}
                isMovableTarget={isMovable}
                playHighlight={playHighlights?.[locDef.id]}
                onCardDrop={onCardDrop ? () => onCardDrop(locDef.id) : undefined}
                onVillainCardDragStart={onVillainCardDragStart}
                onVillainCardDragEnd={onVillainCardDragEnd}
                onHeroCardDragStart={onHeroCardDragStart}
                onHeroCardDragEnd={onHeroCardDragEnd}
                onFateLocationClick={onFateLocationClick ? () => onFateLocationClick(locDef.id) : undefined}
                ravenInstId={ravenInstId}
                onRavenDragStart={onRavenDragStart}
                onRavenDragEnd={onRavenDragEnd}
                sherifInstId={sherifInstId}
                onSherifDragStart={onSherifDragStart}
                onSherifDragEnd={onSherifDragEnd}
                boardImageUrl={boardImageUrl}
                locationIndex={locIndex}
                remoteEnlargedCoverage={enlargedByTargetLoc.get(locDef.id)}
              />
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

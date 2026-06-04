import type { GameState, PlayerState, CardInstId } from '../core/types';
import { getPlugin } from '../core/villains/registry';

const BOARD_IMAGES: Record<string, string> = {
  hook:       '/images/boards/Hook.png',
  maleficent: '/images/boards/Maleficent.png',
};
import { getCoveredSlotIndices, getAvailableSlotIndices } from '../core/engine/stateHelpers';
import { LocationTile } from './LocationTile';
import { Zap, Layers, BookOpen, Star } from 'lucide-react';

interface Props {
  state: GameState;
  player: PlayerState;
  isActive: boolean;
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
}

/** Parse "✅ Foo | ❌ Bar" into typed chips */
function parseProgress(label: string | null): { done: boolean; text: string }[] {
  if (!label) return [];
  return label.split(' | ').map(item => ({
    done: item.startsWith('✅'),
    text: item.replace(/^[✅❌]\s*/, '').trim(),
  }));
}

export function PlayerBoard({ state, player, isActive, onCardClick, selectedCardId, onActionSlotClick, onLocationClick, movableLocIds, playHighlights, onCardDrop, onVillainCardDragStart, onVillainCardDragEnd, onHeroCardDragStart, onHeroCardDragEnd, onFateLocationClick }: Props) {
  const plugin        = getPlugin(player.villainId);
  const progressLabel = plugin.getWinProgress?.(state, player) ?? null;
  const progressItems = parseProgress(progressLabel);

  return (
    <article className="space-y-5">

      {/* ── Player header ────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">

          {/* Avatar circle */}
          <div
            className="w-12 h-12 md:w-14 md:h-14 rounded-full border-2 overflow-hidden shadow-[0_0_15px_rgba(233,195,73,0.35)] shrink-0 flex items-center justify-center"
            style={{ borderColor: plugin.color, background: `${plugin.color}22` }}
          >
            <span className="font-serif text-xl font-bold" style={{ color: plugin.color }}>
              {plugin.name.charAt(0)}
            </span>
          </div>

          {/* Name + inline progress chips */}
          <div className="flex flex-col gap-1">
            {/* Villain name + objective chips on same row */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2
                className="font-serif text-2xl md:text-3xl leading-none"
                style={{ color: isActive ? plugin.color : '#d3bcf9' }}
              >
                {plugin.name}
              </h2>

              {/* Progress chips inline — multi-step (Hook) */}
              {progressItems.length > 1 && (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <div className="hidden sm:block h-3.5 w-px bg-outline-variant/40 mx-1" />
                  {progressItems.map((item, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && (
                        <span className="text-outline-variant/30 text-xs">|</span>
                      )}
                      <span
                        className="font-stats text-[9px] uppercase tracking-wider"
                        style={{ color: item.done ? '#75fd00' : '#ffb4ab' }}
                      >
                        {item.done ? '✓' : '✗'} {item.text}
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {/* Single-line progress (Maléfica) */}
              {progressItems.length === 1 && (
                <span
                  className="font-stats text-[10px] uppercase tracking-wider"
                  style={{ color: plugin.color }}
                >
                  {progressItems[0].text}
                </span>
              )}
            </div>

            <p className="font-stats text-[9px] text-on-surface-variant uppercase tracking-widest">
              {player.name}
            </p>
          </div>
        </div>

        {/* Right side: turn badge + stats pill */}
        <div className="flex items-center gap-2">
          {/* "Tu turno" badge next to stats */}
          {isActive && (
            <div className="flex items-center gap-1.5 bg-secondary-container/10 border border-secondary-container/40 px-2.5 py-1 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse bg-secondary-container" />
              <span className="font-stats text-[9px] uppercase tracking-widest text-secondary-container">
                Tu turno
              </span>
            </div>
          )}

          {/* Stats pill */}
          <div className="bg-surface-container-low/60 backdrop-blur-md border border-outline-variant/40 px-3 py-1.5 rounded-full flex items-center gap-3 shadow-xl">
            <div className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-secondary-container" fill="currentColor" />
              <span className="font-stats text-sm font-bold">{player.power}</span>
            </div>
            <div className="w-px h-3 bg-outline-variant/40" />
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-primary" />
              <span className="font-stats text-sm">{player.handInstIds.length}</span>
            </div>
            <div className="w-px h-3 bg-outline-variant/40" />
            <div className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-on-surface-variant" />
              <span className="font-stats text-sm">{player.villainDeckInstIds.length}</span>
            </div>
            <div className="w-px h-3 bg-outline-variant/40" />
            <div className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-error" />
              <span className="font-stats text-sm">{player.fateDeckInstIds.length}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Location grid ────────────────────────────────── */}
      <div className="overflow-x-auto lg:overflow-x-visible pb-2 scrollbar-hide">
        <div className="grid grid-cols-4 gap-3 md:gap-5 min-w-160 lg:min-w-0 items-start">
          {plugin.locations.map((locDef, locIndex) => {
            const locState      = player.locationStates[locDef.id];
            const covered        = getCoveredSlotIndices(state, player.id, locDef.id);
            const isPawnHere     = player.pawnLocationId === locDef.id;
            const available      = isActive && isPawnHere
              ? getAvailableSlotIndices(state, player.id, locDef.id)
              : [];
            const isMovable      = movableLocIds?.includes(locDef.id) ?? false;
            const boardImageUrl  = BOARD_IMAGES[player.villainId] ?? null;
            return (
              <LocationTile
                key={locDef.id}
                locDef={locDef}
                locState={locState}
                state={state}
                villainColor={plugin.color}
                isCurrentPawn={isPawnHere}
                coveredSlotIndices={covered}
                availableSlotIndices={available}
                selectedCardId={selectedCardId}
                onCardClick={onCardClick}
                onSlotClick={onActionSlotClick}
                onLocationClick={isMovable ? () => onLocationClick?.(locDef.id) : undefined}
                isMovableTarget={isMovable}
                playHighlight={playHighlights?.[locDef.id]}
                onCardDrop={onCardDrop ? () => onCardDrop(locDef.id) : undefined}
                onVillainCardDragStart={onVillainCardDragStart}
                onVillainCardDragEnd={onVillainCardDragEnd}
                onHeroCardDragStart={onHeroCardDragStart}
                onHeroCardDragEnd={onHeroCardDragEnd}
                onFateLocationClick={onFateLocationClick ? () => onFateLocationClick(locDef.id) : undefined}
                boardImageUrl={boardImageUrl}
                locationIndex={locIndex}
              />
            );
          })}
        </div>
      </div>
    </article>
  );
}

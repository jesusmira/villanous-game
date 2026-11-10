import type { ReactNode } from 'react';
import type { GameState, PlayerState, CardInstId } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { Image } from './Image';
import { assetUrl } from '../lib/assets';

/**
 * Estadística de la píldora con tooltip accesible: aparece con hover (ratón) y con
 * focus (un toque en táctil, gracias a tabIndex). Se cierra al tocar fuera (blur).
 */
function StatTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative group flex items-center gap-0.5 sm:gap-1 outline-none" tabIndex={0}>
      {children}
      <span
        className="pointer-events-none absolute top-full right-0 mt-2 whitespace-nowrap rounded-md
          bg-[#120e1a]/95 border border-gold/35 px-2 py-1 font-stats text-[9px] uppercase
          tracking-wider text-on-surface opacity-0 transition-opacity duration-150 z-50
          group-hover:opacity-100 group-focus:opacity-100 group-active:opacity-100"
        role="tooltip"
      >
        {label}
      </span>
    </div>
  );
}

const BOARD_IMAGES: Record<string, string> = {
  hook:       assetUrl('boards/hook.webp'),
  maleficent: assetUrl('boards/maleficent.webp'),
  jhon:       assetUrl('boards/jhon.webp'),
  queen:      assetUrl('boards/queen.webp'),
};
import { getCoveredSlotIndices, getAvailableSlotIndices, getHissChoiceSlotIndices } from '../core/engine/slotHelpers';
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
  /** MOVE phase: raven card instance id */
  ravenInstId?: string;
  onRavenDragStart?: (cardId: string) => void;
  onRavenDragEnd?: () => void;
  /** MOVE phase: sheriff card instance id (Príncipe Juan) */
  sherifInstId?: string;
  onSherifDragStart?: (cardId: string) => void;
  onSherifDragEnd?: () => void;
}

/** Parse "✅ Foo | ❌ Bar" into typed chips */
function parseProgress(label: string | null): { done: boolean; text: string }[] {
  if (!label) return [];
  return label.split(' | ').map(item => ({
    done: item.startsWith('✅'),
    text: item.replace(/^[✅❌]\s*/, '').trim(),
  }));
}

export function PlayerBoard({ state, player, isActive, onCardClick, selectedCardId, onActionSlotClick, onLocationClick, movableLocIds, playHighlights, onCardDrop, onVillainCardDragStart, onVillainCardDragEnd, onHeroCardDragStart, onHeroCardDragEnd, onFateLocationClick, ravenInstId, onRavenDragStart, onRavenDragEnd, sherifInstId, onSherifDragStart, onSherifDragEnd }: Props) {
  const plugin        = getPlugin(player.villainId);
  const progressLabel = plugin.getWinProgress?.(state, player) ?? null;
  const progressItems = parseProgress(progressLabel);

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

      {/* ── Placa del villano: avatar, nombre, objetivo y recursos en una sola banda ── */}
      <header
        className={`villain-plaque ${isActive ? 'is-active' : ''} flex flex-wrap items-center justify-between gap-2 sm:gap-4 pl-1 pr-2 sm:pr-3 py-1`}
        style={{ '--villain-color': plugin.color }}
      >
        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto sm:flex-1 min-w-0">

          {/* Avatar con anillo de oro labrado */}
          <div className="villain-avatar-ring shrink-0">
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-full overflow-hidden flex items-center justify-center bg-black"
              style={{ boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.8), inset 0 0 18px ${plugin.color}55` }}
            >
              <Image
                src={assetUrl(`villains/${player.villainId}.webp`)}
                className="w-full h-full object-cover scale-150"
              />
            </div>
          </div>

          {/* Nombre + objetivo */}
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2
                className="font-serif font-semibold text-base sm:text-lg md:text-xl lg:text-2xl leading-none tracking-[0.04em]"
                style={{
                  color: isActive ? '#f6dd94' : '#e3d6f2',
                  textShadow: isActive
                    ? '0 1px 2px rgba(0,0,0,0.9), 0 0 18px rgba(230,196,106,0.35)'
                    : '0 1px 2px rgba(0,0,0,0.9)',
                }}
              >
                {plugin.name}
              </h2>

              {/* Objetivo en varios pasos (Garfio…) */}
              {progressItems.length > 1 && (
                <div className="flex flex-wrap items-center gap-1">
                  {progressItems.map((item, i) => (
                    <span
                      key={i}
                      className={`flex items-center gap-1 whitespace-nowrap px-1.5 py-px rounded-full border font-stats text-[9px] font-medium uppercase tracking-wider ${
                        item.done
                          ? 'border-gold/50 bg-gold/10 text-gold-bright'
                          : 'border-white/10 bg-black/25 text-on-surface-variant/70'
                      }`}
                    >
                      <span className={item.done ? 'text-gold-bright' : 'text-on-surface-variant/40'}>{item.done ? '◆' : '◇'}</span>
                      {item.text}
                    </span>
                  ))}
                </div>
              )}

              {/* Objetivo de una línea (Maléfica…) */}
              {progressItems.length === 1 && (
                <span className="font-narrative italic text-sm text-[#e8dcc4]/85 leading-none">
                  {progressItems[0].text}
                </span>
              )}
            </div>

            <p className="font-stats text-[9px] font-medium text-on-surface-variant/70 uppercase tracking-[0.22em] whitespace-nowrap">
              {player.name}
            </p>
          </div>
        </div>

        {/* Derecha: turno + recursos (en móvil vertical, segunda línea a todo el ancho) */}
        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto pl-1 sm:pl-0">
          {isActive && (
            <div className="flex items-center gap-1.5 bg-gold/10 border border-gold/45 px-2.5 py-1 rounded-full shadow-[0_0_12px_rgba(230,196,106,0.2)]">
              <div className="w-1.5 h-1.5 rounded-full bg-gold-bright shadow-[0_0_6px_#f6dd94] animate-pulse" />
              <span className="font-stats text-[9px] font-semibold uppercase tracking-[0.2em] text-gold-bright whitespace-nowrap">
                Tu turno
              </span>
            </div>
          )}

          {/* Recursos */}
          <div className="bg-black/35 backdrop-blur-md border border-white/8 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full flex items-center gap-2 sm:gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_6px_16px_rgba(0,0,0,0.5)]">
            <StatTip label="Poder (Monedas)">
              <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center bg-[radial-gradient(circle_at_35%_30%,#f6dd94_0%,#b8862f_70%,#6b4d1c_100%)] shadow-[0_0_8px_rgba(230,196,106,0.45),inset_0_-1px_0_rgba(0,0,0,0.3)]">
                <Zap className="w-2.5 sm:w-3 h-2.5 sm:h-3 text-[#3a2808]" fill="currentColor" />
              </span>
              <span className="font-stats text-sm sm:text-base font-bold text-gold-bright">{player.power}</span>
            </StatTip>
            <div className="hidden sm:block w-px h-3.5 bg-white/10" />
            <StatTip label="Cartas en mano">
              <Star className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-primary" />
              <span className="font-stats text-xs sm:text-sm font-semibold">{player.handInstIds.length}</span>
            </StatTip>
            <div className="hidden sm:block w-px h-3.5 bg-white/10" />
            <StatTip label="Mazo de Villano restante">
              <Layers className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-on-surface-variant" />
              <span className="font-stats text-xs sm:text-sm font-semibold">{player.villainDeckInstIds.length}</span>
            </StatTip>
            <div className="hidden sm:block w-px h-3.5 bg-white/10" />
            <StatTip label="Mazo de Destino restante">
              <BookOpen className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-error" />
              <span className="font-stats text-xs sm:text-sm font-semibold">{player.fateDeckInstIds.length}</span>
            </StatTip>
          </div>
        </div>
      </header>

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

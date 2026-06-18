import { CardDeck } from '../core/types';
import type { LocationDef, LocationState, GameState, CardInstId } from '../core/types';
import { CardComponent } from './CardComponent';
import { useState } from 'react';
import { Crown } from 'lucide-react';
import { ACTION_IMG } from './shared/actionImages';
import { assetUrl } from '../lib/assets';

/* Border color class per action type */
const ACTION_BORDER: Record<string, string> = {
  GAIN_POWER:     'border-primary',
  PLAY_CARD:      'border-primary',
  ACTIVATE_CARD:  'border-primary',
  FATE:           'border-error',
  VANQUISH:       'border-error',
  DISCARD:        'border-error',
  MOVE_HERO:      'border-secondary-fixed',
  MOVE_ITEM_ALLY: 'border-secondary-fixed',
};

const ACTION_TEXT_COLOR: Record<string, string> = {
  GAIN_POWER:     'text-primary',
  PLAY_CARD:      'text-primary',
  ACTIVATE_CARD:  'text-primary',
  FATE:           'text-error',
  VANQUISH:       'text-error',
  DISCARD:        'text-error',
  MOVE_HERO:      'text-secondary-fixed',
  MOVE_ITEM_ALLY: 'text-secondary-fixed',
};

const ACTION_LABELS: Record<string, string> = {
  GAIN_POWER:     'Ganar Poder',
  PLAY_CARD:      'Jugar Carta',
  MOVE_ITEM_ALLY: 'Mover Obj/Ali',
  MOVE_HERO:      'Mover Héroe',
  VANQUISH:       'Vencer',
  ACTIVATE_CARD:  'Activar',
  FATE:           'Destino',
  DISCARD:        'Descartar',
};

interface Props {
  locDef: LocationDef;
  locState: LocationState;
  state: GameState;
  villainColor: string;
  isCurrentPawn: boolean;
  coveredSlotIndices: number[];
  availableSlotIndices: number[];
  /** Casillas tapadas que Sir Hiss permite elegir (clicables aunque estén tapadas). */
  hissChoiceSlotIndices?: number[];
  selectedCardId: CardInstId | null;
  onSlotClick?: (slotIndex: number) => void;
  onCardClick: (cardInstId: CardInstId) => void;
  /** MOVE phase: click the whole tile to move pawn here */
  onLocationClick?: (locId?: string) => void;
  /** MOVE phase: this location is a valid movement destination */
  isMovableTarget?: boolean;
  /** ACTIVATE phase: highlight when a hand card is selected */
  playHighlight?: { playState: 'valid' | 'cant-afford' | 'blocked'; cost: number };
  /** ACTIVATE phase: called when a card is dropped here */
  onCardDrop?: () => void;
  /** Fate click-select: clicking this location plays the selected fate card */
  onFateLocationClick?: () => void;
  /** ACTIVATE phase: drag a villain card from this tile */
  onVillainCardDragStart?: (cardId: string) => void;
  onVillainCardDragEnd?: () => void;
  /** ACTIVATE phase: drag a hero card from this tile */
  onHeroCardDragStart?: (cardId: string) => void;
  onHeroCardDragEnd?: () => void;
  /** MOVE phase: raven card instance id — makes that card draggable to any location */
  ravenInstId?: string;
  onRavenDragStart?: (cardId: string) => void;
  onRavenDragEnd?: () => void;
  /** MOVE phase: sheriff card instance id — draggable to adjacent locations */
  sherifInstId?: string;
  onSherifDragStart?: (cardId: string) => void;
  onSherifDragEnd?: () => void;
  /** Board artwork image URL for this villain */
  boardImageUrl?: string | null;
  /** Index of this location in the villain's location array (0–3) */
  locationIndex?: number;
}

export function LocationTile({
  locDef, locState, state, villainColor, isCurrentPawn,
  coveredSlotIndices, availableSlotIndices, hissChoiceSlotIndices = [], selectedCardId,
  onSlotClick, onCardClick,
  onLocationClick, isMovableTarget, playHighlight, onCardDrop,
  boardImageUrl, locationIndex = 0,
  onVillainCardDragStart, onVillainCardDragEnd,
  onHeroCardDragStart, onHeroCardDragEnd,
  onFateLocationClick,
  ravenInstId, onRavenDragStart, onRavenDragEnd,
  sherifInstId, onSherifDragStart, onSherifDragEnd,
}: Props) {
  const [isDragOver, setIsDragOver] = useState(false);

  // CSS background-position: 4 equal sections → 0%, 33.33%, 66.67%, 100%
  const bgPos = `${locationIndex * (100 / 3)}% center`;
  const allFromVillainSlot = locState.villainCardInstIds.map(id => state.allCards[id]).filter(Boolean);
  // Fate items (Polvo de Hada, Burla, etc.) live in villainCardInstIds but belong at the TOP with heroes
  const fateItemCards  = allFromVillainSlot.filter(c => c.deck === CardDeck.FATE && c.instId);
  const villainCards   = allFromVillainSlot.filter(c => c.deck !== CardDeck.FATE && c.instId);
  const heroCards      = locState.heroCardInstIds.map(id => state.allCards[id]).filter(c => c && c.instId);
  // TOP overlay: hero cards + fate items (enemies/threats)
  const topCards       = [...heroCards, ...fateItemCards];
  // BOTTOM ally zone: villain deck cards only (allies, items, curses, effects)
  const allyZoneCards  = villainCards;

  /* Split action slots: normal = 2 top + 2 bottom; actionsInBottomRow = 0 top + all bottom */
  const row1 = locDef.actionsInBottomRow ? [] : locDef.actions.slice(0, 2);
  const row2Slots = locDef.actionsInBottomRow
    ? locDef.actions.map((slot, i) => ({ slot, idx: i }))
    : locDef.actions.slice(2, 4).map((slot, i) => ({ slot, idx: i + 2 }));

  return (
    <div className="flex flex-col gap-2">

      {/* ── Location card ─────────────────────────────────── */}
      <div className="relative w-full aspect-3/4">

        {/* ── Top overlay: hero cards + fate items ─────────────── */}
        {topCards.length > 0 && (
          <div className={`absolute top-0 inset-x-0 z-30 flex pointer-events-none ${topCards.length === 1 ? 'justify-center' : ''}`}
            style={{
              marginLeft: topCards.length > 1 ? '2px' : '0px',
              marginRight: topCards.length > 1 ? `${(topCards.length - 1) * 20}px` : '0px',
            }}>
            {topCards.map((card, idx) => {
              const isHero = heroCards.includes(card);
              return (
                <div key={card.instId}
                  className="pointer-events-auto hover:z-10 hover:-translate-y-2 transition-transform duration-200 shrink-0 drop-shadow-[0_15px_30px_rgba(0,0,0,0.8)]"
                  style={{ marginLeft: idx === 0 ? '0px' : '-40px' }}
                >
                  <CardComponent
                    card={card}
                    state={state}
                    selected={selectedCardId === card.instId}
                    onClick={() => onCardClick(card.instId)}
                    draggable={isHero && !!onHeroCardDragStart}
                    onDragStart={isHero && onHeroCardDragStart ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.instId); onHeroCardDragStart(card.instId); } : undefined}
                    onDragEnd={isHero ? () => onHeroCardDragEnd?.() : undefined}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* ── Visual background — starts at 15% to leave room for hero overlay ── */}
        <div
          onClick={onFateLocationClick && playHighlight?.playState === 'valid' ? onFateLocationClick : onLocationClick ? () => onLocationClick(locDef.id) : undefined}
          onDragOver={onCardDrop ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsDragOver(true); } : undefined}
          onDragLeave={onCardDrop ? () => setIsDragOver(false) : undefined}
          onDrop={onCardDrop ? (e) => { e.preventDefault(); setIsDragOver(false); onCardDrop(); } : undefined}
          className={`absolute inset-x-0 bottom-0 rounded-xl overflow-hidden transition-all duration-150 pointer-events-auto
            ${locState.isLocked
              ? 'border border-outline-variant/30 cursor-not-allowed'
              : isMovableTarget
                ? 'border-2 border-secondary-container cursor-pointer scale-[1.02] shadow-[0_0_18px_rgba(117,253,0,0.35)]'
                : isDragOver && playHighlight?.playState === 'valid'
                  ? 'border-2 border-green-300 scale-[1.04]'
                  : playHighlight?.playState === 'valid'
                    ? 'border-2 border-green-400 scale-[1.02]'
                    : playHighlight?.playState === 'cant-afford'
                      ? 'border-2 border-amber-400'
                      : playHighlight?.playState === 'blocked'
                        ? 'border-2 border-red-500/60'
                        : 'gold-border hover:scale-[1.01]'}
            ${isCurrentPawn ? 'pawn-glow' : 'location-glow'}
          `}
          style={{
            top: '15%', height: '85%',
            boxShadow: isDragOver && playHighlight?.playState === 'valid'
              ? '0 0 30px rgba(74,222,128,0.7), 0 0 8px rgba(74,222,128,0.4)'
              : playHighlight?.playState === 'valid'
                ? '0 0 20px rgba(74,222,128,0.45)'
                : playHighlight?.playState === 'cant-afford'
                  ? '0 0 16px rgba(251,191,36,0.35)'
                  : playHighlight?.playState === 'blocked'
                    ? '0 0 12px rgba(239,68,68,0.25)'
                    : undefined,
          }}
        >
          {/* Board artwork image */}
          {boardImageUrl && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${boardImageUrl})`,
                backgroundSize: '400% auto',
                backgroundPosition: bgPos,
                backgroundRepeat: 'no-repeat',
              }}
            />
          )}

          {/* Gradient overlays for readability */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: boardImageUrl
              ? `linear-gradient(160deg, ${villainColor}22 0%, rgba(14,14,14,0.2) 100%)`
              : `linear-gradient(160deg, ${villainColor}28 0%, #0e0e0e 65%)` }} />
          <div className="absolute inset-0 pointer-events-none bg-linear-to-t from-background/75 via-background/10 to-transparent" />

          {/* Locked overlay */}
          {locState.isLocked && (
            <>
              <div className="absolute inset-0 bg-background/65 backdrop-blur-[2px]" />
              <div className="absolute bottom-2 right-2 z-10">
                <div className="rounded-2xl overflow-hidden border border-outline-variant/20 w-16 h-16">
                  <img
                    src={assetUrl('ui/lock.webp')}
                    alt="Bloqueado"
                    className="w-full h-full object-cover opacity-80"
                  />
                </div>
              </div>
            </>
          )}

          {/* Pawn indicator */}
          {isCurrentPawn && !locState.isLocked && (
            <div className="absolute top-2 right-2 z-20 animate-pulse">
              <Crown
                className="w-7 h-7"
                strokeWidth={1.5}
                style={{
                  color: 'rgba(255,255,255,0.95)',
                  fill: 'rgba(255,255,255,0.12)',
                  filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.9)) drop-shadow(0 0 12px rgba(255,255,255,0.5))',
                }}
              />
            </div>
          )}

          {/* Location name + coste badge */}
          <div className="absolute inset-0 flex flex-col justify-end items-center p-3 gap-1.5">
            {playHighlight && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-stats text-[10px] font-bold border ${
                playHighlight.playState === 'valid'
                  ? 'bg-green-900/70 border-green-400/60 text-green-300'
                  : playHighlight.playState === 'cant-afford'
                    ? 'bg-amber-900/70 border-amber-400/60 text-amber-300'
                    : 'bg-red-900/50 border-red-500/40 text-red-400'
              }`}>
                {playHighlight.playState === 'valid'        && '✓'}
                {playHighlight.playState === 'cant-afford'  && '✗'}
                {playHighlight.playState === 'blocked'      && '⊘'}
                {playHighlight.cost > 0 && <span>{playHighlight.cost}</span>}
              </div>
            )}
            {/* Desktop: título normal */}
            <h3 className="hidden lg:block font-serif text-[10px] md:text-xs uppercase tracking-[0.18em] text-center"
              style={{ color: locState.isLocked ? '#948e99' : '#d3bcf9' }}>
              {locDef.name}
            </h3>

            {/* Mobile: botón clicable */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLocationClick?.(locDef.id);
              }}
              disabled={!onLocationClick && !onCardDrop}
              className="lg:hidden font-serif text-[10px] uppercase tracking-[0.18em] px-2 py-1 rounded border transition-all active:scale-95 min-h-8 w-full"
              style={{
                color: locState.isLocked ? '#948e99' : '#d3bcf9',
                borderColor: !onLocationClick && !onCardDrop ? '#948e9955' : '#d3bcf9',
                background: !onLocationClick && !onCardDrop ? '#0000' : '#d3bcf922',
              }}>
              {locDef.name}
            </button>
          </div>
        </div>

        {/* ── Action tokens — always visible; greyed out when locked ── */}
        <div className={`absolute inset-x-0 bottom-0 flex flex-col justify-between items-center py-4 px-2 pointer-events-none transition-opacity ${locState.isLocked ? 'opacity-30' : ''}`}
          style={{ top: '15%', height: '85%' }}>
          <div className="flex justify-center gap-3 w-full pointer-events-auto">
            {row1.map((slot, idx) => (
              <ActionToken
                key={idx}
                slotType={slot.type}
                slotValue={slot.value}
                covered={locState.isLocked || coveredSlotIndices.includes(idx)}
                available={!locState.isLocked && availableSlotIndices.includes(idx)}
                hissChoice={!locState.isLocked && hissChoiceSlotIndices.includes(idx)}
                onClick={() => onSlotClick?.(idx)}
              />
            ))}
          </div>
          <div className="flex justify-center gap-3 w-full mb-10 pointer-events-auto">
            {row2Slots.map(({ slot, idx }) => (
              <ActionToken
                key={idx}
                slotType={slot.type}
                slotValue={slot.value}
                covered={locState.isLocked || coveredSlotIndices.includes(idx)}
                available={!locState.isLocked && availableSlotIndices.includes(idx)}
                hissChoice={!locState.isLocked && hissChoiceSlotIndices.includes(idx)}
                onClick={() => onSlotClick?.(idx)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Ally / villain card zone — heroes NOT here ──────── */}
      <div className="card-slot ally-zone group hover:border-secondary-container/40 transition-colors min-h-30 md:min-h-40">
        {allyZoneCards.length === 0 ? (
          <span className="absolute bottom-1 left-2 font-stats text-[7px] text-secondary-container/50 uppercase tracking-wider group-hover:text-secondary-container/70 transition-colors">
            Aliados y objetos
          </span>
        ) : (
          /* Stacked cards - overlap based on count */
          <div className={`flex transition-all duration-200 ${allyZoneCards.length === 1 ? 'justify-center w-full' : ''}`}
            style={{
              marginLeft: allyZoneCards.length > 1 ? '2px' : '0px',
              gap: '0px',
              marginRight: allyZoneCards.length > 1 ? `${(allyZoneCards.length - 1) * 20}px` : '0px'
            }}>
            {allyZoneCards.map((card, idx) => {
              const isRaven  = card.instId === ravenInstId  && !!onRavenDragStart;
              const isSherif = card.instId === sherifInstId && !!onSherifDragStart;
              return (
              <div key={card.instId}
                className="hover:z-10 hover:-translate-y-2 transition-transform duration-200 shrink-0"
                style={{ marginLeft: idx === 0 ? '0px' : '-40px' }}>
                <CardComponent
                  card={card}
                  state={state}
                  selected={selectedCardId === card.instId}
                  onClick={() => onCardClick(card.instId)}
                  draggable={isRaven || isSherif || !!onVillainCardDragStart}
                  onDragStart={
                    isRaven
                      ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.instId); onRavenDragStart!(card.instId); }
                      : isSherif
                        ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.instId); onSherifDragStart!(card.instId); }
                        : (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.instId); onVillainCardDragStart?.(card.instId); }
                  }
                  onDragEnd={() => isRaven ? onRavenDragEnd?.() : isSherif ? onSherifDragEnd?.() : onVillainCardDragEnd?.()}
                />
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Action token sub-component ──────────────────────────── */
interface ActionTokenProps {
  slotType: string;
  slotValue?: number;
  covered: boolean;
  available: boolean;
  /** Casilla tapada que Sir Hiss permite elegir: clicable y resaltada pese a estar tapada. */
  hissChoice?: boolean;
  onClick: () => void;
}

function ActionToken({ slotType, slotValue, covered, available, hissChoice = false, onClick }: ActionTokenProps) {
  const borderClass  = ACTION_BORDER[slotType] ?? 'border-primary';
  const textClass    = ACTION_TEXT_COLOR[slotType] ?? 'text-primary';
  const imgSrc       = ACTION_IMG[slotType];
  // Una casilla ofrecida por Sir Hiss se trata como utilizable, no como tapada.
  const blocked      = covered && !hissChoice;
  const label        = hissChoice
    ? `Sir Hiss: ${ACTION_LABELS[slotType] ?? slotType}`
    : (blocked ? 'Tapado por un Héroe' : (ACTION_LABELS[slotType] ?? slotType));
  const isGainPower  = slotType === 'GAIN_POWER';

  return (
    /* group wrapper: hosts both the corner badge and the tooltip */
    <div className="relative group">
      <button
        disabled={blocked || !available}
        onClick={onClick}
        className={`
          relative w-12 h-12 md:w-14 md:h-14 rounded-full border-2
          overflow-hidden shadow-lg
          transition-all duration-150
          ${blocked ? 'opacity-25 cursor-not-allowed' : 'cursor-pointer hover:scale-110 hover:brightness-110 active:scale-95'}
          ${hissChoice
            ? 'border-tertiary ring-2 ring-tertiary/70 shadow-[0_0_14px_rgba(211,188,249,0.6)] animate-pulse'
            : available && !covered ? borderClass : 'border-outline-variant/40'}
        `}
      >
        {/* Image fills the entire circle */}
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={label}
            className={`absolute inset-0 w-full h-full object-cover ${blocked ? 'grayscale' : ''}`}
          />
        ) : (
          <span className={`font-stats text-xs font-bold ${textClass}`}>?</span>
        )}

        {/* GAIN_POWER: value number centered on top of the image — gold color */}
        {isGainPower && slotValue !== undefined && (
          <span
            className="absolute inset-0 flex items-center justify-center font-stats font-bold text-lg md:text-xl leading-none"
            style={{
              color: '#e9c349',
              textShadow: '0 0 8px rgba(0,0,0,1), 0 1px 4px rgba(0,0,0,0.9)',
            }}
          >
            {slotValue}
          </span>
        )}
      </button>

      {/* Tooltip — appears above the token on hover */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none
        opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0
        transition-all duration-150">
        <div className="bg-surface-container-highest border border-outline-variant/60 rounded px-2 py-1 whitespace-nowrap shadow-xl">
          <span className="font-stats text-[9px] text-on-surface uppercase tracking-wider">
            {label}
          </span>
        </div>
        {/* Arrow */}
        <div className="w-2 h-2 bg-surface-container-highest border-b border-r border-outline-variant/60 rotate-45 mx-auto -mt-1" />
      </div>

      {/* Corner badge for non-GAIN_POWER slots with a value (outside overflow-hidden) */}
      {!isGainPower && slotValue !== undefined && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-tertiary text-on-tertiary font-stats font-bold text-[8px] flex items-center justify-center shadow-md z-10">
          {slotValue}
        </span>
      )}
    </div>
  );
}

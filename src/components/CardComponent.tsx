import type { CardInst, GameState } from '../core/types';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { Image } from './Image';
import { assetUrl } from '../lib/assets';
import { useDragSource } from '../hooks/dragCore';

interface Props {
  card: CardInst;
  state: GameState;
  selected?: boolean;
  onClick?: () => void;
  /** Habilita arrastre por puntero (ratón + táctil). */
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Clases extra que sobreescriben el tamaño por defecto (mano móvil, vista de detalle). */
  sizeClassName?: string;
  /** Marca la carta para el Modo Enfoque por hover prolongado (ver GameBoard). Solo tablero y mano. */
  inspectable?: boolean;
}

const CARD_GRADIENTS: Record<string, string> = {
  ALLY:      'linear-gradient(160deg, #1a3320 0%, #0f1a12 100%)',
  ITEM:      'linear-gradient(160deg, #1a2b3a 0%, #0f1520 100%)',
  EFFECT:    'linear-gradient(160deg, #2a1a35 0%, #15101f 100%)',
  CURSE:     'linear-gradient(160deg, #1a1025 0%, #0e0c18 100%)',
  HERO:      'linear-gradient(160deg, #3a2010 0%, #1f1008 100%)',
  CONDITION: 'linear-gradient(160deg, #2a2a10 0%, #181808 100%)',
};


export function CardComponent({ card, state, selected, onClick, draggable: isDraggable, onDragStart, onDragEnd, sizeClassName, inspectable }: Props) {
  const { onPointerDown } = useDragSource({ disabled: !isDraggable, onStart: onDragStart, onEnd: onDragEnd });
  const effectiveStr = card.baseStrength !== undefined ? getEffectiveStrength(state, card.instId) : undefined;
  const baseStr      = card.baseStrength ?? 0;
  const hasBonus     = effectiveStr !== undefined && effectiveStr !== baseStr;
  const isHero       = card.cardType === 'HERO';

  const imageUrl = card.imageFile
    ? assetUrl(`cards/${card.villainId}/${card.imageFile}.webp`)
    : null;

  // Reina de Corazones: un Soldado Naipe convertido en Postigo se gira 90° para distinguirlo
  // de un vistazo, igual que en el tablero físico. Un Héroe Menguado gira 45° y uno Agrandado
  // 90° (ver getCoveredSlotIndices para el efecto real sobre las casillas tapadas).
  const isWicket = card.isWicket === true;
  const rotationClass = isWicket || card.isEnlarged ? 'rotate-90' : card.isShrunk ? 'rotate-45' : '';

  return (
    <div
      className={`villainous-card ${sizeClassName ?? ''} ${isHero ? 'hero-card' : ''} ${rotationClass} ${selected ? 'is-selected' : ''} ${onClick ? 'is-interactive cursor-pointer' : ''} ${isDraggable ? 'cursor-grab active:cursor-grabbing touch-none select-none' : ''}`}
      onClick={onClick}
      title={inspectable ? undefined : card.name}
      data-inspect-id={inspectable ? card.instId : undefined}
      onPointerDown={isDraggable ? onPointerDown : undefined}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Gradient fallback */}
      <div
        className="card-bg"
        style={{ background: CARD_GRADIENTS[card.cardType] ?? 'linear-gradient(160deg, #2a2a3a 0%, #1a1a1a 100%)' }}
      />
      {/* Card artwork — React-controlled, resets on src change */}
      {imageUrl && <Image src={imageUrl} className="card-art" />}

      {/* Strength badge — solo si tiene bonificadores */}
      {hasBonus && (
        <div className="card-strength-badge">{effectiveStr}</div>
      )}

      {/* Stored power badge (Little John) */}
      {(card.storedPower ?? 0) > 0 && (
        <div className="card-stored-power-badge">{card.storedPower}</div>
      )}

    </div>
  );
}

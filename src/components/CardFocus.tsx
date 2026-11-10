import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { CardDeck } from '../core/types';
import type { CardInst, GameState } from '../core/types';
import { getCardDef, getEffectDef } from '../core/villains/registry';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { CardComponent } from './CardComponent';

const TYPE_LABELS_ES: Record<string, string> = {
  ALLY:      'Aliado',
  ITEM:      'Objeto',
  EFFECT:    'Efecto',
  CURSE:     'Maldición',
  HERO:      'Héroe',
  CONDITION: 'Condición',
};

interface Props {
  card: CardInst;
  state: GameState;
  /**
   * `modal`: centrado, con fondo y botones (clic en una carta).
   * `peek`: lateral flotante sin botones ni fondo, no intercepta el puntero (hover prolongado).
   */
  mode: 'modal' | 'peek';
  /** Solo `peek`: lado de la pantalla donde se ancla, el contrario al puntero. */
  side?: 'left' | 'right';
  onClose?: () => void;
  /** Botones contextuales bajo la carta (Jugar/Volver, Cerrar, Pagar y descartar…). */
  actions?: ReactNode;
}

/**
 * Modo Enfoque: la carta a tamaño grande + su texto de reglas en tipografía nítida.
 * La ilustración de las cartas es el escaneo completo de la carta física, cuyo texto deja de
 * leerse por debajo de ~300 px de ancho; por eso el texto de la Habilidad se repite al lado
 * en HTML (fuente de la definición de la carta), legible a cualquier tamaño de pantalla.
 */
export function CardFocus({ card, state, mode, side = 'right', onClose, actions }: Props) {
  // Esc cierra el modal (no el peek, que se cierra solo al sacar el ratón).
  useEffect(() => {
    if (mode !== 'modal' || !onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onClose]);

  const def          = getCardDef(card.defId);
  const description  = def?.description
    ?? card.effectIds.map(id => getEffectDef(id)?.description).filter(Boolean).join(' ');
  const cost         = Math.max(0, card.baseCost + card.costModifier);
  const strength     = card.baseStrength !== undefined ? getEffectiveStrength(state, card.instId) : undefined;
  const strengthDiff = strength !== undefined ? strength - (card.baseStrength ?? 0) : 0;
  const attached     = card.attachedItemInstIds.map(id => state.allCards[id]).filter(Boolean);
  const isHero       = card.cardType === 'HERO';

  // Ficha de reglas (Art Déco). `compact`: menos aire para pantallas bajas/estrechas.
  const rulesPanel = (
    <div className={`focus-rules deco-frame ${isHero ? 'is-hero' : ''} w-full flex flex-col`}>
      <div className="flex flex-col items-center text-center gap-1">
        <span className="font-stats text-[9px] font-semibold uppercase tracking-[0.3em] text-gold/70">
          {TYPE_LABELS_ES[card.cardType] ?? card.cardType}
        </span>
        <h2 className={`focus-title font-serif font-bold leading-tight tracking-[0.04em] ${isHero ? 'text-[#ffc2b8]' : 'text-gold-bright'}`}
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>
          {card.name}
        </h2>
        <div className="deco-rule w-24 mt-1" />
      </div>

      {/* Valores: coste / fuerza / activación / poder acumulado */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {!isHero && card.deck !== CardDeck.FATE && <Stat label="Coste" value={cost} />}
        {strength !== undefined && (
          <Stat
            label="Fuerza"
            value={strength}
            note={strengthDiff !== 0 ? `${strengthDiff > 0 ? '+' : ''}${strengthDiff}` : undefined}
          />
        )}
        {card.activationCost !== undefined && <Stat label="Activar" value={card.activationCost} />}
        {(card.storedPower ?? 0) > 0 && <Stat label="Acumulado" value={card.storedPower!} />}
      </div>

      {/* Si el texto no cabe, el scroll queda DENTRO de la ficha, nunca en la página. */}
      {(description || attached.length > 0) && (
        <div className="focus-rules-scroll flex flex-col gap-2 min-h-0 overflow-y-auto scrollbar-hide">
          {description && (
            <p className="focus-text font-narrative leading-relaxed text-[#efe6d2] text-center">
              {description}
            </p>
          )}
          {attached.length > 0 && (
            <div className="flex flex-col items-center gap-1 pt-1 border-t border-gold/15">
              <span className="font-stats text-[9px] uppercase tracking-[0.25em] text-gold/60">Adjuntos</span>
              <p className="font-narrative italic text-sm text-[#e8dcc4]/85 text-center">
                {attached.map(a => a.name).join(' · ')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (mode === 'peek') {
    return (
      <div
        className={`card-peek hidden lg:flex flex-col items-center gap-4 fixed top-1/2 -translate-y-1/2 z-90 pointer-events-none ${side === 'left' ? 'left-6' : 'right-6'}`}
        aria-hidden
      >
        <CardComponent card={card} state={state} sizeClassName="card-size-peek" />
        <div className="w-[300px]">{rulesPanel}</div>
      </div>
    );
  }

  // Modal: el alto se reparte para caber SIEMPRE en pantalla sin scroll (ver .focus-layout):
  //  · horizontal → carta a la izquierda a todo el alto; ficha + botones en columna a su derecha.
  //  · vertical   → carta arriba (tamaño según ancho y alto), ficha compacta y botones debajo.
  return (
    <div className="fixed inset-0 z-120 flex items-center justify-center p-3 sm:p-6">
      <div className="card-focus-backdrop absolute inset-0" onClick={onClose} />
      <div role="dialog" aria-modal aria-label={card.name} className="focus-layout card-focus-enter relative">
        <div className="shrink-0">
          <CardComponent card={card} state={state} sizeClassName="card-size-focus" />
        </div>
        <div className="focus-side">
          {rulesPanel}
          {actions && <div className="flex items-center justify-center gap-3 w-full shrink-0">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-black/40 px-2.5 py-0.5">
      <span className="font-stats text-[9px] uppercase tracking-[0.18em] text-on-surface-variant/70">{label}</span>
      <span className="font-stats text-sm font-bold text-gold-bright">{value}</span>
      {note && <span className="font-stats text-[10px] font-semibold text-[#8be6b6]">{note}</span>}
    </span>
  );
}

/** Botón dorado principal del Modo Enfoque (Jugar). */
export function FocusPrimaryButton({ children, disabled, title, onClick }: {
  children: ReactNode; disabled?: boolean; title?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="focus-btn-primary min-w-32 px-6 py-2.5 rounded-lg font-serif font-bold text-sm uppercase tracking-[0.14em]">
      {children}
    </button>
  );
}

/** Botón secundario del Modo Enfoque (Volver / Cerrar / Pagar y descartar). */
export function FocusSecondaryButton({ children, disabled, title, onClick }: {
  children: ReactNode; disabled?: boolean; title?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="focus-btn-secondary min-w-28 px-5 py-2.5 rounded-lg font-stats font-semibold text-xs uppercase tracking-[0.16em]">
      {children}
    </button>
  );
}

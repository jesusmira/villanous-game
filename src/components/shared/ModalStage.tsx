import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface Props {
  /** Línea pequeña en versalitas sobre el título (p. ej. "Acción Destino contra IA"). */
  eyebrow?: string;
  title: ReactNode;
  /** Texto de apoyo bajo el título, en cursiva narrativa. */
  subtitle?: ReactNode;
  /** Acento de color: oro (por defecto), carmesí (Destino, Vencer, amenazas) o lila (efectos del villano). */
  tone?: 'gold' | 'fate' | 'arcane';
  /**
   * El tablero sigue siendo clicable detrás (para consultar cartas mientras se decide): el fondo
   * solo oscurece, sin desenfoque y sin capturar el puntero. Es el comportamiento que tenían
   * los modales con `pointer-events-none` en su overlay.
   */
  passThrough?: boolean;
  /** Clic en el fondo (solo si no es `passThrough`) y tecla Esc. */
  onDismiss?: () => void;
  /** Botones al pie, centrados. */
  actions?: ReactNode;
  /** Ancho máximo del contenido (clase Tailwind), por defecto `max-w-3xl`. */
  widthClass?: string;
  /** Capa (por defecto z-100, por encima de la mano y bajo el Modo Enfoque). */
  zClass?: string;
  children?: ReactNode;
}

/**
 * Escenario común de los modales, con el mismo lenguaje que la Acción Destino: sin caja, el
 * contenido flota centrado sobre el tablero oscurecido, con cabecera en dos niveles (antetítulo
 * en versalitas + título Cinzel dorado), cartas grandes y botones de pastilla al pie.
 */
export function ModalStage({
  eyebrow, title, subtitle, tone = 'gold', passThrough = false, onDismiss, actions,
  widthClass = 'max-w-3xl', zClass = 'z-100', children,
}: Props) {
  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div className={`modal-stage ${zClass} ${passThrough ? 'pointer-events-none' : ''}`}>
      <div
        className={`modal-stage-backdrop ${passThrough ? 'is-pass-through' : ''}`}
        onClick={passThrough ? undefined : onDismiss}
      />
      <div role="dialog" aria-modal={!passThrough} className={`modal-stage-content tone-${tone} ${widthClass} pointer-events-auto`}>
        <header className="flex flex-col items-center gap-1 text-center">
          {eyebrow && <span className="modal-stage-eyebrow">{eyebrow}</span>}
          <h2 className="modal-stage-title">{title}</h2>
          {subtitle && <p className="modal-stage-subtitle">{subtitle}</p>}
        </header>
        {children}
        {actions && <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}

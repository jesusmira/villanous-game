import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Núcleo del arrastre por Pointer Events (ratón + táctil).
 * El provider y los componentes viven en `DragProvider.tsx`; aquí solo el
 * contexto, los tipos y los hooks (sin JSX) para no romper el fast-refresh.
 */

export const DRAG_THRESHOLD = 8; // px a mover para que empiece el arrastre (si no, es tap/click)

export interface DropZone {
  id: number;
  getRect: () => DOMRect | null;
  onDrop: () => void;
}

export interface DragCtx {
  startDrag: (
    e: ReactPointerEvent,
    opts: { el: HTMLElement; onStart?: () => void; onEnd?: () => void },
  ) => void;
  registerZone: (zone: DropZone) => () => void;
  overId: number | null;
  dragging: boolean;
}

const NOOP_CTX: DragCtx = {
  startDrag: () => {},
  registerZone: () => () => {},
  overId: null,
  dragging: false,
};

export const DragContext = createContext<DragCtx>(NOOP_CTX);

let zoneSeq = 0;
const nextZoneId = () => ++zoneSeq;

/** Convierte un elemento en arrastrable por puntero. Devuelve `onPointerDown`. */
export function useDragSource(opts: {
  disabled?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  /** Descendiente que se usa como copia flotante (y su posición) en vez del propio elemento:
   *  útil cuando el elemento que recibe el puntero no coincide con lo que se ve (mano en abanico). */
  ghostSelector?: string;
}) {
  const ctx = useContext(DragContext);
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (optsRef.current.disabled) return;
    const source = e.currentTarget as HTMLElement;
    const sel = optsRef.current.ghostSelector;
    ctx.startDrag(e, {
      el: (sel ? source.querySelector<HTMLElement>(sel) : null) ?? source,
      onStart: () => optsRef.current.onStart?.(),
      onEnd: () => optsRef.current.onEnd?.(),
    });
  }, [ctx]);

  return { onPointerDown, dragging: ctx.dragging };
}

/** Registra una zona de drop. `onDrop` undefined = no ejecuta nada al soltar, pero sigue registrada. */
export function useDropTarget(onDrop?: () => void) {
  const ctx = useContext(DragContext);
  const ref = useRef<HTMLDivElement | null>(null);
  const [id] = useState(nextZoneId);
  const onDropRef = useRef(onDrop);
  useEffect(() => { onDropRef.current = onDrop; });

  useEffect(() => {
    // Registra la zona SIEMPRE, aunque onDrop sea undefined. Esto evita race conditions
    // cuando onDrop cambia dinámicamente (p. ej. durante Destino).
    return ctx.registerZone({
      id,
      getRect: () => ref.current?.getBoundingClientRect() ?? null,
      onDrop: () => onDropRef.current?.(),
    });
  }, [ctx, id]);

  const enabled = !!onDrop;
  return { ref, isOver: enabled && ctx.overId === id };
}

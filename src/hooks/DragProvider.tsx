import { useRef, useState, useEffect, useCallback } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { DragContext, DRAG_THRESHOLD, useDragSource } from './dragCore';
import type { DropZone, DragCtx } from './dragCore';

interface ActiveDrag {
  startX: number; startY: number;
  offsetX: number; offsetY: number;
  el: HTMLElement;
  started: boolean;
  onStart?: () => void;
  onEnd?: () => void;
}

interface Ghost { html: string; width: number; height: number; x: number; y: number }

export function DragProvider({ children }: { children: ReactNode }) {
  const zones = useRef<Map<number, DropZone>>(new Map());
  const drag = useRef<ActiveDrag | null>(null);
  const ghostEl = useRef<HTMLDivElement | null>(null);
  const ptr = useRef({ x: 0, y: 0 });   // última posición del puntero (viewport)
  const rafId = useRef(0);              // id del bucle de auto-scroll por bordes

  const [dragging, setDragging] = useState(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  const registerZone = useCallback((zone: DropZone) => {
    const map = zones.current;
    map.set(zone.id, zone);
    return () => { map.delete(zone.id); };
  }, []);

  const startDrag = useCallback<DragCtx['startDrag']>((e, opts) => {
    if (e.button !== undefined && e.button !== 0) return; // solo botón principal / toque
    const r = opts.el.getBoundingClientRect();
    drag.current = {
      startX: e.clientX, startY: e.clientY,
      offsetX: e.clientX - r.left, offsetY: e.clientY - r.top,
      el: opts.el, started: false, onStart: opts.onStart, onEnd: opts.onEnd,
    };
  }, []);

  // Listeners globales (una sola vez); no-op mientras no haya arrastre activo.
  useEffect(() => {
    const zoneAt = (x: number, y: number): DropZone | null => {
      for (const z of zones.current.values()) {
        const r = z.getRect();
        if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return z;
      }
      return null;
    };

    const updateOver = (x: number, y: number) => {
      const z = zoneAt(x, y);
      const zid = z?.id ?? null;
      setOverId(prev => (prev === zid ? prev : zid));
    };

    // Auto-scroll cuando el puntero se acerca al borde superior/inferior, para poder
    // arrastrar a ubicaciones fuera de pantalla (p. ej. tablero rival con cartas de Destino).
    const EDGE = 72, MAX_SPEED = 22;
    const autoScroll = () => {
      const a = drag.current;
      if (!a || !a.started) { rafId.current = 0; return; }
      const { x, y } = ptr.current;
      const vh = window.innerHeight;
      let dy = 0;
      if (y < EDGE) dy = -MAX_SPEED * (1 - y / EDGE);
      else if (y > vh - EDGE) dy = MAX_SPEED * (1 - (vh - y) / EDGE);
      if (dy !== 0) {
        window.scrollBy(0, dy);
        updateOver(x, y); // las posiciones cambian al scrollear
      }
      rafId.current = requestAnimationFrame(autoScroll);
    };

    const move = (ev: PointerEvent) => {
      const a = drag.current;
      if (!a) return;
      ptr.current = { x: ev.clientX, y: ev.clientY };
      if (!a.started) {
        if (Math.hypot(ev.clientX - a.startX, ev.clientY - a.startY) < DRAG_THRESHOLD) return;
        a.started = true;
        const r = a.el.getBoundingClientRect();
        setGhost({ html: a.el.outerHTML, width: r.width, height: r.height, x: ev.clientX - a.offsetX, y: ev.clientY - a.offsetY });
        setDragging(true);
        document.body.style.userSelect = 'none';
        a.onStart?.();
        if (!rafId.current) rafId.current = requestAnimationFrame(autoScroll);
      } else if (ghostEl.current) {
        ghostEl.current.style.transform = `translate(${ev.clientX - a.offsetX}px, ${ev.clientY - a.offsetY}px)`;
      }
      ev.preventDefault();
      updateOver(ev.clientX, ev.clientY);
    };

    const up = (ev: PointerEvent) => {
      const a = drag.current;
      if (!a) return;
      if (a.started) {
        const z = zoneAt(ev.clientX, ev.clientY);
        a.onEnd?.();
        z?.onDrop();
      }
      drag.current = null;
      document.body.style.userSelect = '';
      if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = 0; }
      setDragging(false);
      setGhost(null);
      setOverId(null);
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = 0; }
    };
  }, []);

  return (
    <DragContext.Provider value={{ startDrag, registerZone, overId, dragging }}>
      {children}
      {ghost && (
        <div
          ref={ghostEl}
          className="fixed top-0 left-0 z-9999 pointer-events-none opacity-80"
          style={{ width: ghost.width, height: ghost.height, transform: `translate(${ghost.x}px, ${ghost.y}px)`, willChange: 'transform' }}
          dangerouslySetInnerHTML={{ __html: ghost.html }}
        />
      )}
    </DragContext.Provider>
  );
}

/** Envoltorio arrastrable para elementos que no son CardComponent (filas de mano, etc.). */
export function DragSource({
  disabled, onStart, onEnd, className, style, onClick, onMouseEnter, onMouseLeave, children,
}: {
  disabled?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: ReactNode;
}) {
  const { onPointerDown } = useDragSource({ disabled, onStart, onEnd });
  return (
    <div
      className={className}
      style={style}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={disabled ? undefined : onPointerDown}
    >
      {children}
    </div>
  );
}

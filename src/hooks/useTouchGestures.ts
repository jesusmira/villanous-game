import { useRef, useCallback } from 'react';

export interface TouchGestureCallbacks {
  onTap?: () => void;
  onDragStart?: (x: number, y: number) => void;
  onDragMove?: (deltaX: number, deltaY: number, x: number, y: number) => void;
  onDragEnd?: (deltaX: number, deltaY: number) => void;
}

const TAP_THRESHOLD = 10; // pixels
const TAP_TIMEOUT = 200; // milliseconds

export function useTouchGestures(callbacks: TouchGestureCallbacks) {
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return; // Only single touch

      const touch = e.touches[0];
      touchStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
      isDragging.current = false;
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStart.current.x;
      const deltaY = touch.clientY - touchStart.current.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Only start drag if moved more than threshold
      if (!isDragging.current && distance > TAP_THRESHOLD) {
        isDragging.current = true;
        callbacks.onDragStart?.(touch.clientX, touch.clientY);
      }

      if (isDragging.current) {
        callbacks.onDragMove?.(deltaX, deltaY, touch.clientX, touch.clientY);
      }
    },
    [callbacks]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current) return;

      const deltaX = (e.changedTouches[0]?.clientX ?? 0) - touchStart.current.x;
      const deltaY = (e.changedTouches[0]?.clientY ?? 0) - touchStart.current.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const duration = Date.now() - touchStart.current.time;

      if (isDragging.current) {
        // End drag
        callbacks.onDragEnd?.(deltaX, deltaY);
        isDragging.current = false;
      } else if (distance < TAP_THRESHOLD && duration < TAP_TIMEOUT) {
        // Detect as tap
        callbacks.onTap?.();
      }

      touchStart.current = null;
    },
    [callbacks]
  );

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}

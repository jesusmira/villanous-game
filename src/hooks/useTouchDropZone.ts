import { useRef, useCallback } from 'react';

export interface TouchDropZoneCallbacks {
  onDragOver?: (isOver: boolean) => void;
  onDrop?: () => void;
}

export function useTouchDropZone(
  ref: React.RefObject<HTMLDivElement | null>,
  callbacks: TouchDropZoneCallbacks
) {
  const isDraggingOver = useRef(false);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!ref.current || e.touches.length === 0) return;

      const touch = e.touches[0];
      const rect = ref.current.getBoundingClientRect();

      // Check if touch is over this drop zone
      const isOver =
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom;

      // Only call callback if state changed
      if (isOver !== isDraggingOver.current) {
        isDraggingOver.current = isOver;
        callbacks.onDragOver?.(isOver);
      }
    },
    [ref, callbacks]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!ref.current || e.changedTouches.length === 0) return;

      const touch = e.changedTouches[0];
      const rect = ref.current.getBoundingClientRect();

      // Check if touch ended over this drop zone
      const isOver =
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom;

      if (isOver) {
        callbacks.onDrop?.();
      }

      // Reset state
      if (isDraggingOver.current) {
        isDraggingOver.current = false;
        callbacks.onDragOver?.(false);
      }
    },
    [ref, callbacks]
  );

  return {
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}

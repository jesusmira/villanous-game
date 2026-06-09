import { useRef, useCallback } from 'react';

export interface SwipeCallbacks {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

const SWIPE_THRESHOLD = 50; // pixels
const SWIPE_TIME_THRESHOLD = 500; // milliseconds

export function useSwipe(callbacks: SwipeCallbacks) {
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      touchStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    },
    []
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current || e.changedTouches.length === 0) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStart.current.x;
      const deltaY = touch.clientY - touchStart.current.y;
      const duration = Date.now() - touchStart.current.time;

      // Check if swipe was fast enough
      if (duration > SWIPE_TIME_THRESHOLD) {
        touchStart.current = null;
        return;
      }

      // Check swipe direction
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (deltaX > SWIPE_THRESHOLD) {
          callbacks.onSwipeRight?.();
        } else if (deltaX < -SWIPE_THRESHOLD) {
          callbacks.onSwipeLeft?.();
        }
      } else {
        // Vertical swipe
        if (deltaY > SWIPE_THRESHOLD) {
          callbacks.onSwipeDown?.();
        } else if (deltaY < -SWIPE_THRESHOLD) {
          callbacks.onSwipeUp?.();
        }
      }

      touchStart.current = null;
    },
    [callbacks]
  );

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
}

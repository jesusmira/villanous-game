import { useState, useEffect } from 'react';

export function useTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // Check multiple ways to detect touch capability
    const hasTouchPoints = navigator.maxTouchPoints > 0;
    const hasMediaQuery = window.matchMedia('(pointer: coarse)').matches;
    const hasTouchEvent = 'ontouchstart' in window || (navigator as any).msMaxTouchPoints > 0;

    setIsTouchDevice(hasTouchPoints || hasMediaQuery || hasTouchEvent);
  }, []);

  return isTouchDevice;
}

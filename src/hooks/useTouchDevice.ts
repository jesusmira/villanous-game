import { useState } from 'react';

// Tipo legacy de IE/Edge antiguo: no forma parte del Navigator estándar.
type LegacyNavigator = Navigator & { msMaxTouchPoints?: number };

function detectTouchDevice(): boolean {
  // Check multiple ways to detect touch capability
  const hasTouchPoints = navigator.maxTouchPoints > 0;
  const hasMediaQuery = window.matchMedia('(pointer: coarse)').matches;
  const hasTouchEvent = 'ontouchstart' in window || ((navigator as LegacyNavigator).msMaxTouchPoints ?? 0) > 0;
  return hasTouchPoints || hasMediaQuery || hasTouchEvent;
}

export function useTouchDevice(): boolean {
  // Inicializador perezoso: se calcula una sola vez, en el render inicial (no en un efecto),
  // así el valor está disponible desde el primer pintado en vez de empezar en `false`.
  const [isTouchDevice] = useState(detectTouchDevice);
  return isTouchDevice;
}

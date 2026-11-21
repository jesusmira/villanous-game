import { useSyncExternalStore } from 'react';

/**
 * Estado en vivo de una media query: se actualiza al cambiar (girar el móvil, redimensionar la
 * ventana, activar el modo dispositivo de las DevTools…) sin tener que recargar la página.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    onChange => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

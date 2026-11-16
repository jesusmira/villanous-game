import { useEffect, useRef, useState } from 'react';

export interface NumberFlash {
  dir: 'gain' | 'loss';
  /** Cambia en cada variación: úsalo como `key` para reiniciar la animación CSS. */
  key: number;
}

/**
 * Cifra que "cuenta" hasta su nuevo valor (p. ej. el Poder) en vez de cambiar de golpe, y avisa
 * de la dirección del cambio para un destello CSS (ver .power-flash en animations.css).
 * Si el valor vuelve a cambiar a mitad de cuenta, continúa desde la cifra que se está mostrando.
 */
export function useAnimatedNumber(value: number, durationMs = 450): { shown: number; flash: NumberFlash | null } {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<NumberFlash | null>(null);
  const shownRef = useRef(value);
  const targetRef = useRef(value);

  useEffect(() => {
    if (targetRef.current === value) return;
    const from = shownRef.current;
    targetRef.current = value;
    setFlash(f => ({ dir: value > from ? 'gain' : 'loss', key: (f?.key ?? 0) + 1 }));

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return { shown, flash };
}

import 'react';

declare module 'react' {
  interface CSSProperties {
    '--villain-color'?: string;
    '--card-color'?: string;
    /** HandFan: posición de la carta respecto al centro del abanico (…-1, 0, 1…). */
    '--fan'?: number;
    /** HandFan: giro entre cartas consecutivas del abanico (p. ej. '5deg'). */
    '--fan-step'?: string;
  }
}

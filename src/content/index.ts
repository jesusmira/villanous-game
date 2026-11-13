import type { VillainId } from '../core/types';

/**
 * Textos de ayuda del juego (reglas + Guía de Villano) en Markdown, cargados bajo demanda con
 * `import()` para que no pesen en el bundle inicial.
 *
 * Es un `Record<VillainId, …>`: al añadir un villano nuevo a `VillainId`, el build falla hasta
 * que se le escriba su guía en `guides/<id>.md`.
 *
 * Sintaxis extra sobre Markdown (ver components/shared/Markdown.tsx):
 *   `@cartas: Nombre A | Nombre B` → fila de miniaturas de esas cartas del villano.
 */
export const GUIDE_LOADERS: Record<VillainId, () => Promise<string>> = {
  maleficent: () => import('./guides/maleficent.md?raw').then(m => m.default),
  hook:       () => import('./guides/hook.md?raw').then(m => m.default),
  jhon:       () => import('./guides/jhon.md?raw').then(m => m.default),
  queen:      () => import('./guides/queen.md?raw').then(m => m.default),
};

export const loadRules = (): Promise<string> => import('./rules.md?raw').then(m => m.default);

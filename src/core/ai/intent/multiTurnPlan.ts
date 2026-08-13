// ─── Planificación a 2-3 turnos (heurística) ──────────────────────────────────────
// Deliberadamente NO es una búsqueda exhaustiva multi-turno (minimax recursivo turno a turno):
// eso fue justo el tipo de mecanismo que más costó estabilizar en la reescritura anterior
// (rendimiento y trampas de gradiente). En su lugar, una proyección por huecos restantes sobre
// el propio progreso — "a este ritmo, ¿en cuántos turnos more o menos se resuelve esto" — que
// sirve para AUDITAR y para desempates menores, no para dominar la puntuación de acciones.
/** Mismo supuesto de ritmo que oppThreat (ver memory.ts) — calibrado sobre la duración típica
 *  observada en el simulador. */
const ASSUMED_PROGRESS_PER_TURN = 8;

/** Turnos estimados para completar el objetivo de victoria propio, a partir de `ownProgress`
 *  (0-100). Usa los mismos anclajes que `victoryPrepCurve` (actionScoring.ts) para mantener
 *  consistencia con cuándo el motor considera que "la victoria está realmente cerca". */
export function estimateTurnsToGoal(ownProgress: number): number {
  if (ownProgress >= 95) return 1;
  if (ownProgress >= 85) return 2;
  if (ownProgress >= 70) return 3;
  const remaining = 100 - ownProgress;
  return Math.max(4, Math.ceil(remaining / ASSUMED_PROGRESS_PER_TURN));
}

// ─── Interpolación continua para curvas de urgencia ──────────────────────────────
// Lección ya validada (ver memoria del usuario, feedback_ai_tuning_guidelines): cualquier
// "urgencia por proximidad a X" debe ser una curva continua, nunca un salto de umbral fijo —
// un salto grande cerca de un ancla puede penalizar de golpe una acción legítima que retrocede
// un poco el indicador por una buena razón (p. ej. gastar Poder en una jugada excelente).
// `points` son anclas (x, y) ordenadas por x ascendente; se interpola linealmente entre ellas y
// se extrapola con la pendiente del último tramo más allá del último punto.
export function lerpCurve(x: number, points: [number, number][]): number {
  if (points.length === 0) return 0;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  const [x0, y0] = points[points.length - 2];
  const [x1, y1] = points[points.length - 1];
  const slope = (y1 - y0) / (x1 - x0);
  return y1 + (x - x1) * slope;
}

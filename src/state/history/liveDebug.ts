// ─── Diagnóstico de IA en vivo (solo desarrollo) ─────────────────────────────
// Envía anomalías detectadas en gameStore.ts (turnos vacíos, rachas de estancamiento)
// al middleware de vite.config.ts mientras se juega, para poder detectarlas con
// `tail -f ai-debug.log` sin depender de exportar el historial a mano tras notarlo.
export function reportAIAnomaly(kind: string, detail: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  void fetch('/__ai-debug', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, ...detail }),
  }).catch(() => {});
}

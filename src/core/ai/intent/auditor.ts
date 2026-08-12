// ─── Auditor de turno ──────────────────────────────────────────────────────────
// Vuelca el informe de cada turno de IA por consola (solo dev) para poder explicar/depurar
// decisiones: intención elegida, acciones tomadas, mejores alternativas ignoradas, errores de
// reglas detectados y puntuación lograda vs óptima. scripts/simulate.ts puede leer el mismo
// objeto TurnAudit devuelto por runAIStep para agregarlo en validaciones offline.
import type { TurnAudit } from './types';

/** Activable/desactivable en runtime — desactivado por defecto (evita ruido en cada turno de
 *  cada partida simulada); scripts/simulate.ts o una consola de depuración pueden activarlo con
 *  setAIAuditEnabled(true). gameStore.ts vuelca el audit de otra forma (import.meta.env.DEV),
 *  independiente de este interruptor. */
let auditEnabled = false;
export function setAIAuditEnabled(enabled: boolean): void {
  auditEnabled = enabled;
}

export function logTurnAudit(audit: TurnAudit): void {
  if (!auditEnabled) return;
  console.debug(
    `[AI Audit] ${audit.villainId} · ronda ${audit.roundNumber} · intención: ${audit.chosenIntention.name} (${audit.chosenIntention.score.toFixed(1)})`,
    {
      intenciones: audit.intentionScores.map(i => `${i.name}: ${i.score.toFixed(1)}`),
      accionesTomadas: audit.actionsTaken.map(a => `${a.label} (${a.total.toFixed(1)})`),
      alternativasIgnoradas: audit.ignoredAlternatives.map(a => `${a.label} (${a.total.toFixed(1)})`),
      erroresDeReglas: audit.ruleErrors,
      puntuacion: `${audit.turnScoreAchieved.toFixed(1)} / óptimo explorado ${audit.turnScoreOptimal.toFixed(1)}`,
    },
  );
}

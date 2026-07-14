// ─── Caché del perfil del rival (Fase 2) ─────────────────────────────────────
// Construir el perfil implica leer TODO el historial de IndexedDB (async), así
// que no puede recalcularse en cada postMessage al worker de IA. Se recarga una
// vez por partida (initGame) y se sirve desde memoria mientras tanto.
import { buildOpponentProfile } from '../../core/ai/opponentModel';
import type { OpponentProfile } from '../../core/ai/opponentModel';
import { listGameRecords } from './db';

let cached: OpponentProfile | undefined;

export function getActiveProfile(): OpponentProfile | undefined {
  return cached;
}

/**
 * Relee el historial y reconstruye el perfil. Fire-and-forget: no bloquea el inicio
 * de partida. Si la IA juega su primer turno antes de que esto resuelva, usará el
 * perfil de la partida anterior (o undefined la primera vez) — no pasa nada, es
 * background refresh, no una dependencia dura.
 */
export function refreshActiveProfile(): void {
  listGameRecords()
    .then(records => { cached = buildOpponentProfile(records); })
    .catch(err => console.error('[history] No se pudo construir el perfil del rival:', err));
}

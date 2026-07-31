// ─── Historial de partidas: exportar a JSON descargable ──────────────────────
// Efecto secundario de navegador (Blob + <a download>), por eso vive en src/state/ y no en
// src/core/. Permite sacar del IndexedDB del navegador la partida completa (con cartas por
// nombre y mensajes de log de cada paso, ver core/history/types.ts) para analizarla fuera.
import type { GameRecord } from '../../core/history/types';

function download(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportGameRecord(record: GameRecord): void {
  download(`partida-${record.id}.json`, record);
}

export function exportAllGameRecords(records: GameRecord[]): void {
  download(`historial-villanos-${Date.now()}.json`, records);
}

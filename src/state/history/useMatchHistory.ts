// ─── Hook de lectura del historial de partidas ───────────────────────────────
// Capa fina sobre db.ts para consumir el historial desde componentes React
// (p. ej. una futura pantalla "Historial de partidas" en el menú principal).
import { useCallback, useEffect, useState } from 'react';
import type { GameRecord } from '../../core/history/types';
import { listGameRecords, deleteGameRecord, clearHistory } from './db';

export function useMatchHistory() {
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Incrementar fuerza un nuevo fetch en el effect (reload() en sí no puede
  // llamar a setState de forma síncrona dentro del propio effect).
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    listGameRecords()
      .then(r => { if (!cancelled) setRecords(r); })
      .catch(err => console.error('[history] No se pudo leer el historial:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadTick]);

  const remove = useCallback(async (id: string) => {
    await deleteGameRecord(id);
    reload();
  }, [reload]);

  const clear = useCallback(async () => {
    await clearHistory();
    reload();
  }, [reload]);

  return { records, loading, reload, remove, clear };
}

import { useMemo, useState } from 'react';
import { ArrowLeft, Trash2, Swords, Compass } from 'lucide-react';
import { useMatchHistory } from '../state/history/useMatchHistory';
import { buildOpponentProfile } from '../core/ai/opponentModel';
import type { VillainMoveProfile } from '../core/ai/opponentModel';
import { getPlugin, getAllPlugins } from '../core/villains/registry';
import type { VillainId } from '../core/types';

const VILLAIN_META = Object.fromEntries(
  getAllPlugins().map(p => [p.id, { name: p.name, color: p.color }]),
) as Record<VillainId, { name: string; color: string }>;

function locationName(villainId: VillainId, locId: string): string {
  return getPlugin(villainId).locations.find(l => l.id === locId)?.name ?? locId;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  onBack: () => void;
}

export function MatchHistoryScreen({ onBack }: Props) {
  const { records, loading, remove, clear } = useMatchHistory();
  const profile = useMemo(() => buildOpponentProfile(records), [records]);
  const [confirmClear, setConfirmClear] = useState(false);

  const villainEntries = Object.entries(profile.byVillain)
    .filter((e): e is [VillainId, VillainMoveProfile] => e[1] !== undefined);

  return (
    <div style={{ minHeight: '100dvh', maxHeight: '100dvh' }} className="flex flex-col overflow-hidden">
      {/* Cabecera — mismo patrón visual que la selección de villano */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 sm:p-2 rounded-lg border border-outline-variant/50 text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <p className="font-stats text-[10px] sm:text-xs text-on-surface-variant uppercase tracking-widest text-center flex-1 px-3">
          Historial de partidas
        </p>
        <div className="w-7 sm:w-8" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-4">
        {loading ? (
          <p className="text-xs text-on-surface-variant/40 italic text-center py-8">Cargando…</p>
        ) : records.length === 0 ? (
          <p className="text-xs text-on-surface-variant/40 italic text-center py-8">
            Todavía no hay partidas registradas. Juega una partida contra la IA para empezar a construir el historial.
          </p>
        ) : (
          <>
            {/* ── Perfil del rival (Fase 2) ── */}
            {villainEntries.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="font-serif text-sm text-on-surface flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-primary" /> Perfil del rival
                </h2>
                <div className="flex flex-col gap-2">
                  {villainEntries.map(([villainId, vp]) => {
                    const meta = VILLAIN_META[villainId];
                    const favored = Object.entries(vp.moveFrequency)
                      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
                    return (
                      <div
                        key={villainId}
                        className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-3 flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-serif text-sm" style={{ color: meta?.color }}>
                            {meta?.name ?? villainId}
                          </span>
                          <span className="font-stats text-[9px] text-on-surface-variant/60 uppercase tracking-wider">
                            {vp.gamesPlayed} partida{vp.gamesPlayed === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 text-[11px] text-on-surface-variant/80">
                          <span>
                            Suele moverse a{' '}
                            <b className="text-on-surface">{favored ? locationName(villainId, favored[0]) : '—'}</b>
                            {favored ? ` (${Math.round((favored[1] ?? 0) * 100)}%)` : ''}
                          </span>
                          <span>
                            Lanza Destino con la IA a ~
                            <b className="text-on-surface">
                              {vp.avgFateTriggerOppProgress !== null ? `${Math.round(vp.avgFateTriggerOppProgress)}%` : ' sin datos'}
                            </b>
                            {vp.avgFateTriggerOppProgress !== null ? ' de progreso' : ''}
                            {vp.fateCount > 0 ? ` (${vp.fateCount} vez${vp.fateCount === 1 ? '' : 'es'})` : ''}
                          </span>
                          <span>Descartes por turno: <b className="text-on-surface">{vp.discardRate.toFixed(2)}</b></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Partidas (Fase 1) ── */}
            <section className="flex flex-col gap-2 pb-2">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-sm text-on-surface flex items-center gap-1.5">
                  <Swords className="w-3.5 h-3.5 text-primary" /> Partidas ({records.length})
                </h2>
                {confirmClear ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-on-surface-variant/70">¿Borrar todo?</span>
                    <button
                      onClick={() => { void clear(); setConfirmClear(false); }}
                      className="text-[10px] font-stats uppercase tracking-wider text-error hover:underline"
                    >
                      Sí
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="text-[10px] font-stats uppercase tracking-wider text-on-surface-variant hover:underline"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="text-[10px] font-stats uppercase tracking-wider text-on-surface-variant/60 hover:text-error transition-colors"
                  >
                    Borrar historial
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {records.map(r => {
                  const winner = r.players.find(p => p.id === r.winnerPlayerId);
                  return (
                    <div
                      key={r.id}
                      className="bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[11px] text-on-surface truncate">
                          {r.players.map(p => `${p.name} (${VILLAIN_META[p.villainId]?.name ?? p.villainId})`).join(' vs ')}
                        </span>
                        <span className="text-[9px] text-on-surface-variant/50">
                          {formatDate(r.finishedAt)} · {r.rounds} ronda{r.rounds === 1 ? '' : 's'} ·{' '}
                          {winner
                            ? <span className="text-tertiary">Gana {winner.name}</span>
                            : <span className="text-on-surface-variant/60">Abandonada</span>}
                        </span>
                      </div>
                      <button
                        onClick={() => void remove(r.id)}
                        className="shrink-0 text-on-surface-variant/40 hover:text-error transition-colors p-1"
                        title="Eliminar partida"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

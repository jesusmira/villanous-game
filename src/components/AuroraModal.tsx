import { useEffect } from 'react';
import type { GameState } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getPlayer } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';

interface Props { state: GameState }

export function AuroraModal({ state }: Props) {
  const doResolveAuroraHero  = useGameStore(s => s.doResolveAuroraHero);
  const doClearAuroraReveal  = useGameStore(s => s.doClearAuroraReveal);
  const { pendingAuroraHero } = state;

  const isHero = pendingAuroraHero?.isHero !== false; // undefined = legacy hero case

  // Auto-cerrar en 3s cuando no es héroe
  useEffect(() => {
    if (!pendingAuroraHero || isHero) return;
    const t = setTimeout(() => doClearAuroraReveal(), 3000);
    return () => clearTimeout(t);
  }, [pendingAuroraHero, isHero, doClearAuroraReveal]);

  if (!pendingAuroraHero) return null;

  const { heroInstId, targetPlayerId } = pendingAuroraHero;
  const card          = state.allCards[heroInstId];
  const plugin        = getPlugin(state.players.find(p => p.id === targetPlayerId)!.villainId);
  const targetPlayer  = getPlayer(state, targetPlayerId);

  const validLocs = plugin.locations.filter(l => !targetPlayer.locationStates[l.id]?.isLocked);

  if (!card) return null;

  return (
    /* Sin backdrop — tablero visible al fondo */
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-surface-container-highest/95 border border-primary/30 rounded-2xl shadow-2xl flex flex-col justify-between p-6 w-full max-w-2xl pointer-events-auto backdrop-blur-sm" style={{ height: '480px' }}>

        <div className="flex flex-col gap-4">
          {/* Carta revelada */}
          <div className="flex flex-col items-center gap-1">
          <p className="font-stats text-[9px] uppercase tracking-widest text-primary/60 mb-2">
            Aurora revela
          </p>
          <div className="aurora-card-preview-wrap">
            <div className="aurora-card-preview">
              <CardComponent card={card} state={state} />
            </div>
          </div>
        </div>

        </div>

        {/* Héroe: selector de ubicación — al bottom */}
        {isHero && (
          <div className="pt-4 border-t border-primary/20">
            <p className="font-stats text-[9px] uppercase tracking-wider text-on-surface-variant/60 mb-3">
              Elige dónde colocarlo:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {validLocs.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => doResolveAuroraHero(loc.id)}
                  className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container hover:border-primary hover:bg-primary/10 text-left transition-all group"
                >
                  <div className="font-serif text-[11px] text-on-surface group-hover:text-primary leading-tight">
                    {loc.name}
                  </div>
                  <div className="font-stats text-[8px] uppercase tracking-widest text-on-surface-variant/50 mt-0.5">
                    {targetPlayer.locationStates[loc.id]?.heroCardInstIds.length ?? 0} héroes
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No-héroe: mensaje + barra de cuenta atrás — al bottom */}
        {!isHero && (
          <div className="flex flex-col items-center gap-4 pt-4 border-t border-primary/20">
            <p className="text-[11px] text-on-surface-variant/70 text-center">
              No es un Héroe — vuelve al mazo
            </p>
            <div className="w-full h-1 rounded-full bg-outline-variant/20 overflow-hidden">
              <div className="h-full bg-primary/50 animate-[shrink_3s_linear_forwards] rounded-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

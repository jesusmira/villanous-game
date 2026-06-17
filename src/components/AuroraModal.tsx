import { useEffect, useMemo } from 'react';
import type { GameState } from '../core/types';
import { getPlugin, getEffectDef } from '../core/villains/registry';
import { getPlayer } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';

interface Props { state: GameState }

export function AuroraModal({ state }: Props) {
  const doResolveAuroraHero  = useGameStore(s => s.doResolveAuroraHero);
  const doClearAuroraReveal  = useGameStore(s => s.doClearAuroraReveal);
  const { pendingAuroraHero } = state;

  const isHero = pendingAuroraHero?.isHero !== false; // undefined = legacy hero case

  const actingPlayer = pendingAuroraHero
    ? state.players.find(p => p.id === pendingAuroraHero.actingPlayerId)
    : undefined;
  const isAIActing = actingPlayer?.isAI === true;

  const { heroInstId, targetPlayerId } = pendingAuroraHero ?? { heroInstId: '', targetPlayerId: '' };
  const card         = state.allCards[heroInstId];
  const plugin       = pendingAuroraHero
    ? getPlugin(state.players.find(p => p.id === targetPlayerId)!.villainId)
    : null;
  const targetPlayer = pendingAuroraHero ? getPlayer(state, targetPlayerId) : null;

  const heroStr = isHero && card ? (card.baseStrength ?? 0) + card.strengthModifier : 0;
  const validLocs = useMemo(() => {
    if (!plugin || !targetPlayer) return [];
    return plugin.locations.filter(l => {
      const ls = targetPlayer.locationStates[l.id];
      if (!ls || ls.isLocked) return false;
      if (ls.villainCardInstIds.some(id =>
        state.allCards[id]?.effectIds.some(effId => getEffectDef(effId)?.blocksHeroPlay)
      )) return false;
      if (isHero) {
        const minStr = ls.villainCardInstIds.reduce((max, id) => {
          for (const effId of (state.allCards[id]?.effectIds ?? [])) {
            const eff = getEffectDef(effId);
            if (eff?.heroMinStrengthRequired) return Math.max(max, eff.heroMinStrengthRequired);
          }
          return max;
        }, 0);
        if (minStr > 0 && heroStr < minStr) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroInstId, targetPlayerId]);

  // AI auto-pick: location with most villain cards (blocks most action slots)
  const aiPickedLoc = useMemo(() => {
    if (!isAIActing || !isHero || validLocs.length === 0 || !targetPlayer) return null;
    return validLocs.reduce((best, loc) => {
      const bScore = (targetPlayer.locationStates[best.id]?.villainCardInstIds.length ?? 0);
      const lScore = (targetPlayer.locationStates[loc.id]?.villainCardInstIds.length ?? 0);
      return lScore > bScore ? loc : best;
    }, validLocs[0]);
  }, [isAIActing, isHero, validLocs, targetPlayer]);

  // Auto-cerrar en 3s cuando no es héroe
  useEffect(() => {
    if (!pendingAuroraHero || isHero) return;
    const t = setTimeout(() => doClearAuroraReveal(), 3000);
    return () => clearTimeout(t);
  }, [pendingAuroraHero, isHero, doClearAuroraReveal]);

  // AI hero: auto-resolve after 3s
  useEffect(() => {
    if (!pendingAuroraHero || !isAIActing || !isHero || !aiPickedLoc) return;
    const t = setTimeout(() => doResolveAuroraHero(aiPickedLoc.id), 3000);
    return () => clearTimeout(t);
  }, [pendingAuroraHero, isAIActing, isHero, aiPickedLoc, doResolveAuroraHero]);

  if (!pendingAuroraHero || !card) return null;

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

        {/* IA + héroe: notificación de colocación automática */}
        {isHero && isAIActing && aiPickedLoc && (
          <div className="flex flex-col items-center gap-4 pt-4 border-t border-primary/20">
            <p className="text-[12px] text-on-surface text-center leading-snug">
              La IA coloca <span className="text-primary font-semibold">{card.name}</span> en{' '}
              <span className="text-secondary font-semibold">{aiPickedLoc.name}</span>
            </p>
            <div className="w-full h-1 rounded-full bg-outline-variant/20 overflow-hidden">
              <div className="h-full bg-primary/50 animate-[shrink_3s_linear_forwards] rounded-full" />
            </div>
          </div>
        )}

        {/* Héroe + jugador humano: selector de ubicación */}
        {isHero && !isAIActing && (
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
                    {targetPlayer?.locationStates[loc.id]?.heroCardInstIds.length ?? 0} héroes
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No-héroe: mensaje + barra de cuenta atrás */}
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

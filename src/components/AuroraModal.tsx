import { useEffect, useMemo } from 'react';
import type { GameState } from '../core/types';
import { getPlugin, getEffectDef } from '../core/villains/registry';
import { getPlayer } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';
import { CardComponent } from './CardComponent';
import { ModalStage } from './shared/ModalStage';

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
    <ModalStage
      passThrough
      tone="arcane"
      eyebrow="Aurora · carta revelada"
      title={card.name}
      subtitle={isHero
        ? (isAIActing ? 'La IA la coloca en el Reino de Maléfica.' : 'Es un Héroe: elige dónde colocarlo.')
        : 'No es un Héroe: vuelve al mazo.'}
      widthClass="max-w-2xl"
    >
      <CardComponent card={card} state={state} sizeClassName="card-size-stage" />

      {/* IA + héroe: colocación automática */}
      {isHero && isAIActing && aiPickedLoc && (
        <div className="modal-stage-section">
          <p className="modal-stage-note">
            La IA coloca <span className="text-[#f6dd94] not-italic font-semibold">{card.name}</span> en{' '}
            <span className="text-[#f6dd94] not-italic font-semibold">{aiPickedLoc.name}</span>
          </p>
          <div className="stage-countdown"><div /></div>
        </div>
      )}

      {/* Héroe + jugador humano: elegir ubicación */}
      {isHero && !isAIActing && (
        <div className="modal-stage-section">
          <span className="modal-stage-label">Elige dónde colocarlo</span>
          <div className="flex flex-wrap justify-center gap-2">
            {validLocs.map(loc => (
              <button key={loc.id} onClick={() => doResolveAuroraHero(loc.id)} className="chip">
                <span className="font-serif font-semibold">{loc.name}</span>
                <span className="text-[10px] opacity-60">· {targetPlayer?.locationStates[loc.id]?.heroCardInstIds.length ?? 0} héroes</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No-héroe: cuenta atrás */}
      {!isHero && <div className="stage-countdown"><div /></div>}
    </ModalStage>
  );
}

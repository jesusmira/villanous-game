import { useState, useEffect } from 'react';
import { ActionType } from '../core/types';
import type { GameState, PlayerId } from '../core/types';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { getEffectDef } from '../core/villains/registry';
import { canVanquish, canVanquishFree } from '../core/engine/RuleEngine';
import { CardComponent } from './CardComponent';
import type { ActionPanelCtx } from './useActionPanelState';
import { ModalStage } from './shared/ModalStage';

interface Props {
  ap: ActionPanelCtx;
  state: GameState;
  playerId: PlayerId;
  /** Vencer gratuito de Trampa: sin casilla de acción; confirma vía doTrampaVanquish. */
  free?: boolean;
}

export function VanquishModal({ ap, state, playerId, free = false }: Props) {
  const [selectedHeroId, setSelectedHeroId]   = useState<string | null>(null);
  const [selectedAllyIds, setSelectedAllyIds] = useState<string[]>([]);
  const [burning, setBurning]                 = useState(false);
  const [embers, setEmbers]                   = useState<{ id: number; x: number; y: number; size: number; color: string }[]>([]);

  // Limpiar brasas tras la animación
  useEffect(() => {
    if (embers.length === 0) return;
    const t = setTimeout(() => setEmbers([]), 800);
    return () => clearTimeout(t);
  }, [embers]);

  if (!free && ap.pendingAction !== ActionType.VANQUISH) return null;

  const hero     = selectedHeroId ? state.allCards[selectedHeroId] : null;
  const heroStr  = selectedHeroId ? getEffectiveStrength(state, selectedHeroId) : 0;
  const allyStr  = selectedAllyIds.reduce((s, id) => s + getEffectiveStrength(state, id), 0);
  const canConfirm = selectedHeroId && selectedAllyIds.length > 0
    && (free
      ? canVanquishFree(state, playerId, selectedHeroId, selectedAllyIds).valid
      : canVanquish(state, playerId, selectedHeroId, selectedAllyIds, ap.pendingSlot!).valid);

  const alliesForHero = hero ? ap.alliesInKingdom.filter(c => {
    if (c.locationId === hero.locationId) return true;
    if (c.effectIds.some(id => getEffectDef(id)?.canVanquishFromAdjacent))
      return ap.plugin.locations.find(l => l.id === hero.locationId)?.adjacentIds.includes(c.locationId!) ?? false;
    return false;
  }) : [];

  function close() {
    if (free) ap.store.doTrampaSkip();
    else ap.clearPending();
    setSelectedHeroId(null);
    setSelectedAllyIds([]);
    setBurning(false);
    setEmbers([]);
  }

  function spawnEmbers() {
    const colors = ['#ff6b00', '#ff9500', '#ffcc00', '#ff3300', '#ff8800'];
    const newEmbers = Array.from({ length: 18 }, (_, i) => ({
      id: Date.now() + i,
      x: 20 + Math.random() * 60,
      y: 20 + Math.random() * 60,
      size: 3 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    setEmbers(newEmbers);
  }

  function confirm() {
    if (!selectedHeroId || selectedAllyIds.length === 0) return;
    if (!free && ap.pendingSlot === null) return;
    setBurning(true);
    spawnEmbers();
    setTimeout(() => {
      if (free) ap.store.doTrampaVanquish(selectedHeroId, selectedAllyIds);
      else ap.store.doVanquish(selectedHeroId, selectedAllyIds, ap.pendingSlot!);
      ap.resetSelection();
      ap.clearPending();
      setSelectedHeroId(null);
      setSelectedAllyIds([]);
      setBurning(false);
      setEmbers([]);
    }, 900);
  }

  const embersFor = (show: boolean) => show && embers.map(e => (
    <div key={e.id} className="ember" style={{
      left: `${e.x}%`, top: `${e.y}%`,
      width: e.size, height: e.size,
      background: e.color,
      boxShadow: `0 0 ${e.size * 2}px ${e.color}`,
      animationDelay: `${Math.random() * 0.3}s`,
    }} />
  ));

  return (
    <ModalStage
      passThrough
      tone="fate"
      onDismiss={burning ? undefined : close}
      eyebrow={free ? 'Trampa · Vencer gratuito' : 'Acción Vencer'}
      title={selectedHeroId ? `Vencer a ${hero?.name ?? 'el Héroe'}` : 'Elige un Héroe'}
      subtitle={free
        ? 'No consume casilla de acción. Cierra si no quieres vencer a nadie.'
        : selectedHeroId ? 'Elige los Aliados que combaten.' : 'Después elegirás los Aliados que combaten.'}
      widthClass="max-w-4xl"
      actions={<>
        <button onClick={close} disabled={burning} className="btn btn--secondary">{free ? 'No vencer' : 'Cancelar'}</button>
        <button disabled={!canConfirm} onClick={confirm} className="btn btn--danger">Vencer</button>
      </>}
    >
      <div className="modal-stage-section">
        <span className="modal-stage-label">Héroe objetivo</span>
        <div className="flex flex-wrap justify-center gap-3 sm:gap-5">
          {ap.heroesInKingdom.map(c => {
            const isBurningCard = burning && selectedHeroId === c.instId;
            return (
              <div
                key={c.instId}
                onClick={() => !burning && (setSelectedHeroId(c.instId), setSelectedAllyIds([]))}
                className={`relative cursor-pointer ${isBurningCard ? 'burning-card' : `stage-pick ${selectedHeroId === c.instId ? 'is-chosen' : ''}`}`}
              >
                <CardComponent card={c} state={state} selected={selectedHeroId === c.instId} sizeClassName="card-size-stage-sm" />
                {embersFor(isBurningCard)}
              </div>
            );
          })}
        </div>
      </div>

      {selectedHeroId && (
        <div className="modal-stage-section">
          <span className="modal-stage-label">Aliados para combatir</span>
          {alliesForHero.length === 0
            ? <p className="modal-stage-note">No hay Aliados disponibles en esta ubicación.</p>
            : (
              <div className="flex flex-wrap justify-center gap-3 sm:gap-5">
                {alliesForHero.map(c => {
                  const isAdj = c.locationId !== hero?.locationId;
                  const sel   = selectedAllyIds.includes(c.instId);
                  const isBurningCard = burning && sel;
                  return (
                    <div key={c.instId} className="relative">
                      <div
                        onClick={() => !burning && setSelectedAllyIds(prev =>
                          prev.includes(c.instId) ? prev.filter(id => id !== c.instId) : [...prev, c.instId]
                        )}
                        className={`relative cursor-pointer ${isBurningCard ? 'burning-card' : `stage-pick ${sel ? 'is-chosen' : ''}`}`}
                      >
                        <CardComponent card={c} state={state} selected={sel} sizeClassName="card-size-stage-sm" />
                        {embersFor(isBurningCard)}
                      </div>
                      {isAdj && !burning && (
                        <span className="absolute -top-2 -right-2 z-70 stage-badge">Adyacente</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      )}

      {selectedHeroId && (
        <div className="flex items-center justify-center gap-4 sm:gap-6">
          <span className="stage-stat">Aliados <b className={allyStr >= heroStr ? 'text-[#8be6b6]' : 'text-[#f0b483]'}>{allyStr}</b></span>
          <span className="modal-stage-label">vs</span>
          <span className="stage-stat">Héroe <b className="text-[#ff9c90]">{heroStr}</b></span>
          <span className="stage-stat">
            <b className={`text-[11px]! tracking-[0.14em]! ${allyStr >= heroStr ? 'text-[#8be6b6]' : 'text-[#f0b483]'}`}>
              {allyStr >= heroStr ? '✓ Fuerza suficiente' : `Faltan ${heroStr - allyStr}`}
            </b>
          </span>
        </div>
      )}
    </ModalStage>
  );
}

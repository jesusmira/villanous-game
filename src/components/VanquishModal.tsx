import { useState, useEffect } from 'react';
import { ActionType } from '../core/types';
import type { GameState, PlayerId } from '../core/types';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { getEffectDef } from '../core/villains/registry';
import { canVanquish } from '../core/engine/RuleEngine';
import { CardComponent } from './CardComponent';
import type { ActionPanelCtx } from './useActionPanelState';

interface Props {
  ap: ActionPanelCtx;
  state: GameState;
  playerId: PlayerId;
}

export function VanquishModal({ ap, state, playerId }: Props) {
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

  if (ap.pendingAction !== ActionType.VANQUISH) return null;

  const hero     = selectedHeroId ? state.allCards[selectedHeroId] : null;
  const heroStr  = selectedHeroId ? getEffectiveStrength(state, selectedHeroId) : 0;
  const allyStr  = selectedAllyIds.reduce((s, id) => s + getEffectiveStrength(state, id), 0);
  const canConfirm = selectedHeroId && selectedAllyIds.length > 0
    && canVanquish(state, playerId, selectedHeroId, selectedAllyIds, ap.pendingSlot!).valid;

  const alliesForHero = hero ? ap.alliesInKingdom.filter(c => {
    if (c.locationId === hero.locationId) return true;
    if (c.effectIds.some(id => getEffectDef(id)?.canVanquishFromAdjacent))
      return ap.plugin.locations.find(l => l.id === hero.locationId)?.adjacentIds.includes(c.locationId!) ?? false;
    return false;
  }) : [];

  function close() {
    ap.clearPending();
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
    if (!selectedHeroId || ap.pendingSlot === null || selectedAllyIds.length === 0) return;
    setBurning(true);
    spawnEmbers();
    setTimeout(() => {
      ap.store.doVanquish(selectedHeroId, selectedAllyIds, ap.pendingSlot!);
      ap.resetSelection();
      ap.clearPending();
      setSelectedHeroId(null);
      setSelectedAllyIds([]);
      setBurning(false);
      setEmbers([]);
    }, 900);
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-surface-container-highest border border-error/30 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto pointer-events-auto flex flex-col gap-4 p-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-base text-error">Vencer</h2>
            <p className="text-[10px] text-on-surface-variant/60 mt-0.5">Elige un Héroe y los Aliados para combatir</p>
          </div>
          <button onClick={close} className="text-on-surface-variant/40 hover:text-on-surface transition-colors text-lg leading-none">×</button>
        </div>

        {/* Hero selection */}
        <div className="flex flex-col gap-2">
          <p className="font-stats text-[9px] uppercase tracking-wider text-on-surface-variant/50">Héroe objetivo</p>
          <div className="flex gap-3 flex-wrap justify-center">
            {ap.heroesInKingdom.map(c => {
              const isBurningCard = burning && selectedHeroId === c.instId;
              return (
                <div
                  key={c.instId}
                  onClick={() => !burning && (setSelectedHeroId(c.instId), setSelectedAllyIds([]))}
                  className={`relative cursor-pointer transition-all rounded-xl ${
                    isBurningCard ? 'burning-card' :
                    selectedHeroId === c.instId ? 'ring-2 ring-error scale-105' : 'opacity-70 hover:opacity-100 hover:scale-105'
                  }`}
                >
                  <CardComponent card={c} state={state} selected={selectedHeroId === c.instId} />
                  {isBurningCard && embers.map(e => (
                    <div key={e.id} className="ember" style={{
                      left: `${e.x}%`, top: `${e.y}%`,
                      width: e.size, height: e.size,
                      background: e.color,
                      boxShadow: `0 0 ${e.size * 2}px ${e.color}`,
                      animationDelay: `${Math.random() * 0.3}s`,
                    }} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Ally selection */}
        {selectedHeroId && (
          <div className="flex flex-col gap-2">
            <p className="font-stats text-[9px] uppercase tracking-wider text-on-surface-variant/50">
              Aliados para combatir
            </p>
            {alliesForHero.length === 0
              ? <p className="text-[11px] text-error/60">No hay Aliados disponibles en esta ubicación.</p>
              : (
                <div className="flex gap-3 flex-wrap justify-center">
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
                          className={`cursor-pointer transition-all rounded-xl ${
                            isBurningCard ? 'burning-card' :
                            sel ? 'ring-2 ring-primary scale-105' : 'opacity-60 hover:opacity-100 hover:scale-105'
                          }`}
                        >
                          <CardComponent card={c} state={state} selected={sel} />
                          {isBurningCard && embers.map(e => (
                            <div key={e.id} className="ember" style={{
                              left: `${e.x}%`, top: `${e.y}%`,
                              width: e.size, height: e.size,
                              background: e.color,
                              boxShadow: `0 0 ${e.size * 2}px ${e.color}`,
                              animationDelay: `${Math.random() * 0.3}s`,
                            }} />
                          ))}
                        </div>
                        {isAdj && !burning && (
                          <span className="absolute -top-1 -right-1 font-stats text-[8px] bg-primary text-on-primary px-1 rounded-full leading-tight">adj</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        )}

        {/* Strength comparison */}
        {selectedHeroId && (
          <div className="flex items-center gap-3 bg-surface-container/60 rounded-xl px-3 py-2">
            <div className="flex flex-col items-center">
              <span className="font-stats text-[9px] text-on-surface-variant/50 uppercase">Aliados</span>
              <span className={`font-stats text-lg font-bold ${allyStr >= heroStr ? 'text-green-400' : 'text-amber-400'}`}>{allyStr}</span>
            </div>
            <span className="text-on-surface-variant/40 font-stats text-xs">vs</span>
            <div className="flex flex-col items-center">
              <span className="font-stats text-[9px] text-on-surface-variant/50 uppercase">Héroe</span>
              <span className="font-stats text-lg font-bold text-error">{heroStr}</span>
            </div>
            <div className="ml-auto font-stats text-[10px]">
              {allyStr >= heroStr
                ? <span className="text-green-400">✓ Suficiente fuerza</span>
                : <span className="text-amber-400">Necesitas {heroStr - allyStr} más</span>}
            </div>
          </div>
        )}

        {/* Confirm */}
        <div className="flex justify-end">
          <button
            disabled={!canConfirm}
            onClick={confirm}
            className="px-4 py-2 rounded-xl border border-error/50 bg-error/10 text-error font-stats text-xs uppercase tracking-wider hover:bg-error/20 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
          >
            Vencer
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { CardType } from '../core/types';
import type { GameState, CardInstId, LocationId } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';

const TRIGGER_MSG: Record<string, string> = {
  VANQUISH_4PLUS: '¡El oponente ha derrotado un Héroe de Fuerza 4 o superior!',
  ALLY_3PLUS: '¡El oponente tiene 3 o más Aliados en su Reino!',
  ALLY_4PLUS_STR: '¡El oponente tiene un Aliado de Fuerza 4 o superior!',
};

interface Props { state: GameState }

export function ConditionModal({ state }: Props) {
  const store = useGameStore();
  const { pendingCondition } = state;

  const [selectedCondId, setSelectedCondId] = useState<CardInstId | null>(null);
  const [selectedHeroId, setSelectedHeroId] = useState<CardInstId | null>(null);
  const [selectedDiscardIds, setSelectedDiscardIds] = useState<CardInstId[]>([]);
  const [perspicazAllyId, setPerspicazAllyId] = useState<CardInstId | null>(null);
  const [perspicazLocId, setPerspicazLocId] = useState<LocationId | null>(null);
  const [obsesionPlay, setObsesionPlay] = useState<boolean | null>(null);
  const [obsesionLocId, setObsesionLocId] = useState<LocationId | null>(null);

  if (!pendingCondition) return null;
  const { reactingPlayerId, eligibleCardInstIds } = pendingCondition;
  const reactingPlayer = state.players.find(p => p.id === reactingPlayerId)!;
  if (reactingPlayer.isAI) return null;

  const opponentPlayer = state.players.find(p => p.id !== reactingPlayerId)!;
  const plugin = getPlugin(reactingPlayer.villainId);
  const opPlugin = getPlugin(opponentPlayer.villainId);

  const condCard = selectedCondId ? state.allCards[selectedCondId] : null;
  const defId = condCard?.defId ?? '';

  // ── Pre-computations ──────────────────────────────────────────────────────

  // Tiranía: top 3 of reacting player's deck (will be drawn)
  const tiraniaWillDraw = useMemo(() =>
    reactingPlayer.villainDeckInstIds.slice(0, 3)
      .map(id => state.allCards[id]).filter(Boolean),
  [reactingPlayer.villainDeckInstIds, state.allCards]);

  // Malicia: heroes in reacting player's kingdom with ≤4 strength
  const maliciaHeroes = useMemo(() =>
    Object.values(reactingPlayer.locationStates)
      .flatMap(ls => ls.heroCardInstIds)
      .map(id => state.allCards[id])
      .filter(c => c && getEffectiveStrength(state, c.instId) <= 4),
  [reactingPlayer.locationStates, state]);

  // Obsesión: scan own fate deck for first hero
  const { obsNonHeroes, obsHero } = useMemo(() => {
    const nonHeroes: typeof state.allCards[string][] = [];
    let hero: typeof state.allCards[string] | null = null;
    for (const id of reactingPlayer.fateDeckInstIds) {
      const c = state.allCards[id];
      if (!c) continue;
      if (c.cardType === CardType.HERO) { hero = c; break; }
      nonHeroes.push(c);
    }
    return { obsNonHeroes: nonHeroes, obsHero: hero };
  }, [reactingPlayer.fateDeckInstIds, state.allCards]);

  // Perspicaz: allies in hand
  const perspicazAllies = useMemo(() =>
    reactingPlayer.handInstIds
      .filter(id => id !== selectedCondId)
      .map(id => state.allCards[id])
      .filter(c => c && c.cardType === CardType.ALLY),
  [reactingPlayer.handInstIds, selectedCondId, state.allCards]);

  const unlockedLocs = plugin.locations.filter(l => !reactingPlayer.locationStates[l.id]?.isLocked);
  const opUnlockedLocs = opPlugin.locations.filter(l => !opponentPlayer.locationStates[l.id]?.isLocked);

  // ── Confirm gate ──────────────────────────────────────────────────────────

  const canConfirm = selectedCondId && (
    defId.includes('malicia')   ? (maliciaHeroes.length === 0 || !!selectedHeroId) :
    defId.includes('tirania')   ? selectedDiscardIds.length === 3 :
    defId.includes('obsesion')  ? (!obsHero || obsesionPlay === false || (obsesionPlay === true && !!obsesionLocId)) :
    defId.includes('perspicaz') ? (!!perspicazAllyId && !!perspicazLocId) :
    false
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const resetSub = () => {
    setSelectedHeroId(null);
    setSelectedDiscardIds([]);
    setPerspicazAllyId(null);
    setPerspicazLocId(null);
    setObsesionPlay(null);
    setObsesionLocId(null);
  };

  const handleConfirm = () => {
    if (!selectedCondId) return;
    if (defId.includes('malicia')) {
      store.doResolveCondition(selectedCondId, { targetCardInstId: selectedHeroId ?? undefined });
    } else if (defId.includes('tirania')) {
      store.doResolveCondition(selectedCondId, { discardInstIds: selectedDiscardIds });
    } else if (defId.includes('obsesion')) {
      store.doResolveCondition(selectedCondId, {
        playHero: obsesionPlay ?? false,
        targetLocationId: obsesionLocId ?? undefined,
      });
    } else if (defId.includes('perspicaz')) {
      store.doResolveCondition(selectedCondId, {
        allyInstId: perspicazAllyId ?? undefined,
        targetLocationId: perspicazLocId ?? undefined,
      });
    }
  };

  const toggleDiscard = (id: CardInstId) => {
    setSelectedDiscardIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 3 ? [...prev, id] : prev,
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="modal-overlay">
      <div className="condition-modal">
        <div className="cond-header">
          <span className="cond-player-tag">{reactingPlayer.name}</span>
          <h2 className="cond-title">¡Carta de Condición!</h2>
        </div>

        <p className="cond-trigger-msg">{TRIGGER_MSG[pendingCondition.triggerType]}</p>

        {/* Card selection */}
        <div className="cond-section">
          <p className="cond-label">Puedes responder con:</p>
          <div className="card-select-list">
            {eligibleCardInstIds.map(id => {
              const c = state.allCards[id];
              return (
                <button
                  key={id}
                  className={`card-select-btn ${selectedCondId === id ? 'selected' : ''}`}
                  onClick={() => { setSelectedCondId(id); resetSub(); }}
                >
                  {c?.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Malicia ── */}
        {selectedCondId && defId.includes('malicia') && (
          <div className="cond-section">
            <p className="cond-label">Derrota un Héroe de Fuerza ≤4 en tu Reino:</p>
            {maliciaHeroes.length === 0
              ? <p className="cond-warning">No hay Héroes de Fuerza ≤4 en tu Reino. Puedes jugar igualmente (sin efecto).</p>
              : (
                <div className="card-select-list">
                  {maliciaHeroes.map(c => c && (
                    <button
                      key={c.instId}
                      className={`card-select-btn ${selectedHeroId === c.instId ? 'selected' : ''}`}
                      onClick={() => setSelectedHeroId(c.instId)}
                    >
                      {c.name} (Fuerza: {getEffectiveStrength(state, c.instId)}) — {c.locationId}
                    </button>
                  ))}
                </div>
              )
            }
          </div>
        )}

        {/* ── Tiranía ── */}
        {selectedCondId && defId.includes('tirania') && (
          <div className="cond-section">
            <p className="cond-label">
              Robarás 3 cartas. Elige exactamente 3 para descartar (de tu mano actual + las que robarás):
            </p>
            {tiraniaWillDraw.length > 0 && (
              <p className="cond-hint">
                Cartas que robarás: {tiraniaWillDraw.map(c => c?.name).join(', ')}
              </p>
            )}
            <div className="card-select-list">
              {reactingPlayer.handInstIds
                .filter(id => id !== selectedCondId)
                .map(id => {
                  const c = state.allCards[id];
                  return c && (
                    <button
                      key={id}
                      className={`card-select-btn ${selectedDiscardIds.includes(id) ? 'selected' : ''}`}
                      onClick={() => toggleDiscard(id)}
                    >
                      {c.name}
                    </button>
                  );
                })}
              {tiraniaWillDraw.map(c => c && (
                <button
                  key={c.instId + '_new'}
                  className={`card-select-btn cond-new-card ${selectedDiscardIds.includes(c.instId) ? 'selected' : ''}`}
                  onClick={() => toggleDiscard(c.instId)}
                >
                  {c.name} <span className="cond-new-badge">nueva</span>
                </button>
              ))}
            </div>
            <p className="cond-count">{selectedDiscardIds.length} / 3 seleccionadas</p>
          </div>
        )}

        {/* ── Obsesión ── */}
        {selectedCondId && defId.includes('obsesion') && (
          <div className="cond-section">
            {obsNonHeroes.length > 0 && (
              <p className="cond-hint">
                Cartas descartadas: {obsNonHeroes.map(c => c?.name).join(', ')}
              </p>
            )}
            {obsHero
              ? (
                <>
                  <p className="cond-label">
                    Héroe encontrado: <strong>{obsHero.name}</strong> (Fuerza: {obsHero.baseStrength ?? '?'})
                  </p>
                  <div className="card-select-list">
                    <button
                      className={`card-select-btn ${obsesionPlay === true ? 'selected' : ''}`}
                      onClick={() => setObsesionPlay(true)}
                    >
                      Jugar en el Reino de {opponentPlayer.name}
                    </button>
                    <button
                      className={`card-select-btn ${obsesionPlay === false ? 'selected' : ''}`}
                      onClick={() => { setObsesionPlay(false); setObsesionLocId(null); }}
                    >
                      Descartar
                    </button>
                  </div>
                  {obsesionPlay === true && (
                    <>
                      <p className="cond-label">Elige ubicación en el Reino de {opponentPlayer.name}:</p>
                      <div className="loc-select-list">
                        {opUnlockedLocs.map(l => (
                          <button
                            key={l.id}
                            className={`loc-select-btn ${obsesionLocId === l.id ? 'selected' : ''}`}
                            onClick={() => setObsesionLocId(l.id)}
                          >
                            {l.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )
              : <p className="cond-warning">No hay Héroes en tu mazo de Destino. Puedes jugar para descartar las cartas reveladas.</p>
            }
          </div>
        )}

        {/* ── Perspicaz ── */}
        {selectedCondId && defId.includes('perspicaz') && (
          <div className="cond-section">
            <p className="cond-label">Elige un Aliado de tu mano para jugar gratis:</p>
            {perspicazAllies.length === 0
              ? <p className="cond-warning">No tienes Aliados en la mano.</p>
              : (
                <div className="card-select-list">
                  {perspicazAllies.map(c => c && (
                    <button
                      key={c.instId}
                      className={`card-select-btn ${perspicazAllyId === c.instId ? 'selected' : ''}`}
                      onClick={() => { setPerspicazAllyId(c.instId); setPerspicazLocId(null); }}
                    >
                      {c.name} (Fuerza: {c.baseStrength ?? '?'})
                    </button>
                  ))}
                </div>
              )
            }
            {perspicazAllyId && (
              <>
                <p className="cond-label">Elige ubicación en tu Reino:</p>
                <div className="loc-select-list">
                  {unlockedLocs.map(l => (
                    <button
                      key={l.id}
                      className={`loc-select-btn ${perspicazLocId === l.id ? 'selected' : ''}`}
                      onClick={() => setPerspicazLocId(l.id)}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="cond-footer">
          <button
            className="action-btn secondary"
            onClick={() => store.doResolveCondition(null, {})}
          >
            Ignorar
          </button>
          {selectedCondId && (
            <button
              className="action-btn primary"
              disabled={!canConfirm}
              onClick={handleConfirm}
            >
              Jugar {condCard?.name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

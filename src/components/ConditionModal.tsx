import { useState, useMemo } from 'react';
import { CardType } from '../core/types';
import type { GameState, CardInstId, LocationId, PlayerState } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { EffectId } from '../core/villains/effectIds';
import { useGameStore } from '../state/gameStore';

const TRIGGER_MSG: Record<string, string> = {
  VANQUISH_4PLUS: '¡El oponente ha derrotado un Héroe de Fuerza 4 o superior!',
  ALLY_3PLUS:     '¡El oponente tiene 3 o más Aliados en su Reino!',
  ALLY_4PLUS_STR: '¡El oponente tiene un Aliado de Fuerza 4 o superior!',
};

// ─── MALICIA RESOLVER ─────────────────────────────────────────────────────────

function MaliciaResolver({ state, reactingPlayer, condInstId }: {
  state: GameState; reactingPlayer: PlayerState; condInstId: CardInstId;
}) {
  const doResolveCondition = useGameStore(s => s.doResolveCondition);
  const [selectedHeroId, setSelectedHeroId] = useState<CardInstId | null>(null);

  const heroes = useMemo(() =>
    Object.values(reactingPlayer.locationStates)
      .flatMap(ls => ls.heroCardInstIds)
      .map(id => state.allCards[id])
      .filter(c => c && getEffectiveStrength(state, c.instId) <= 4),
  [reactingPlayer.locationStates, state]);

  return (
    <div className="cond-section">
      <p className="cond-label">Derrota un Héroe de Fuerza ≤4 en tu Reino:</p>
      {heroes.length === 0
        ? <p className="cond-warning">No hay Héroes de Fuerza ≤4. Puedes jugar igualmente (sin efecto).</p>
        : (
          <div className="card-select-list">
            {heroes.map(c => c && (
              <button key={c.instId}
                className={`card-select-btn ${selectedHeroId === c.instId ? 'selected' : ''}`}
                onClick={() => setSelectedHeroId(c.instId)}>
                {c.name} (Fuerza: {getEffectiveStrength(state, c.instId)}) — {c.locationId}
              </button>
            ))}
          </div>
        )}
      {(heroes.length === 0 || selectedHeroId) && (
        <button className="action-btn primary"
          onClick={() => doResolveCondition(condInstId, { targetCardInstId: selectedHeroId ?? undefined })}>
          Jugar Malicia
        </button>
      )}
    </div>
  );
}

// ─── TIRANÍA RESOLVER ─────────────────────────────────────────────────────────

function TiraniaResolver({ state, reactingPlayer, condInstId }: {
  state: GameState; reactingPlayer: PlayerState; condInstId: CardInstId;
}) {
  const doResolveCondition = useGameStore(s => s.doResolveCondition);
  const [selectedDiscardIds, setSelectedDiscardIds] = useState<CardInstId[]>([]);

  const willDraw = useMemo(() =>
    reactingPlayer.villainDeckInstIds.slice(0, 3).map(id => state.allCards[id]).filter(Boolean),
  [reactingPlayer.villainDeckInstIds, state.allCards]);

  const toggle = (id: CardInstId) =>
    setSelectedDiscardIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 3 ? [...prev, id] : prev,
    );

  const handCards = reactingPlayer.handInstIds.filter(id => id !== condInstId);

  return (
    <div className="cond-section">
      <p className="cond-label">Robarás 3 cartas. Elige exactamente 3 para descartar:</p>
      {willDraw.length > 0 && (
        <p className="cond-hint">Cartas que robarás: {willDraw.map(c => c?.name).join(', ')}</p>
      )}
      <div className="card-select-list">
        {handCards.map(id => {
          const c = state.allCards[id];
          return c && (
            <button key={id}
              className={`card-select-btn ${selectedDiscardIds.includes(id) ? 'selected' : ''}`}
              onClick={() => toggle(id)}>
              {c.name}
            </button>
          );
        })}
        {willDraw.map(c => c && (
          <button key={c.instId + '_new'}
            className={`card-select-btn cond-new-card ${selectedDiscardIds.includes(c.instId) ? 'selected' : ''}`}
            onClick={() => toggle(c.instId)}>
            {c.name} <span className="cond-new-badge">nueva</span>
          </button>
        ))}
      </div>
      <p className="cond-count">{selectedDiscardIds.length} / 3 seleccionadas</p>
      {selectedDiscardIds.length === 3 && (
        <button className="action-btn primary"
          onClick={() => doResolveCondition(condInstId, { discardInstIds: selectedDiscardIds })}>
          Jugar Tiranía
        </button>
      )}
    </div>
  );
}

// ─── OBSESIÓN RESOLVER ────────────────────────────────────────────────────────

function ObsesionResolver({ state, reactingPlayer, condInstId, opponentPlayer }: {
  state: GameState; reactingPlayer: PlayerState; condInstId: CardInstId; opponentPlayer: PlayerState;
}) {
  const doResolveCondition = useGameStore(s => s.doResolveCondition);
  const [play, setPlay] = useState<boolean | null>(null);
  const [locId, setLocId] = useState<LocationId | null>(null);

  const { nonHeroes, hero } = useMemo(() => {
    const nonHeroes: NonNullable<typeof state.allCards[string]>[] = [];
    let hero: typeof state.allCards[string] | null = null;
    for (const id of reactingPlayer.fateDeckInstIds) {
      const c = state.allCards[id];
      if (!c) continue;
      if (c.cardType === CardType.HERO) { hero = c; break; }
      nonHeroes.push(c);
    }
    return { nonHeroes, hero };
  }, [reactingPlayer.fateDeckInstIds, state.allCards]);

  const opPlugin = getPlugin(opponentPlayer.villainId);
  const opLocs = opPlugin.locations.filter(l => !opponentPlayer.locationStates[l.id]?.isLocked);

  return (
    <div className="cond-section">
      {nonHeroes.length > 0 && (
        <p className="cond-hint">Cartas descartadas: {nonHeroes.map(c => c?.name).join(', ')}</p>
      )}
      {hero ? (
        <>
          <p className="cond-label">Héroe encontrado: <strong>{hero.name}</strong> (Fuerza: {hero.baseStrength ?? '?'})</p>
          <div className="card-select-list">
            <button className={`card-select-btn ${play === true ? 'selected' : ''}`}
              onClick={() => setPlay(true)}>
              Jugar en el Reino de {opponentPlayer.name}
            </button>
            <button className={`card-select-btn ${play === false ? 'selected' : ''}`}
              onClick={() => { setPlay(false); setLocId(null); }}>
              Descartar
            </button>
          </div>
          {play === true && (
            <>
              <p className="cond-label">Elige ubicación en el Reino de {opponentPlayer.name}:</p>
              <div className="loc-select-list">
                {opLocs.map(l => (
                  <button key={l.id}
                    className={`loc-select-btn ${locId === l.id ? 'selected' : ''}`}
                    onClick={() => setLocId(l.id)}>{l.name}</button>
                ))}
              </div>
            </>
          )}
          {(play === false || (play === true && locId)) && (
            <button className="action-btn primary"
              onClick={() => doResolveCondition(condInstId, { playHero: play ?? false, targetLocationId: locId ?? undefined })}>
              Jugar Obsesión
            </button>
          )}
        </>
      ) : (
        <>
          <p className="cond-warning">No hay Héroes en tu mazo de Destino.</p>
          <button className="action-btn primary"
            onClick={() => doResolveCondition(condInstId, { playHero: false })}>
            Jugar Obsesión (sin efecto)
          </button>
        </>
      )}
    </div>
  );
}

// ─── PERSPICAZ RESOLVER ───────────────────────────────────────────────────────

function PerspicazResolver({ state, reactingPlayer, condInstId }: {
  state: GameState; reactingPlayer: PlayerState; condInstId: CardInstId;
}) {
  const doResolveCondition = useGameStore(s => s.doResolveCondition);
  const [allyId, setAllyId] = useState<CardInstId | null>(null);
  const [locId, setLocId]   = useState<LocationId | null>(null);

  const allies = useMemo(() =>
    reactingPlayer.handInstIds
      .filter(id => id !== condInstId)
      .map(id => state.allCards[id])
      .filter(c => c && c.cardType === CardType.ALLY),
  [reactingPlayer.handInstIds, condInstId, state.allCards]);

  const plugin = getPlugin(reactingPlayer.villainId);
  const unlockedLocs = plugin.locations.filter(l => !reactingPlayer.locationStates[l.id]?.isLocked);

  return (
    <div className="cond-section">
      <p className="cond-label">Elige un Aliado de tu mano para jugar gratis:</p>
      {allies.length === 0
        ? <p className="cond-warning">No tienes Aliados en la mano.</p>
        : (
          <div className="card-select-list">
            {allies.map(c => c && (
              <button key={c.instId}
                className={`card-select-btn ${allyId === c.instId ? 'selected' : ''}`}
                onClick={() => { setAllyId(c.instId); setLocId(null); }}>
                {c.name} (Fuerza: {c.baseStrength ?? '?'})
              </button>
            ))}
          </div>
        )}
      {allyId && (
        <>
          <p className="cond-label">Elige ubicación en tu Reino:</p>
          <div className="loc-select-list">
            {unlockedLocs.map(l => (
              <button key={l.id}
                className={`loc-select-btn ${locId === l.id ? 'selected' : ''}`}
                onClick={() => setLocId(l.id)}>{l.name}</button>
            ))}
          </div>
          {locId && (
            <button className="action-btn primary"
              onClick={() => doResolveCondition(condInstId, { allyInstId: allyId, targetLocationId: locId })}>
              Jugar Perspicaz
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── ORCHESTRATOR ─────────────────────────────────────────────────────────────

interface Props { state: GameState }

export function ConditionModal({ state }: Props) {
  const doResolveCondition = useGameStore(s => s.doResolveCondition);
  const { pendingCondition } = state;
  const [selectedCondId, setSelectedCondId] = useState<CardInstId | null>(null);

  if (!pendingCondition) return null;
  const { reactingPlayerId, eligibleCardInstIds } = pendingCondition;
  const reactingPlayer = state.players.find(p => p.id === reactingPlayerId)!;
  if (reactingPlayer.isAI) return null;

  const opponentPlayer = state.players.find(p => p.id !== reactingPlayerId)!;
  const condCard = selectedCondId ? state.allCards[selectedCondId] : null;

  // Dispatch by effect ID — replaces the brittle defId.includes() pattern
  const isType = (effectId: string) => condCard?.effectIds.includes(effectId) ?? false;

  return (
    <div className="modal-overlay">
      <div className="condition-modal">
        <div className="cond-header">
          <span className="cond-player-tag">{reactingPlayer.name}</span>
          <h2 className="cond-title">¡Carta de Condición!</h2>
        </div>
        <p className="cond-trigger-msg">{TRIGGER_MSG[pendingCondition.triggerType]}</p>

        <div className="cond-section">
          <p className="cond-label">Puedes responder con:</p>
          <div className="card-select-list">
            {eligibleCardInstIds.map(id => (
              <button key={id}
                className={`card-select-btn ${selectedCondId === id ? 'selected' : ''}`}
                onClick={() => setSelectedCondId(id)}>
                {state.allCards[id]?.name}
              </button>
            ))}
          </div>
        </div>

        {selectedCondId && isType(EffectId.MALICIA_COND) && (
          <MaliciaResolver state={state} reactingPlayer={reactingPlayer} condInstId={selectedCondId} />
        )}
        {selectedCondId && isType(EffectId.TIRANIA_COND) && (
          <TiraniaResolver state={state} reactingPlayer={reactingPlayer} condInstId={selectedCondId} />
        )}
        {selectedCondId && isType(EffectId.OBSESION_COND) && (
          <ObsesionResolver state={state} reactingPlayer={reactingPlayer} condInstId={selectedCondId} opponentPlayer={opponentPlayer} />
        )}
        {selectedCondId && isType(EffectId.PERSPICAZ_COND) && (
          <PerspicazResolver state={state} reactingPlayer={reactingPlayer} condInstId={selectedCondId} />
        )}

        <div className="cond-footer">
          <button className="action-btn secondary" onClick={() => doResolveCondition(null, {})}>
            Ignorar
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { CardType } from '../core/types';
import type { GameState, CardInstId, LocationId, PlayerState } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { EffectId } from '../core/villains/effectIds';
import { useGameStore } from '../state/gameStore';

const OVL   = 'fixed inset-0 bg-black/75 flex items-center justify-center z-100 backdrop-blur-sm';
const SEL   = 'px-2.5 py-1.5 rounded border border-outline-variant/40 text-xs font-stats text-on-surface-variant bg-surface-container hover:border-primary hover:text-primary transition-all';
const ACT   = 'px-2.5 py-1.5 rounded border border-tertiary bg-tertiary/10 text-tertiary text-xs font-stats font-bold';
const BTN   = 'px-3 py-1.5 rounded border border-primary/50 bg-primary-container text-primary text-xs font-stats font-bold uppercase tracking-wide hover:bg-primary/20 transition-all disabled:opacity-40';
const PANEL = 'bg-surface-container-high border border-outline-variant/30 rounded-lg p-3 flex flex-col gap-2.5';

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
    <div className={PANEL}>
      <p className="text-xs text-on-surface-variant">Derrota un Héroe de Fuerza ≤4 en tu Reino:</p>
      {heroes.length === 0
        ? <p className="text-xs text-error/70">No hay Héroes de Fuerza ≤4. Puedes jugar igualmente (sin efecto).</p>
        : (
          <div className="flex flex-wrap gap-1.5">
            {heroes.map(c => c && (
              <button key={c.instId}
                className={selectedHeroId === c.instId ? ACT : `${SEL} border-error/40 text-error hover:border-error`}
                onClick={() => setSelectedHeroId(c.instId)}>
                {c.name} (F:{getEffectiveStrength(state, c.instId)}) — {c.locationId}
              </button>
            ))}
          </div>
        )}
      {(heroes.length === 0 || selectedHeroId) && (
        <button className={BTN}
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
    <div className={PANEL}>
      <p className="text-xs text-on-surface-variant">Robarás 3 cartas. Elige exactamente 3 para descartar:</p>
      {willDraw.length > 0 && (
        <p className="text-xs text-primary/70">
          Cartas que robarás: <span className="text-primary">{willDraw.map(c => c?.name).join(', ')}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {handCards.map(id => {
          const c = state.allCards[id];
          return c && (
            <button key={id}
              className={selectedDiscardIds.includes(id) ? ACT : SEL}
              onClick={() => toggle(id)}>
              {c.name}
            </button>
          );
        })}
        {willDraw.map(c => c && (
          <button key={c.instId + '_new'}
            className={`${selectedDiscardIds.includes(c.instId) ? ACT : SEL} border-dashed`}
            onClick={() => toggle(c.instId)}>
            {c.name} <span className="ml-1 text-[9px] text-tertiary/70">(nueva)</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-on-surface-variant">{selectedDiscardIds.length} / 3 seleccionadas</p>
      {selectedDiscardIds.length === 3 && (
        <button className={BTN}
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
  const [play,  setPlay]  = useState<boolean | null>(null);
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
  const opLocs   = opPlugin.locations.filter(l => !opponentPlayer.locationStates[l.id]?.isLocked);

  return (
    <div className={PANEL}>
      {nonHeroes.length > 0 && (
        <p className="text-xs text-primary/70">
          Descartadas: <span className="text-primary">{nonHeroes.map(c => c?.name).join(', ')}</span>
        </p>
      )}
      {hero ? (
        <>
          <p className="text-xs text-on-surface-variant">
            Héroe: <strong className="text-on-surface">{hero.name}</strong> (F:{hero.baseStrength ?? '?'})
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button className={play === true ? ACT : SEL} onClick={() => setPlay(true)}>
              Jugar en el Reino de {opponentPlayer.name}
            </button>
            <button className={play === false ? ACT : SEL}
              onClick={() => { setPlay(false); setLocId(null); }}>
              Descartar
            </button>
          </div>
          {play === true && (
            <>
              <p className="text-xs text-on-surface-variant">Elige ubicación en el Reino de {opponentPlayer.name}:</p>
              <div className="flex flex-wrap gap-1.5">
                {opLocs.map(l => (
                  <button key={l.id}
                    className={locId === l.id ? ACT : SEL}
                    onClick={() => setLocId(l.id)}>{l.name}</button>
                ))}
              </div>
            </>
          )}
          {(play === false || (play === true && locId)) && (
            <button className={BTN}
              onClick={() => doResolveCondition(condInstId, { playHero: play ?? false, targetLocationId: locId ?? undefined })}>
              Jugar Obsesión
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-error/70">No hay Héroes en tu mazo de Destino.</p>
          <button className={BTN}
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
  const [locId,  setLocId]  = useState<LocationId | null>(null);

  const allies = useMemo(() =>
    reactingPlayer.handInstIds
      .filter(id => id !== condInstId)
      .map(id => state.allCards[id])
      .filter(c => c && c.cardType === CardType.ALLY),
  [reactingPlayer.handInstIds, condInstId, state.allCards]);

  const plugin       = getPlugin(reactingPlayer.villainId);
  const unlockedLocs = plugin.locations.filter(l => !reactingPlayer.locationStates[l.id]?.isLocked);

  return (
    <div className={PANEL}>
      <p className="text-xs text-on-surface-variant">Elige un Aliado de tu mano para jugar gratis:</p>
      {allies.length === 0
        ? <p className="text-xs text-error/70">No tienes Aliados en la mano.</p>
        : (
          <div className="flex flex-wrap gap-1.5">
            {allies.map(c => c && (
              <button key={c.instId}
                className={allyId === c.instId ? ACT : SEL}
                onClick={() => { setAllyId(c.instId); setLocId(null); }}>
                {c.name} (F:{c.baseStrength ?? '?'})
              </button>
            ))}
          </div>
        )}
      {allyId && (
        <>
          <p className="text-xs text-on-surface-variant">Elige ubicación en tu Reino:</p>
          <div className="flex flex-wrap gap-1.5">
            {unlockedLocs.map(l => (
              <button key={l.id}
                className={locId === l.id ? ACT : SEL}
                onClick={() => setLocId(l.id)}>{l.name}</button>
            ))}
          </div>
          {locId && (
            <button className={BTN}
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
  const reactingPlayer  = state.players.find(p => p.id === reactingPlayerId)!;
  if (reactingPlayer.isAI) return null;
  const opponentPlayer  = state.players.find(p => p.id !== reactingPlayerId)!;
  const condCard        = selectedCondId ? state.allCards[selectedCondId] : null;
  const isType = (effectId: string) => condCard?.effectIds.includes(effectId) ?? false;

  return (
    <div className={OVL}>
      <div className="bg-surface-container border border-tertiary/50 rounded-xl p-5 w-105 max-w-[94vw] max-h-[90vh] overflow-y-auto flex flex-col gap-4 shadow-[0_0_40px_rgba(233,195,73,0.25)]">

        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="bg-tertiary text-on-tertiary font-stats text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded">
            {reactingPlayer.name}
          </span>
          <h2 className="font-serif text-lg font-bold text-tertiary">¡Carta de Condición!</h2>
        </div>
        <p className="text-xs text-on-surface italic">{TRIGGER_MSG[pendingCondition.triggerType]}</p>

        {/* Eligible cards */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-on-surface-variant">Puedes responder con:</p>
          <div className="flex flex-wrap gap-1.5">
            {eligibleCardInstIds.map(id => (
              <button key={id}
                className={selectedCondId === id ? ACT : `${SEL} border-tertiary/30 hover:border-tertiary hover:text-tertiary`}
                onClick={() => setSelectedCondId(id)}>
                {state.allCards[id]?.name}
              </button>
            ))}
          </div>
        </div>

        {/* Resolvers */}
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

        {/* Footer */}
        <div className="flex justify-end border-t border-outline-variant/20 pt-3">
          <button
            className="px-3 py-1.5 rounded border border-outline-variant/50 text-on-surface-variant text-xs font-stats hover:border-outline hover:text-on-surface transition-all"
            onClick={() => doResolveCondition(null, {})}>
            Ignorar
          </button>
        </div>
      </div>
    </div>
  );
}

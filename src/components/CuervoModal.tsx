import { useState } from 'react';
import { ActionType, CardType } from '../core/types';
import type { GameState, CardInstId, LocationId } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getPlayer, getEffectiveStrength } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';
import { ACTION_LABELS } from './shared/actionLabels';
import { modalStyles } from '../styles/modalStyles';

const OVL = modalStyles.overlay;
const SEL = modalStyles.buttonSelect;
const ACT = modalStyles.buttonActive;
const BTN = modalStyles.buttonPrimary;
const PANEL = modalStyles.panel;

interface Props { state: GameState }

export function CuervoModal({ state }: Props) {
  const doResolveCuervo = useGameStore(s => s.doResolveCuervo);
  const { pendingCuervo } = state;

  const [selectedAction,     setSelectedAction]     = useState<ActionType | null>(null);
  const [selectedCardId,     setSelectedCardId]     = useState<CardInstId | null>(null);
  const [selectedAllyIds,    setSelectedAllyIds]    = useState<CardInstId[]>([]);
  const [targetLocId,        setTargetLocId]        = useState<LocationId | null>(null);
  const [selectedDiscardIds, setSelectedDiscardIds] = useState<CardInstId[]>([]);

  if (!pendingCuervo) return null;

  const { playerId, locationId } = pendingCuervo;
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const locDef = plugin.locations.find(l => l.id === locationId)!;

  const availableActions = locDef.actions
    .filter(a => a.type !== ActionType.FATE && a.type !== ActionType.ACTIVATE_CARD)
    .reduce<typeof locDef.actions>((acc, a) => {
      if (!acc.some(x => x.type === a.type)) acc.push(a);
      return acc;
    }, []);

  const kingdomCards    = Object.values(player.locationStates)
    .flatMap(ls => [...ls.villainCardInstIds, ...ls.heroCardInstIds])
    .map(id => state.allCards[id]).filter(Boolean);
  const heroesInKingdom = kingdomCards.filter(c => c.cardType === CardType.HERO);
  const alliesInKingdom = kingdomCards.filter(c => c.cardType === CardType.ALLY);
  const movableCards    = kingdomCards.filter(
    c => (c.cardType === CardType.ALLY || c.cardType === CardType.ITEM || c.cardType === CardType.CURSE)
      && !c.attachedToInstId,
  );
  const allUnlockedLocs = plugin.locations.filter(l => !player.locationStates[l.id]?.isLocked);

  function getAdjLocs(_cardLocId: string | undefined) {
    // Retorna todas las ubicaciones desbloqueadas (no solo adyacentes)
    // para permitir que el Cuervo se mueva a cualquier ubicación
    return plugin.locations.filter(l => !player.locationStates[l.id]?.isLocked);
  }

  function resetSub() {
    setSelectedCardId(null); setSelectedAllyIds([]);
    setTargetLocId(null);    setSelectedDiscardIds([]);
  }

  function confirm() {
    if (!selectedAction) return;
    switch (selectedAction) {
      case ActionType.GAIN_POWER:
        doResolveCuervo(selectedAction, {});
        break;
      case ActionType.PLAY_CARD:
        if (!selectedCardId || !targetLocId) return;
        doResolveCuervo(selectedAction, { cardInstId: selectedCardId, targetLocationId: targetLocId });
        break;
      case ActionType.VANQUISH:
        if (!selectedCardId || selectedAllyIds.length === 0) return;
        doResolveCuervo(selectedAction, { cardInstId: selectedCardId, allyInstIds: selectedAllyIds });
        break;
      case ActionType.MOVE_ITEM_ALLY:
      case ActionType.MOVE_HERO:
        if (!selectedCardId || !targetLocId) return;
        doResolveCuervo(selectedAction, { cardInstId: selectedCardId, targetLocationId: targetLocId });
        break;
      case ActionType.DISCARD:
        if (selectedDiscardIds.length === 0) return;
        doResolveCuervo(selectedAction, { cardInstIds: selectedDiscardIds });
        break;
    }
  }

  return (
    <div className={OVL}>
      <div className={modalStyles.container}>
        <h2 className={`${modalStyles.title} text-primary`}>El Cuervo</h2>
        <p className={`${modalStyles.description} text-on-surface-variant`}>
          Elige una acción en <strong className="text-on-surface">{locDef.name}</strong> (no puede realizar acciones FATE):
        </p>

        {/* Action selector */}
        <div className="flex flex-wrap gap-2">
          {availableActions.map((a, idx) => (
            <button key={idx}
              className={selectedAction === a.type ? ACT : SEL}
              onClick={() => { setSelectedAction(a.type); resetSub(); }}>
              {ACTION_LABELS[a.type] ?? a.type}
              {a.value && a.type === ActionType.GAIN_POWER ? ` (+${a.value})` : ''}
            </button>
          ))}
        </div>

        {/* GAIN POWER */}
        {selectedAction === ActionType.GAIN_POWER && (
          <div className={PANEL}>
            <p className="text-xs text-on-surface-variant">
              Ganarás {locDef.actions.find(a => a.type === ActionType.GAIN_POWER)?.value ?? 2} de Poder.
            </p>
            <button className={BTN} onClick={confirm}>Confirmar</button>
          </div>
        )}

        {/* PLAY CARD */}
        {selectedAction === ActionType.PLAY_CARD && (
          <div className={PANEL}>
            <p className="text-xs text-on-surface-variant">Selecciona una carta de tu mano:</p>
            <div className="flex flex-wrap gap-1.5">
              {player.handInstIds.map(id => {
                const c = state.allCards[id];
                if (!c) return null;
                const cost = Math.max(0, c.baseCost + c.costModifier);
                return (
                  <button key={id}
                    className={selectedCardId === id ? ACT : player.power < cost ? `${SEL} opacity-35` : SEL}
                    disabled={player.power < cost}
                    onClick={() => { setSelectedCardId(id); setTargetLocId(null); }}>
                    {c.name} <span className="text-tertiary">({cost}⚡)</span>
                  </button>
                );
              })}
            </div>
            {selectedCardId && (
              <>
                <p className="text-xs text-on-surface-variant">Elige ubicación de destino:</p>
                <div className="flex flex-wrap gap-1.5">
                  {allUnlockedLocs.map(l => (
                    <button key={l.id} className={targetLocId === l.id ? ACT : SEL}
                      onClick={() => setTargetLocId(l.id)}>{l.name}</button>
                  ))}
                </div>
              </>
            )}
            {selectedCardId && targetLocId && (
              <button className={BTN} onClick={confirm}>Jugar carta</button>
            )}
          </div>
        )}

        {/* VANQUISH */}
        {selectedAction === ActionType.VANQUISH && (
          <div className={PANEL}>
            <p className="text-xs text-on-surface-variant">Selecciona el Héroe a derrotar:</p>
            <div className="flex flex-wrap gap-1.5">
              {heroesInKingdom.map(c => (
                <button key={c.instId}
                  className={selectedCardId === c.instId ? ACT : `${SEL} border-error/40 text-error hover:border-error`}
                  onClick={() => { setSelectedCardId(c.instId); setSelectedAllyIds([]); }}>
                  {c.name} (F:{getEffectiveStrength(state, c.instId)}) @{c.locationId}
                </button>
              ))}
            </div>
            {selectedCardId && (
              <>
                <p className="text-xs text-on-surface-variant">Selecciona Aliados (misma ubicación):</p>
                <div className="flex flex-wrap gap-1.5">
                  {alliesInKingdom
                    .filter(c => c.locationId === state.allCards[selectedCardId]?.locationId)
                    .map(c => (
                      <button key={c.instId}
                        className={selectedAllyIds.includes(c.instId) ? ACT : SEL}
                        onClick={() => setSelectedAllyIds(prev =>
                          prev.includes(c.instId) ? prev.filter(id => id !== c.instId) : [...prev, c.instId]
                        )}>
                        {c.name} (F:{getEffectiveStrength(state, c.instId)})
                      </button>
                    ))}
                </div>
                <p className="text-xs text-on-surface-variant">
                  Aliados: <span className="text-secondary-container font-bold">
                    {selectedAllyIds.reduce((s, id) => s + getEffectiveStrength(state, id), 0)}
                  </span> / Héroe: <span className="text-error font-bold">{getEffectiveStrength(state, selectedCardId)}</span>
                </p>
                {selectedAllyIds.length > 0 && <button className={BTN} onClick={confirm}>Vencer</button>}
              </>
            )}
          </div>
        )}

        {/* MOVE ITEM/ALLY or MOVE HERO */}
        {(selectedAction === ActionType.MOVE_ITEM_ALLY || selectedAction === ActionType.MOVE_HERO) && (
          <div className={PANEL}>
            <p className="text-xs text-on-surface-variant">
              Selecciona {selectedAction === ActionType.MOVE_HERO ? 'el Héroe' : 'Objeto, Aliado o Maldición'} a mover:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(selectedAction === ActionType.MOVE_HERO ? heroesInKingdom : movableCards).map(c => (
                <button key={c.instId}
                  className={selectedCardId === c.instId ? ACT : SEL}
                  onClick={() => { setSelectedCardId(c.instId); setTargetLocId(null); }}>
                  {c.name} {selectedAction === ActionType.MOVE_ITEM_ALLY ? `[${c.cardType}] ` : ''}@{c.locationId}
                </button>
              ))}
            </div>
            {selectedCardId && (
              <>
                <p className="text-xs text-on-surface-variant">Elige ubicación adyacente:</p>
                <div className="flex flex-wrap gap-1.5">
                  {getAdjLocs(state.allCards[selectedCardId]?.locationId).map(l => (
                    <button key={l.id} className={targetLocId === l.id ? ACT : SEL}
                      onClick={() => setTargetLocId(l.id)}>{l.name}</button>
                  ))}
                </div>
                {targetLocId && (
                  <button className={BTN} onClick={confirm}>
                    {selectedAction === ActionType.MOVE_HERO ? 'Mover Héroe' : 'Mover'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* DISCARD */}
        {selectedAction === ActionType.DISCARD && (
          <div className={PANEL}>
            <p className="text-xs text-on-surface-variant">Selecciona cartas a descartar de la mano:</p>
            <div className="flex flex-wrap gap-1.5">
              {player.handInstIds.map(id => {
                const c = state.allCards[id];
                if (!c) return null;
                return (
                  <button key={id}
                    className={selectedDiscardIds.includes(id) ? ACT : SEL}
                    onClick={() => setSelectedDiscardIds(prev =>
                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                    )}>
                    {c.name}
                  </button>
                );
              })}
            </div>
            {selectedDiscardIds.length > 0 && (
              <button className={BTN} onClick={confirm}>
                Descartar {selectedDiscardIds.length} carta(s)
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end border-t border-outline-variant/20 pt-3">
          <button
            className="px-3 py-1.5 rounded border border-outline-variant/50 text-on-surface-variant text-xs font-stats hover:border-outline hover:text-on-surface transition-all"
            onClick={() => doResolveCuervo(ActionType.GAIN_POWER, { amountOverride: 0 })}
          >
            Omitir acción
          </button>
        </div>
      </div>
    </div>
  );
}

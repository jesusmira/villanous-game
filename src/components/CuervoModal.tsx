import { useState } from 'react';
import { ActionType, CardType } from '../core/types';
import type { GameState, CardInstId, LocationId } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getPlayer, getEffectiveStrength } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';
import { modalStyles } from '../styles/modalStyles';

const OVL  = modalStyles.overlay;
const SEL  = modalStyles.buttonSelect;
const ACT  = modalStyles.buttonActive;
const BTN  = modalStyles.buttonPrimary;
const PANEL = modalStyles.panel;

const ACTION_IMG: Record<string, string> = {
  GAIN_POWER:     '/images/actions/gain_power.png',
  PLAY_CARD:      '/images/actions/play_card.png',
  VANQUISH:       '/images/actions/vanquish.png',
  MOVE_HERO:      '/images/actions/move_hero.png',
  MOVE_ITEM_ALLY: '/images/actions/move_item_ally.png',
  DISCARD:        '/images/actions/discard.png',
};

const ACTION_TOOLTIP: Record<string, string> = {
  GAIN_POWER:     'Ganar Poder',
  PLAY_CARD:      'Jugar Carta',
  VANQUISH:       'Vencer',
  MOVE_HERO:      'Mover Héroe',
  MOVE_ITEM_ALLY: 'Mover Objeto/Aliado',
  DISCARD:        'Descartar',
};

interface Props { state: GameState }

export function CuervoModal({ state }: Props) {
  const doResolveCuervo = useGameStore(s => s.doResolveCuervo);
  const { pendingCuervo } = state;

  const [selectedAction,     setSelectedAction]     = useState<ActionType | null>(null);
  const [selectedCardId,     setSelectedCardId]     = useState<CardInstId | null>(null);
  const [selectedAllyIds,    setSelectedAllyIds]    = useState<CardInstId[]>([]);
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

  function resetSub() {
    setSelectedCardId(null); setSelectedAllyIds([]);
    setSelectedDiscardIds([]);
  }

  function selectAction(type: ActionType) {
    if (type === ActionType.GAIN_POWER) {
      doResolveCuervo(ActionType.GAIN_POWER, {});
      return;
    }
    setSelectedAction(type);
    resetSub();
  }

  const gainPowerValue = locDef.actions.find(a => a.type === ActionType.GAIN_POWER)?.value ?? 2;

  return (
    <div className={OVL}>
      <div className={modalStyles.container}>
        <h2 className={`${modalStyles.title} text-primary`}>El Cuervo</h2>
        <p className={`${modalStyles.description} text-on-surface-variant`}>
          Elige una acción en <strong className="text-on-surface">{locDef.name}</strong>:
        </p>

        {/* Action image buttons */}
        <div className="flex flex-wrap gap-3">
          {availableActions.map((a, idx) => {
            const tooltip = ACTION_TOOLTIP[a.type] ?? a.type;
            const isGain  = a.type === ActionType.GAIN_POWER;
            return (
              <button
                key={idx}
                title={isGain ? `${tooltip} (+${gainPowerValue}⚡)` : tooltip}
                className={`relative w-14 h-14 rounded-xl overflow-hidden border-2 transition-all active:scale-95 ${
                  selectedAction === a.type
                    ? 'border-primary scale-105 shadow-[0_0_14px_rgba(208,188,255,0.4)]'
                    : 'border-outline-variant/40 hover:border-primary/50 hover:scale-105'
                }`}
                onClick={() => selectAction(a.type)}
              >
                <img
                  src={ACTION_IMG[a.type] ?? ''}
                  alt={tooltip}
                  className="w-full h-full object-cover"
                />
                {isGain && (
                  <div className="absolute inset-x-0 bottom-0 py-0.5 bg-black/65 font-stats text-[8px] text-center text-primary uppercase tracking-wide">
                    +{gainPowerValue}⚡
                  </div>
                )}
              </button>
            );
          })}
        </div>

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
                    onClick={() => { setSelectedCardId(id); }}>
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
                    <button key={l.id} className={SEL}
                      onClick={() => doResolveCuervo(ActionType.PLAY_CARD, { cardInstId: selectedCardId, targetLocationId: l.id as LocationId })}>
                      {l.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* VANQUISH */}
        {selectedAction === ActionType.VANQUISH && (
          <div className={PANEL}>
            {!selectedCardId ? (
              <>
                <p className="text-xs text-on-surface-variant">Selecciona el Héroe a derrotar:</p>
                <div className="flex flex-wrap gap-1.5">
                  {heroesInKingdom.map(c => (
                    <button key={c.instId}
                      className={`${SEL} border-error/40 text-error hover:border-error`}
                      onClick={() => { setSelectedCardId(c.instId); setSelectedAllyIds([]); }}>
                      {c.name} <span className="text-on-surface-variant/60 text-[10px]">(F:{getEffectiveStrength(state, c.instId)}) @{c.locationId}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setSelectedCardId(null); setSelectedAllyIds([]); }}
                    className="text-xs text-on-surface-variant/60 hover:text-on-surface transition-colors">← Cambiar</button>
                  <span className="font-stats text-xs text-on-surface-variant flex-1">
                    Vencer: <span className="text-primary font-bold">{state.allCards[selectedCardId]?.name}</span>
                  </span>
                  <span className={`font-stats text-sm font-bold ${
                    selectedAllyIds.reduce((s, id) => s + getEffectiveStrength(state, id), 0) >= getEffectiveStrength(state, selectedCardId)
                      ? 'text-primary' : 'text-on-surface-variant/60'
                  }`}>
                    {selectedAllyIds.reduce((s, id) => s + getEffectiveStrength(state, id), 0)}
                    <span className="text-on-surface-variant/40 text-xs"> / {getEffectiveStrength(state, selectedCardId)}</span>
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant">Selecciona Aliados:</p>
                <div className="flex flex-wrap gap-1.5">
                  {alliesInKingdom
                    .filter(c => c.locationId === state.allCards[selectedCardId]?.locationId)
                    .map(c => {
                      const isSelected = selectedAllyIds.includes(c.instId);
                      return (
                        <button key={c.instId}
                          className={isSelected ? ACT : SEL}
                          onClick={() => {
                            const next = isSelected
                              ? selectedAllyIds.filter(id => id !== c.instId)
                              : [...selectedAllyIds, c.instId];
                            setSelectedAllyIds(next);
                          }}>
                          {c.name} <span className="text-tertiary">(F:{getEffectiveStrength(state, c.instId)})</span>
                        </button>
                      );
                    })}
                </div>
                {selectedAllyIds.length > 0 && (
                  <button className={BTN} onClick={() =>
                    doResolveCuervo(ActionType.VANQUISH, { cardInstId: selectedCardId, allyInstIds: selectedAllyIds })
                  }>
                    Vencer — {selectedAllyIds.length} aliado{selectedAllyIds.length !== 1 ? 's' : ''}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* MOVE ITEM/ALLY or MOVE HERO */}
        {(selectedAction === ActionType.MOVE_ITEM_ALLY || selectedAction === ActionType.MOVE_HERO) && (
          <div className={PANEL}>
            {!selectedCardId ? (
              <>
                <p className="text-xs text-on-surface-variant">
                  Selecciona {selectedAction === ActionType.MOVE_HERO ? 'el Héroe' : 'Objeto, Aliado o Maldición'} a mover:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedAction === ActionType.MOVE_HERO ? heroesInKingdom : movableCards).map(c => (
                    <button key={c.instId} className={SEL}
                      onClick={() => setSelectedCardId(c.instId)}>
                      {c.name} {selectedAction === ActionType.MOVE_ITEM_ALLY ? `[${c.cardType}] ` : ''}
                      <span className="text-on-surface-variant/60 text-[10px]">@{c.locationId}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedCardId(null)}
                    className="text-xs text-on-surface-variant/60 hover:text-on-surface transition-colors">← Cambiar</button>
                  <span className="font-stats text-xs text-on-surface-variant flex-1">
                    Mover: <span className="text-primary font-bold">{state.allCards[selectedCardId]?.name}</span>
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant">Elige ubicación de destino:</p>
                <div className="flex flex-wrap gap-1.5">
                  {allUnlockedLocs.map(l => (
                    <button key={l.id} className={SEL}
                      onClick={() => doResolveCuervo(selectedAction, { cardInstId: selectedCardId, targetLocationId: l.id as LocationId })}>
                      {l.name}
                    </button>
                  ))}
                </div>
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
              <button className={BTN}
                onClick={() => doResolveCuervo(ActionType.DISCARD, { cardInstIds: selectedDiscardIds })}>
                Descartar {selectedDiscardIds.length} carta{selectedDiscardIds.length !== 1 ? 's' : ''}
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

import { useState } from 'react';
import { ActionType, CardType } from '../core/types';
import type { GameState, CardInstId, LocationId } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getPlayer, getEffectiveStrength } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';

interface Props { state: GameState }

export function CuervoModal({ state }: Props) {
  const store = useGameStore();
  const { pendingCuervo } = state;

  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<CardInstId | null>(null);
  const [selectedAllyIds, setSelectedAllyIds] = useState<CardInstId[]>([]);
  const [targetLocId, setTargetLocId] = useState<LocationId | null>(null);
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

  const kingdomCards = Object.values(player.locationStates)
    .flatMap(ls => [...ls.villainCardInstIds, ...ls.heroCardInstIds])
    .map(id => state.allCards[id])
    .filter(Boolean);

  const heroesInKingdom = kingdomCards.filter(c => c.cardType === CardType.HERO);
  const alliesInKingdom = kingdomCards.filter(c => c.cardType === CardType.ALLY);
  const allUnlockedLocs = plugin.locations.filter(l => !player.locationStates[l.id]?.isLocked);

  const actionLabel: Record<string, string> = {
    GAIN_POWER: 'Ganar Poder',
    PLAY_CARD: 'Jugar Carta',
    VANQUISH: 'Vencer',
    MOVE_ITEM_ALLY: 'Mover Objeto/Aliado',
    MOVE_HERO: 'Mover Héroe',
    DISCARD: 'Descartar',
  };

  function resetSub() {
    setSelectedCardId(null);
    setSelectedAllyIds([]);
    setTargetLocId(null);
    setSelectedDiscardIds([]);
  }

  function skip() {
    store.doResolveCuervo(ActionType.GAIN_POWER, { amountOverride: 0 });
  }

  function confirm() {
    if (!selectedAction) return;
    switch (selectedAction) {
      case ActionType.GAIN_POWER:
        store.doResolveCuervo(selectedAction, {});
        break;
      case ActionType.PLAY_CARD:
        if (!selectedCardId || !targetLocId) return;
        store.doResolveCuervo(selectedAction, { cardInstId: selectedCardId, targetLocationId: targetLocId });
        break;
      case ActionType.VANQUISH:
        if (!selectedCardId || selectedAllyIds.length === 0) return;
        store.doResolveCuervo(selectedAction, { cardInstId: selectedCardId, allyInstIds: selectedAllyIds });
        break;
      case ActionType.MOVE_ITEM_ALLY:
        if (!selectedCardId || !targetLocId) return;
        store.doResolveCuervo(selectedAction, { cardInstId: selectedCardId, targetLocationId: targetLocId });
        break;
      case ActionType.MOVE_HERO:
        if (!selectedCardId || !targetLocId) return;
        store.doResolveCuervo(selectedAction, { cardInstId: selectedCardId, targetLocationId: targetLocId });
        break;
      case ActionType.DISCARD:
        if (selectedDiscardIds.length === 0) return;
        store.doResolveCuervo(selectedAction, { cardInstIds: selectedDiscardIds });
        break;
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal cuervo-modal">
        <h2>El Cuervo</h2>
        <p>
          Elige una acción en <strong>{locDef.name}</strong>
          {' '}(no puede realizar acciones FATE):
        </p>

        <div className="slot-buttons">
          {availableActions.map((a, idx) => (
            <button
              key={idx}
              className={`slot-btn ${selectedAction === a.type ? 'active' : ''}`}
              onClick={() => { setSelectedAction(a.type); resetSub(); }}
            >
              {actionLabel[a.type] ?? a.type}
              {a.value && a.type === ActionType.GAIN_POWER ? ` (+${a.value})` : ''}
            </button>
          ))}
        </div>

        {selectedAction === ActionType.GAIN_POWER && (
          <div className="sub-action">
            <p>
              Ganarás{' '}
              {locDef.actions.find(a => a.type === ActionType.GAIN_POWER)?.value ?? 2} de Poder.
            </p>
            <button className="action-btn primary" onClick={confirm}>Confirmar</button>
          </div>
        )}

        {selectedAction === ActionType.PLAY_CARD && (
          <div className="sub-action">
            <p>Selecciona una carta de tu mano:</p>
            <div className="card-select-list">
              {player.handInstIds.map(id => {
                const c = state.allCards[id];
                if (!c) return null;
                const cost = Math.max(0, c.baseCost + c.costModifier);
                return (
                  <button
                    key={id}
                    className={`card-select-btn ${selectedCardId === id ? 'selected' : ''} ${player.power < cost ? 'too-expensive' : ''}`}
                    onClick={() => { setSelectedCardId(id); setTargetLocId(null); }}
                    disabled={player.power < cost}
                  >
                    {c.name} ({cost}💰) [{c.cardType}]
                  </button>
                );
              })}
            </div>
            {selectedCardId && (
              <>
                <p>Elige ubicación de destino:</p>
                <div className="loc-select-list">
                  {allUnlockedLocs.map(l => (
                    <button
                      key={l.id}
                      className={`loc-select-btn ${targetLocId === l.id ? 'selected' : ''}`}
                      onClick={() => setTargetLocId(l.id)}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            {selectedCardId && targetLocId && (
              <button className="action-btn primary" onClick={confirm}>Jugar carta</button>
            )}
          </div>
        )}

        {selectedAction === ActionType.VANQUISH && (
          <div className="sub-action">
            <p>Selecciona el Héroe a derrotar:</p>
            <div className="card-select-list">
              {heroesInKingdom.map(c => (
                <button
                  key={c.instId}
                  className={`card-select-btn ${selectedCardId === c.instId ? 'selected' : ''}`}
                  onClick={() => { setSelectedCardId(c.instId); setSelectedAllyIds([]); }}
                >
                  {c.name} (Fuerza: {getEffectiveStrength(state, c.instId)}) @ {c.locationId}
                </button>
              ))}
            </div>
            {selectedCardId && (
              <>
                <p>Selecciona Aliados (misma ubicación):</p>
                <div className="card-select-list">
                  {alliesInKingdom
                    .filter(c => c.locationId === state.allCards[selectedCardId]?.locationId)
                    .map(c => (
                      <button
                        key={c.instId}
                        className={`card-select-btn ${selectedAllyIds.includes(c.instId) ? 'selected' : ''}`}
                        onClick={() =>
                          setSelectedAllyIds(prev =>
                            prev.includes(c.instId)
                              ? prev.filter(id => id !== c.instId)
                              : [...prev, c.instId],
                          )
                        }
                      >
                        {c.name} (Fuerza: {getEffectiveStrength(state, c.instId)})
                      </button>
                    ))}
                </div>
                <p>
                  Fuerza combinada:{' '}
                  {selectedAllyIds.reduce((s, id) => s + getEffectiveStrength(state, id), 0)}
                  {' '}/ Fuerza del héroe: {getEffectiveStrength(state, selectedCardId)}
                </p>
                {selectedAllyIds.length > 0 && (
                  <button className="action-btn primary" onClick={confirm}>Vencer</button>
                )}
              </>
            )}
          </div>
        )}

        {selectedAction === ActionType.MOVE_ITEM_ALLY && (
          <div className="sub-action">
            <p>Selecciona Objeto, Aliado o Maldición a mover:</p>
            <div className="card-select-list">
              {kingdomCards
                .filter(
                  c =>
                    (c.cardType === CardType.ALLY ||
                      c.cardType === CardType.ITEM ||
                      c.cardType === CardType.CURSE) &&
                    !c.attachedToInstId,
                )
                .map(c => (
                  <button
                    key={c.instId}
                    className={`card-select-btn ${selectedCardId === c.instId ? 'selected' : ''}`}
                    onClick={() => { setSelectedCardId(c.instId); setTargetLocId(null); }}
                  >
                    {c.name} [{c.cardType}] @ {c.locationId}
                  </button>
                ))}
            </div>
            {selectedCardId && (
              <>
                <p>Elige ubicación adyacente:</p>
                <div className="loc-select-list">
                  {(() => {
                    const cardLoc = state.allCards[selectedCardId]?.locationId;
                    const cardLocDef = plugin.locations.find(l => l.id === cardLoc);
                    return (cardLocDef?.adjacentIds ?? [])
                      .filter(id => !player.locationStates[id]?.isLocked)
                      .map(adjId => {
                        const adjLocDef = plugin.locations.find(l => l.id === adjId);
                        return (
                          <button
                            key={adjId}
                            className={`loc-select-btn ${targetLocId === adjId ? 'selected' : ''}`}
                            onClick={() => setTargetLocId(adjId)}
                          >
                            {adjLocDef?.name ?? adjId}
                          </button>
                        );
                      });
                  })()}
                </div>
                {targetLocId && (
                  <button className="action-btn primary" onClick={confirm}>Mover</button>
                )}
              </>
            )}
          </div>
        )}

        {selectedAction === ActionType.MOVE_HERO && (
          <div className="sub-action">
            <p>Selecciona el Héroe a mover:</p>
            <div className="card-select-list">
              {heroesInKingdom.map(c => (
                <button
                  key={c.instId}
                  className={`card-select-btn ${selectedCardId === c.instId ? 'selected' : ''}`}
                  onClick={() => { setSelectedCardId(c.instId); setTargetLocId(null); }}
                >
                  {c.name} @ {c.locationId}
                </button>
              ))}
            </div>
            {selectedCardId && (
              <>
                <p>Elige ubicación adyacente:</p>
                <div className="loc-select-list">
                  {(() => {
                    const heroLoc = state.allCards[selectedCardId]?.locationId;
                    const heroLocDef = plugin.locations.find(l => l.id === heroLoc);
                    return (heroLocDef?.adjacentIds ?? [])
                      .filter(id => !player.locationStates[id]?.isLocked)
                      .map(adjId => {
                        const adjLocDef = plugin.locations.find(l => l.id === adjId);
                        return (
                          <button
                            key={adjId}
                            className={`loc-select-btn ${targetLocId === adjId ? 'selected' : ''}`}
                            onClick={() => setTargetLocId(adjId)}
                          >
                            {adjLocDef?.name ?? adjId}
                          </button>
                        );
                      });
                  })()}
                </div>
                {targetLocId && (
                  <button className="action-btn primary" onClick={confirm}>Mover Héroe</button>
                )}
              </>
            )}
          </div>
        )}

        {selectedAction === ActionType.DISCARD && (
          <div className="sub-action">
            <p>Selecciona cartas a descartar de la mano:</p>
            <div className="card-select-list">
              {player.handInstIds.map(id => {
                const c = state.allCards[id];
                if (!c) return null;
                return (
                  <button
                    key={id}
                    className={`card-select-btn ${selectedDiscardIds.includes(id) ? 'selected' : ''}`}
                    onClick={() =>
                      setSelectedDiscardIds(prev =>
                        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
                      )
                    }
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
            {selectedDiscardIds.length > 0 && (
              <button className="action-btn primary" onClick={confirm}>
                Descartar {selectedDiscardIds.length} carta(s)
              </button>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button className="action-btn secondary" onClick={skip}>
            Omitir acción
          </button>
        </div>
      </div>
    </div>
  );
}

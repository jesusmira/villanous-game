import { useState } from 'react';
import { ActionType, CardType, TurnPhase } from '../core/types';
import type { GameState, CardInstId, LocationId } from '../core/types';
import { getPlugin, getEffectDef } from '../core/villains/registry';
import { getPlayer, getAvailableSlotIndices, getEffectiveStrength } from '../core/engine/stateHelpers';
import { canMovePawn, canVanquish, canMoveItemAlly, canMoveHero } from '../core/engine/RuleEngine';
import { useGameStore } from '../state/gameStore';

interface Props {
  state: GameState;
  playerId: string;
}

export function ActionPanel({ state, playerId }: Props) {
  const store = useGameStore();
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const [selectedCardId, setSelectedCardId] = useState<CardInstId | null>(null);
  const [selectedAllyIds, setSelectedAllyIds] = useState<CardInstId[]>([]);
  const [pendingSlot, setPendingSlot] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [targetLocId, setTargetLocId] = useState<LocationId | null>(null);
  const [targetCardId, setTargetCardId] = useState<CardInstId | null>(null);
  const [effectTargetLocId, setEffectTargetLocId] = useState<LocationId | null>(null);
  const [useMapaId, setUseMapaId] = useState<CardInstId | null>(null);

  if (state.winner) return null;

  const actionLabel: Record<string, string> = {
    GAIN_POWER: 'Ganar Poder',
    PLAY_CARD: 'Jugar Carta',
    FATE: 'Destino',
    VANQUISH: 'Vencer',
    MOVE_ITEM_ALLY: 'Mover Objeto/Aliado',
    MOVE_HERO: 'Mover Héroe',
    ACTIVATE_CARD: 'Activar',
    DISCARD: 'Descartar',
  };

  const currentPlayer = state.players[state.currentPlayerIndex];
  if (currentPlayer.id !== playerId) return null;

  const phase = state.turnPhase;

  // ── MOVE PHASE ──
  if (phase === TurnPhase.MOVE) {
    const validLocs = plugin.locations.filter(
      l => canMovePawn(state, playerId, l.id).valid,
    );
    return (
      <div className="action-panel">
        <h3>Fase: MOVER — ¿A dónde te mueves?</h3>
        <div className="move-options">
          {player.skipNextMove && (
            <button
              className="move-btn stay-btn"
              onClick={() => store.doSkipMove()}
            >
              Permanecer en {plugin.locations.find(l => l.id === player.pawnLocationId)?.name ?? player.pawnLocationId}
            </button>
          )}
          {validLocs.map(l => (
            <button
              key={l.id}
              className="move-btn"
              onClick={() => store.doMovePawn(l.id)}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── DRAW PHASE ──
  if (phase === TurnPhase.DRAW) {
    return (
      <div className="action-panel">
        <h3>Fase: ROBAR</h3>
        <button className="action-btn primary" onClick={() => store.doDrawCards()}>
          Robar cartas y terminar turno
        </button>
      </div>
    );
  }

  // ── ACTIVATE PHASE ──
  const locDef = plugin.locations.find(l => l.id === player.pawnLocationId);
  if (!locDef) return null;
  const availableSlots = getAvailableSlotIndices(state, playerId, player.pawnLocationId);

  // Extra action slots granted by items at the current location
  const ITEM_SLOT_OFFSET = 100;
  const pawnLocState = player.locationStates[player.pawnLocationId];
  const extraSlots = pawnLocState.villainCardInstIds
    .map(cId => state.allCards[cId])
    .filter(c => c?.grantsActionSlot)
    .map((c, i) => ({
      slotIndex: ITEM_SLOT_OFFSET + i,
      slot: c!.grantsActionSlot!,
      itemName: c!.name,
      itemInstId: c!.instId,
    }));

  const handleSlotClick = (slotIdx: number, actionOverride?: { type: ActionType; value?: number }) => {
    const slot = actionOverride ?? locDef.actions[slotIdx];
    setPendingSlot(slotIdx);
    setPendingAction(slot.type);
    setSelectedCardId(null);
    setSelectedAllyIds([]);
    setTargetLocId(null);
    setTargetCardId(null);
    setUseMapaId(null);

    if (slot.type === ActionType.GAIN_POWER) {
      store.doGainPower(slotIdx, actionOverride?.value);
      setPendingSlot(null);
      setPendingAction(null);
    }
    if (slot.type === ActionType.FATE) {
      const oppIdx = (state.currentPlayerIndex + 1) % state.players.length;
      store.doFateStart(oppIdx, slotIdx);
      setPendingSlot(null);
      setPendingAction(null);
    }
  };

  const execPlayCard = () => {
    if (pendingSlot === null || !selectedCardId || !targetLocId) return;
    const ctx: { mapaInstId?: CardInstId; targetCardInstId?: CardInstId; targetLocationId?: LocationId } = {};
    if (useMapaId) ctx.mapaInstId = useMapaId;
    if (targetCardId) ctx.targetCardInstId = targetCardId;
    if (effectTargetLocId) ctx.targetLocationId = effectTargetLocId;
    store.doPlayCard(selectedCardId, pendingSlot, targetLocId, ctx);
    setPendingSlot(null); setPendingAction(null); setSelectedCardId(null);
    setTargetLocId(null); setTargetCardId(null); setEffectTargetLocId(null); setUseMapaId(null);
  };

  const execVanquish = () => {
    if (pendingSlot === null || !selectedCardId || selectedAllyIds.length === 0) return;
    const result = canVanquish(state, playerId, selectedCardId, selectedAllyIds, pendingSlot);
    if (!result.valid) { alert(result.reason); return; }
    store.doVanquish(selectedCardId, selectedAllyIds, pendingSlot);
    setPendingSlot(null); setPendingAction(null); setSelectedCardId(null); setSelectedAllyIds([]);
  };

  const execMoveItemAlly = () => {
    if (pendingSlot === null || !selectedCardId || !targetLocId) return;
    const result = canMoveItemAlly(state, playerId, selectedCardId, targetLocId, pendingSlot);
    if (!result.valid) { alert(result.reason); return; }
    store.doMoveItemAlly(selectedCardId, targetLocId, pendingSlot);
    setPendingSlot(null); setPendingAction(null); setSelectedCardId(null); setTargetLocId(null);
  };

  const execMoveHero = () => {
    if (pendingSlot === null || !selectedCardId || !targetLocId) return;
    const result = canMoveHero(state, playerId, selectedCardId, targetLocId, pendingSlot);
    if (!result.valid) { alert(result.reason); return; }
    store.doMoveHero(selectedCardId, targetLocId, pendingSlot);
    setPendingSlot(null); setPendingAction(null); setSelectedCardId(null); setTargetLocId(null);
  };

  // All villain cards in kingdom (for selecting)
  const kingdomCards = Object.values(player.locationStates)
    .flatMap(ls => [...ls.villainCardInstIds, ...ls.heroCardInstIds])
    .map(id => state.allCards[id])
    .filter(Boolean);

  const heroesInKingdom = kingdomCards.filter(c => c.cardType === CardType.HERO);
  const alliesInKingdom = kingdomCards.filter(c => c.cardType === CardType.ALLY);
  const movableCards = kingdomCards.filter(
    c => (c.cardType === CardType.ALLY || c.cardType === CardType.ITEM || c.cardType === CardType.CURSE) && !c.attachedToInstId,
  );

  const allUnlockedLocs = plugin.locations.filter(
    l => !player.locationStates[l.id]?.isLocked,
  );

  return (
    <div className="action-panel">
      <div className="action-panel-header">
        <h3>Fase: ACCIONES — {locDef.name}</h3>
        <span className="power-badge">Poder: {player.power} 💰</span>
      </div>

      {/* Available action buttons */}
      <div className="slot-buttons">
        {locDef.actions.map((slot, idx) => {
          const available = availableSlots.includes(idx);
          const active = pendingSlot === idx;
          return (
            <button
              key={idx}
              className={`slot-btn ${active ? 'active' : ''} ${!available ? 'disabled' : ''}`}
              disabled={!available}
              onClick={() => handleSlotClick(idx)}
            >
              {actionLabel[slot.type] ?? slot.type.replace(/_/g, ' ')}
              {slot.value && slot.type === 'GAIN_POWER' ? ` (+${slot.value})` : ''}
              {slot.value && slot.type === 'FATE' ? ` (×${slot.value})` : ''}
            </button>
          );
        })}
        {extraSlots.map(({ slotIndex, slot, itemName }) => {
          const available = !state.usedActionSlotIndices.includes(slotIndex);
          const active = pendingSlot === slotIndex;
          return (
            <button
              key={slotIndex}
              className={`slot-btn item-slot-btn ${active ? 'active' : ''} ${!available ? 'disabled' : ''}`}
              disabled={!available}
              onClick={() => handleSlotClick(slotIndex, slot)}
              title={`Extra de: ${itemName}`}
            >
              {actionLabel[slot.type] ?? slot.type.replace(/_/g, ' ')}
              {slot.value && slot.type === 'GAIN_POWER' ? ` (+${slot.value})` : ''}
              <span className="item-slot-badge">{itemName}</span>
            </button>
          );
        })}
      </div>

      {/* Context-specific sub-UI */}
      {pendingAction === ActionType.PLAY_CARD && (
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
                  onClick={() => setSelectedCardId(id)}
                  disabled={player.power < cost}
                >
                  {c.name} ({cost}💰) [{c.cardType}]
                </button>
              );
            })}
          </div>
          {selectedCardId && (() => {
            const selCard = state.allCards[selectedCardId];
            const mapaCards = selCard?.cardType === CardType.ITEM
              ? Object.values(state.allCards).filter(
                  c => c.defId === 'hook_v_mapa' && c.ownerId === playerId && !!c.locationId,
                )
              : [];
            return (
              <>
                {mapaCards.length > 0 && (
                  <div className="mapa-option">
                    {mapaCards.map(m => (
                      <label key={m.instId} className="mapa-label">
                        <input
                          type="checkbox"
                          checked={useMapaId === m.instId}
                          onChange={e => setUseMapaId(e.target.checked ? m.instId : null)}
                        />
                        Usar <strong>Mapa de Nunca Jamás</strong> para jugar gratis
                      </label>
                    ))}
                  </div>
                )}
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
            );
          })()}
          {selectedCardId && targetLocId && (() => {
            const selCard = state.allCards[selectedCardId];
            const reqHeroAnywhere = selCard?.effectIds.some(id => getEffectDef(id)?.requiresTargetHeroAnywhere);
            const reqTarget = selCard?.effectIds.map(id => getEffectDef(id)?.requiresTargetCard).find(Boolean);
            const reqEffectLoc = selCard?.effectIds.some(id => getEffectDef(id)?.requiresTargetLocation);

            // Flujo especial: Sr. Starkey — héroe de cualquier ubicación + destino adyacente
            if (reqHeroAnywhere) {
              if (!targetCardId) {
                return (
                  <>
                    <p>Elige un Héroe del Reino para mover:</p>
                    <div className="card-select-list">
                      {heroesInKingdom.map(c => (
                        <button
                          key={c.instId}
                          className="card-select-btn"
                          onClick={() => { setTargetCardId(c.instId); setEffectTargetLocId(null); }}
                        >
                          {c.name} (Fuerza: {getEffectiveStrength(state, c.instId)}) @ {c.locationId}
                        </button>
                      ))}
                      {heroesInKingdom.length === 0 && <p className="cond-warning">No hay Héroes en el Reino.</p>}
                    </div>
                  </>
                );
              }
              if (reqEffectLoc) {
                const heroCard = state.allCards[targetCardId];
                const heroLocDef = plugin.locations.find(l => l.id === heroCard?.locationId);
                const adjLocs = (heroLocDef?.adjacentIds ?? [])
                  .map(id => plugin.locations.find(l => l.id === id))
                  .filter((l): l is NonNullable<typeof l> => !!l && !player.locationStates[l.id]?.isLocked);
                return (
                  <>
                    <p>Mover <strong>{heroCard?.name}</strong> a:</p>
                    <div className="loc-select-list">
                      {adjLocs.map(l => (
                        <button
                          key={l.id}
                          className={`loc-select-btn ${effectTargetLocId === l.id ? 'selected' : ''}`}
                          onClick={() => setEffectTargetLocId(l.id)}
                        >
                          {l.name}
                        </button>
                      ))}
                      {adjLocs.length === 0 && <p className="cond-warning">No hay ubicaciones adyacentes disponibles.</p>}
                    </div>
                    {effectTargetLocId && (
                      <button className="action-btn primary" onClick={execPlayCard}>Jugar carta</button>
                    )}
                  </>
                );
              }
              return <button className="action-btn primary" onClick={execPlayCard}>Jugar carta</button>;
            }

            // Flujo estándar: carta con requiresTargetCard (Sable, Espada, Polvo…)
            if (!reqTarget) return (
              <button className="action-btn primary" onClick={execPlayCard}>Jugar carta</button>
            );
            const targetsAtLoc = Object.values(state.allCards).filter(c =>
              c.locationId === targetLocId &&
              c.ownerId === playerId &&
              c.cardType === (reqTarget === 'ALLY' ? 'ALLY' : 'HERO'),
            );
            return (
              <>
                <p>Elige {reqTarget === 'ALLY' ? 'un Aliado' : 'un Héroe'} en {targetLocId}:</p>
                {targetsAtLoc.length === 0
                  ? <p className="cond-warning">No hay {reqTarget === 'ALLY' ? 'Aliados' : 'Héroes'} en esa ubicación. Se jugará sin adjuntar.</p>
                  : (
                    <div className="card-select-list">
                      {targetsAtLoc.map(c => (
                        <button
                          key={c.instId}
                          className={`card-select-btn ${targetCardId === c.instId ? 'selected' : ''}`}
                          onClick={() => setTargetCardId(c.instId)}
                        >
                          {c.name} (Fuerza: {getEffectiveStrength(state, c.instId)})
                        </button>
                      ))}
                    </div>
                  )
                }
                {(targetsAtLoc.length === 0 || targetCardId) && (
                  <button className="action-btn primary" onClick={execPlayCard}>Jugar carta</button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {pendingAction === ActionType.VANQUISH && (
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
              <p>Selecciona Aliados (deben estar en la misma ubicación):</p>
              <div className="card-select-list">
                {alliesInKingdom
                  .filter(c => {
                    const heroLoc = state.allCards[selectedCardId]?.locationId;
                    if (c.locationId === heroLoc) return true;
                    if (c.effectIds.some(id => getEffectDef(id)?.canVanquishFromAdjacent)) {
                      const heroLocDef = plugin.locations.find(l => l.id === heroLoc);
                      return heroLocDef?.adjacentIds.includes(c.locationId!) ?? false;
                    }
                    return false;
                  })
                  .map(c => {
                    const heroLoc = state.allCards[selectedCardId]?.locationId;
                    const isAdj = c.locationId !== heroLoc;
                    return (
                      <button
                        key={c.instId}
                        className={`card-select-btn ${selectedAllyIds.includes(c.instId) ? 'selected' : ''}`}
                        onClick={() =>
                          setSelectedAllyIds(prev =>
                            prev.includes(c.instId) ? prev.filter(id => id !== c.instId) : [...prev, c.instId],
                          )
                        }
                      >
                        {c.name} (Fuerza: {getEffectiveStrength(state, c.instId)})
                        {isAdj && <span className="adj-badge"> (adyacente)</span>}
                      </button>
                    );
                  })}
              </div>
              <p>
                Fuerza combinada: {selectedAllyIds.reduce((s, id) => s + getEffectiveStrength(state, id), 0)}
                {' '}/ Fuerza del héroe: {getEffectiveStrength(state, selectedCardId)}
              </p>
              {selectedAllyIds.length > 0 && (
                <button className="action-btn primary" onClick={execVanquish}>Vencer</button>
              )}
            </>
          )}
        </div>
      )}

      {pendingAction === ActionType.MOVE_ITEM_ALLY && (
        <div className="sub-action">
          <p>Selecciona Objeto, Aliado o Maldición a mover:</p>
          <div className="card-select-list">
            {movableCards.map(c => (
              <button
                key={c.instId}
                className={`card-select-btn ${selectedCardId === c.instId ? 'selected' : ''}`}
                onClick={() => setSelectedCardId(c.instId)}
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
                <button className="action-btn primary" onClick={execMoveItemAlly}>Mover</button>
              )}
            </>
          )}
        </div>
      )}

      {pendingAction === ActionType.MOVE_HERO && (
        <div className="sub-action">
          <p>Selecciona el Héroe a mover:</p>
          <div className="card-select-list">
            {heroesInKingdom.map(c => (
              <button
                key={c.instId}
                className={`card-select-btn ${selectedCardId === c.instId ? 'selected' : ''}`}
                onClick={() => setSelectedCardId(c.instId)}
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
                <button className="action-btn primary" onClick={execMoveHero}>Mover Héroe</button>
              )}
            </>
          )}
        </div>
      )}

      {pendingAction === ActionType.ACTIVATE_CARD && (
        <div className="sub-action">
          <p>Selecciona la carta a Activar:</p>
          <div className="card-select-list">
            {kingdomCards
              .filter(c => c.activationCost !== undefined)
              .map(c => (
                <button
                  key={c.instId}
                  className={`card-select-btn ${selectedCardId === c.instId ? 'selected' : ''} ${player.power < (c.activationCost ?? 0) ? 'too-expensive' : ''}`}
                  disabled={player.power < (c.activationCost ?? 0)}
                  onClick={() => setSelectedCardId(c.instId)}
                >
                  {c.name} (Coste: {c.activationCost ?? 0}💰)
                </button>
              ))}
          </div>
          {selectedCardId && (() => {
            const selCard = state.allCards[selectedCardId];
            const needsLoc = selCard?.effectIds.some(id => getEffectDef(id)?.requiresTargetLocation);
            if (!needsLoc) {
              return (
                <button
                  className="action-btn primary"
                  onClick={() => {
                    if (pendingSlot === null) return;
                    store.doActivateCard(selectedCardId, pendingSlot);
                    setPendingSlot(null); setPendingAction(null); setSelectedCardId(null);
                  }}
                >
                  Activar
                </button>
              );
            }
            const cardLoc = selCard?.locationId;
            const cardLocDef = plugin.locations.find(l => l.id === cardLoc);
            return (
              <>
                <p>Elige ubicación adyacente para mover la carta:</p>
                <div className="loc-select-list">
                  {(cardLocDef?.adjacentIds ?? []).map(adjId => {
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
                  })}
                </div>
                {targetLocId && (
                  <button
                    className="action-btn primary"
                    onClick={() => {
                      if (pendingSlot === null) return;
                      store.doActivateCard(selectedCardId, pendingSlot, { targetLocationId: targetLocId });
                      setPendingSlot(null); setPendingAction(null); setSelectedCardId(null); setTargetLocId(null);
                    }}
                  >
                    Activar
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {pendingAction === ActionType.DISCARD && (
        <div className="sub-action">
          <p>Selecciona cartas a descartar de la mano:</p>
          <div className="card-select-list">
            {player.handInstIds.map(id => {
              const c = state.allCards[id];
              if (!c) return null;
              return (
                <button
                  key={id}
                  className={`card-select-btn ${selectedAllyIds.includes(id) ? 'selected' : ''}`}
                  onClick={() =>
                    setSelectedAllyIds(prev =>
                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
                    )
                  }
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          {selectedAllyIds.length > 0 && pendingSlot !== null && (
            <button
              className="action-btn primary"
              onClick={() => {
                store.doDiscardFromHand(selectedAllyIds, pendingSlot!);
                setPendingSlot(null); setPendingAction(null); setSelectedAllyIds([]);
              }}
            >
              Descartar {selectedAllyIds.length} carta(s)
            </button>
          )}
        </div>
      )}

      <div className="panel-footer">
        {availableSlots.length === 0 && (
          <button className="action-btn secondary" onClick={() => store.doEndActivate()}>
            Terminar acciones → Robar
          </button>
        )}
        {availableSlots.length > 0 && (
          <button className="action-btn secondary" onClick={() => store.doEndActivate()}>
            Terminar acciones antes de tiempo
          </button>
        )}
      </div>
    </div>
  );
}

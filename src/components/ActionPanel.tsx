import { ActionType, CardType, TurnPhase } from '../core/types';
import type { GameState, PlayerId } from '../core/types';
import { getEffectDef } from '../core/villains/registry';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { canMovePawn } from '../core/engine/RuleEngine';
import { ACTION_LABELS } from './shared/actionLabels';
import { useActionPanelState, type ActionPanelCtx } from './useActionPanelState';

// ─── SLOT BUTTONS ──────────────────────────────────────────────────────────────

function SlotButtons({ ap, state }: { ap: ActionPanelCtx; state: GameState }) {
  if (!ap.locDef) return null;
  return (
    <div className="slot-buttons">
      {ap.locDef.actions.map((slot, idx) => {
        const available = ap.availableSlots.includes(idx);
        const active = ap.pendingSlot === idx;
        return (
          <button
            key={idx}
            className={`slot-btn ${active ? 'active' : ''} ${!available ? 'disabled' : ''}`}
            disabled={!available}
            onClick={() => ap.handleSlotClick(idx)}
          >
            {ACTION_LABELS[slot.type] ?? slot.type.replace(/_/g, ' ')}
            {slot.value && slot.type === 'GAIN_POWER' ? ` (+${slot.value})` : ''}
            {slot.value && slot.type === 'FATE' ? ` (×${slot.value})` : ''}
          </button>
        );
      })}
      {ap.extraSlots.map(({ slotIndex, slot, itemName }) => {
        const available = !state.usedActionSlotIndices.includes(slotIndex);
        const active = ap.pendingSlot === slotIndex;
        return (
          <button
            key={slotIndex}
            className={`slot-btn item-slot-btn ${active ? 'active' : ''} ${!available ? 'disabled' : ''}`}
            disabled={!available}
            onClick={() => ap.handleSlotClick(slotIndex, slot)}
            title={`Extra de: ${itemName}`}
          >
            {ACTION_LABELS[slot.type] ?? slot.type.replace(/_/g, ' ')}
            {slot.value && slot.type === 'GAIN_POWER' ? ` (+${slot.value})` : ''}
            <span className="item-slot-badge">{itemName}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── PLAY CARD FLOW ────────────────────────────────────────────────────────────

function PlayCardFlow({ ap, state, playerId }: { ap: ActionPanelCtx; state: GameState; playerId: PlayerId }) {
  const selCard = ap.selectedCardId ? state.allCards[ap.selectedCardId] : null;
  const mapaCards = selCard?.cardType === CardType.ITEM
    ? Object.values(state.allCards).filter(c => c.defId === 'hook_v_mapa' && c.ownerId === playerId && !!c.locationId)
    : [];

  return (
    <div className="sub-action">
      <p>Selecciona una carta de tu mano:</p>
      <div className="card-select-list">
        {ap.player.handInstIds.map(id => {
          const c = state.allCards[id];
          if (!c) return null;
          const cost = Math.max(0, c.baseCost + c.costModifier);
          return (
            <button key={id}
              className={`card-select-btn ${ap.selectedCardId === id ? 'selected' : ''} ${ap.player.power < cost ? 'too-expensive' : ''}`}
              disabled={ap.player.power < cost}
              onClick={() => ap.setSelectedCardId(id)}
            >
              {c.name} ({cost}💰) [{c.cardType}]
            </button>
          );
        })}
      </div>

      {ap.selectedCardId && (
        <>
          {mapaCards.length > 0 && (
            <div className="mapa-option">
              {mapaCards.map(m => (
                <label key={m.instId} className="mapa-label">
                  <input type="checkbox" checked={ap.useMapaId === m.instId}
                    onChange={e => ap.setUseMapaId(e.target.checked ? m.instId : null)} />
                  Usar <strong>Mapa de Nunca Jamás</strong> para jugar gratis
                </label>
              ))}
            </div>
          )}
          <p>Elige ubicación de destino:</p>
          <div className="loc-select-list">
            {ap.allUnlockedLocs.map(l => (
              <button key={l.id}
                className={`loc-select-btn ${ap.targetLocId === l.id ? 'selected' : ''}`}
                onClick={() => ap.setTargetLocId(l.id)}
              >{l.name}</button>
            ))}
          </div>
        </>
      )}

      {ap.selectedCardId && ap.targetLocId && (() => {
        const reqHeroAnywhere = selCard?.effectIds.some(id => getEffectDef(id)?.requiresTargetHeroAnywhere);
        const reqTarget = selCard?.effectIds.map(id => getEffectDef(id)?.requiresTargetCard).find(Boolean);
        const reqEffectLoc = selCard?.effectIds.some(id => getEffectDef(id)?.requiresTargetLocation);

        if (reqHeroAnywhere) {
          if (!ap.targetCardId) return (
            <>
              <p>Elige un Héroe del Reino para mover:</p>
              <div className="card-select-list">
                {ap.heroesInKingdom.map(c => (
                  <button key={c.instId} className="card-select-btn"
                    onClick={() => { ap.setTargetCardId(c.instId); ap.setEffectTargetLocId(null); }}>
                    {c.name} (Fuerza: {getEffectiveStrength(state, c.instId)}) @ {c.locationId}
                  </button>
                ))}
                {ap.heroesInKingdom.length === 0 && <p className="cond-warning">No hay Héroes en el Reino.</p>}
              </div>
            </>
          );
          if (reqEffectLoc) {
            const heroCard = state.allCards[ap.targetCardId!];
            const adjLocs = (ap.plugin.locations.find(l => l.id === heroCard?.locationId)?.adjacentIds ?? [])
              .map(id => ap.plugin.locations.find(l => l.id === id))
              .filter((l): l is NonNullable<typeof l> => !!l && !ap.player.locationStates[l.id]?.isLocked);
            return (
              <>
                <p>Mover <strong>{heroCard?.name}</strong> a:</p>
                <div className="loc-select-list">
                  {adjLocs.map(l => (
                    <button key={l.id}
                      className={`loc-select-btn ${ap.effectTargetLocId === l.id ? 'selected' : ''}`}
                      onClick={() => ap.setEffectTargetLocId(l.id)}
                    >{l.name}</button>
                  ))}
                  {adjLocs.length === 0 && <p className="cond-warning">No hay ubicaciones adyacentes disponibles.</p>}
                </div>
                {ap.effectTargetLocId && <button className="action-btn primary" onClick={ap.execPlayCard}>Jugar carta</button>}
              </>
            );
          }
          return <button className="action-btn primary" onClick={ap.execPlayCard}>Jugar carta</button>;
        }

        if (!reqTarget) return <button className="action-btn primary" onClick={ap.execPlayCard}>Jugar carta</button>;

        const targetsAtLoc = Object.values(state.allCards).filter(c =>
          c.locationId === ap.targetLocId && c.ownerId === playerId &&
          c.cardType === (reqTarget === 'ALLY' ? 'ALLY' : 'HERO'),
        );
        return (
          <>
            <p>Elige {reqTarget === 'ALLY' ? 'un Aliado' : 'un Héroe'} en {ap.targetLocId}:</p>
            {targetsAtLoc.length === 0
              ? <p className="cond-warning">No hay {reqTarget === 'ALLY' ? 'Aliados' : 'Héroes'} aquí. Se jugará sin adjuntar.</p>
              : (
                <div className="card-select-list">
                  {targetsAtLoc.map(c => (
                    <button key={c.instId}
                      className={`card-select-btn ${ap.targetCardId === c.instId ? 'selected' : ''}`}
                      onClick={() => ap.setTargetCardId(c.instId)}
                    >{c.name} (Fuerza: {getEffectiveStrength(state, c.instId)})</button>
                  ))}
                </div>
              )}
            {(targetsAtLoc.length === 0 || ap.targetCardId) && (
              <button className="action-btn primary" onClick={ap.execPlayCard}>Jugar carta</button>
            )}
          </>
        );
      })()}
    </div>
  );
}

// ─── VANQUISH FLOW ─────────────────────────────────────────────────────────────

function VanquishFlow({ ap, state }: { ap: ActionPanelCtx; state: GameState; playerId?: PlayerId }) {
  return (
    <div className="sub-action">
      <p>Selecciona el Héroe a derrotar:</p>
      <div className="card-select-list">
        {ap.heroesInKingdom.map(c => (
          <button key={c.instId}
            className={`card-select-btn ${ap.selectedCardId === c.instId ? 'selected' : ''}`}
            onClick={() => { ap.setSelectedCardId(c.instId); ap.setSelectedAllyIds([]); }}>
            {c.name} (Fuerza: {getEffectiveStrength(state, c.instId)}) @ {c.locationId}
          </button>
        ))}
      </div>
      {ap.selectedCardId && (
        <>
          <p>Selecciona Aliados (deben estar en la misma ubicación):</p>
          <div className="card-select-list">
            {ap.alliesInKingdom
              .filter(c => {
                const heroLoc = state.allCards[ap.selectedCardId!]?.locationId;
                if (c.locationId === heroLoc) return true;
                if (c.effectIds.some(id => getEffectDef(id)?.canVanquishFromAdjacent)) {
                  return ap.plugin.locations.find(l => l.id === heroLoc)?.adjacentIds.includes(c.locationId!) ?? false;
                }
                return false;
              })
              .map(c => {
                const isAdj = c.locationId !== state.allCards[ap.selectedCardId!]?.locationId;
                return (
                  <button key={c.instId}
                    className={`card-select-btn ${ap.selectedAllyIds.includes(c.instId) ? 'selected' : ''}`}
                    onClick={() => ap.setSelectedAllyIds(prev =>
                      prev.includes(c.instId) ? prev.filter(id => id !== c.instId) : [...prev, c.instId]
                    )}>
                    {c.name} (Fuerza: {getEffectiveStrength(state, c.instId)})
                    {isAdj && <span className="adj-badge"> (adyacente)</span>}
                  </button>
                );
              })}
          </div>
          <p>
            Fuerza combinada: {ap.selectedAllyIds.reduce((s, id) => s + getEffectiveStrength(state, id), 0)}
            {' '}/ Fuerza del héroe: {getEffectiveStrength(state, ap.selectedCardId)}
          </p>
          {ap.selectedAllyIds.length > 0 && (
            <button className="action-btn primary" onClick={ap.execVanquish}>Vencer</button>
          )}
        </>
      )}
    </div>
  );
}

// ─── MOVE ITEM/ALLY FLOW ───────────────────────────────────────────────────────

function MoveItemAllyFlow({ ap, state }: { ap: ActionPanelCtx; state: GameState }) {
  const adjLocs = (() => {
    const cardLoc = ap.selectedCardId ? state.allCards[ap.selectedCardId]?.locationId : undefined;
    return (ap.plugin.locations.find(l => l.id === cardLoc)?.adjacentIds ?? [])
      .filter(id => !ap.player.locationStates[id]?.isLocked)
      .map(adjId => ap.plugin.locations.find(l => l.id === adjId))
      .filter((l): l is NonNullable<typeof l> => !!l);
  })();

  return (
    <div className="sub-action">
      <p>Selecciona Objeto, Aliado o Maldición a mover:</p>
      <div className="card-select-list">
        {ap.movableCards.map(c => (
          <button key={c.instId}
            className={`card-select-btn ${ap.selectedCardId === c.instId ? 'selected' : ''}`}
            onClick={() => ap.setSelectedCardId(c.instId)}>
            {c.name} [{c.cardType}] @ {c.locationId}
          </button>
        ))}
      </div>
      {ap.selectedCardId && (
        <>
          <p>Elige ubicación adyacente:</p>
          <div className="loc-select-list">
            {adjLocs.map(l => (
              <button key={l.id}
                className={`loc-select-btn ${ap.targetLocId === l.id ? 'selected' : ''}`}
                onClick={() => ap.setTargetLocId(l.id)}>{l.name}</button>
            ))}
          </div>
          {ap.targetLocId && <button className="action-btn primary" onClick={ap.execMoveItemAlly}>Mover</button>}
        </>
      )}
    </div>
  );
}

// ─── MOVE HERO FLOW ────────────────────────────────────────────────────────────

function MoveHeroFlow({ ap, state }: { ap: ActionPanelCtx; state: GameState }) {
  const adjLocs = (() => {
    const heroLoc = ap.selectedCardId ? state.allCards[ap.selectedCardId]?.locationId : undefined;
    return (ap.plugin.locations.find(l => l.id === heroLoc)?.adjacentIds ?? [])
      .filter(id => !ap.player.locationStates[id]?.isLocked)
      .map(adjId => ap.plugin.locations.find(l => l.id === adjId))
      .filter((l): l is NonNullable<typeof l> => !!l);
  })();

  return (
    <div className="sub-action">
      <p>Selecciona el Héroe a mover:</p>
      <div className="card-select-list">
        {ap.heroesInKingdom.map(c => (
          <button key={c.instId}
            className={`card-select-btn ${ap.selectedCardId === c.instId ? 'selected' : ''}`}
            onClick={() => ap.setSelectedCardId(c.instId)}>
            {c.name} @ {c.locationId}
          </button>
        ))}
      </div>
      {ap.selectedCardId && (
        <>
          <p>Elige ubicación adyacente:</p>
          <div className="loc-select-list">
            {adjLocs.map(l => (
              <button key={l.id}
                className={`loc-select-btn ${ap.targetLocId === l.id ? 'selected' : ''}`}
                onClick={() => ap.setTargetLocId(l.id)}>{l.name}</button>
            ))}
          </div>
          {ap.targetLocId && <button className="action-btn primary" onClick={ap.execMoveHero}>Mover Héroe</button>}
        </>
      )}
    </div>
  );
}

// ─── ACTIVATE CARD FLOW ────────────────────────────────────────────────────────

function ActivateCardFlow({ ap, state }: { ap: ActionPanelCtx; state: GameState }) {
  const selCard = ap.selectedCardId ? state.allCards[ap.selectedCardId] : null;
  const needsLoc = selCard?.effectIds.some(id => getEffectDef(id)?.requiresTargetLocation);

  return (
    <div className="sub-action">
      <p>Selecciona la carta a Activar:</p>
      <div className="card-select-list">
        {ap.kingdomCards
          .filter(c => c.activationCost !== undefined)
          .map(c => (
            <button key={c.instId}
              className={`card-select-btn ${ap.selectedCardId === c.instId ? 'selected' : ''} ${ap.player.power < (c.activationCost ?? 0) ? 'too-expensive' : ''}`}
              disabled={ap.player.power < (c.activationCost ?? 0)}
              onClick={() => ap.setSelectedCardId(c.instId)}>
              {c.name} (Coste: {c.activationCost ?? 0}💰)
            </button>
          ))}
      </div>
      {ap.selectedCardId && !needsLoc && (
        <button className="action-btn primary" onClick={() => {
          if (ap.pendingSlot === null) return;
          ap.store.doActivateCard(ap.selectedCardId!, ap.pendingSlot);
          ap.clearPending(); ap.resetSelection();
        }}>Activar</button>
      )}
      {ap.selectedCardId && needsLoc && (() => {
        const adjLocs = (ap.plugin.locations.find(l => l.id === selCard?.locationId)?.adjacentIds ?? [])
          .map(adjId => ap.plugin.locations.find(l => l.id === adjId))
          .filter((l): l is NonNullable<typeof l> => !!l);
        return (
          <>
            <p>Elige ubicación adyacente para mover la carta:</p>
            <div className="loc-select-list">
              {adjLocs.map(l => (
                <button key={l.id}
                  className={`loc-select-btn ${ap.targetLocId === l.id ? 'selected' : ''}`}
                  onClick={() => ap.setTargetLocId(l.id)}>{l.name}</button>
              ))}
            </div>
            {ap.targetLocId && (
              <button className="action-btn primary" onClick={() => {
                if (ap.pendingSlot === null) return;
                ap.store.doActivateCard(ap.selectedCardId!, ap.pendingSlot, { targetLocationId: ap.targetLocId! });
                ap.clearPending(); ap.resetSelection(); ap.setTargetLocId(null);
              }}>Activar</button>
            )}
          </>
        );
      })()}
    </div>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

interface Props {
  state: GameState;
  playerId: PlayerId;
}

export function ActionPanel({ state, playerId }: Props) {
  const ap = useActionPanelState(state, playerId);

  if (state.winner) return null;
  if (state.players[state.currentPlayerIndex].id !== playerId) return null;

  if (state.turnPhase === TurnPhase.MOVE) {
    const validLocs = ap.plugin.locations.filter(l => canMovePawn(state, playerId, l.id).valid);
    return (
      <div className="action-panel">
        <h3>Fase: MOVER — ¿A dónde te mueves?</h3>
        <div className="move-options">
          {ap.player.skipNextMove && (
            <button className="move-btn stay-btn" onClick={() => ap.store.doSkipMove()}>
              Permanecer en {ap.plugin.locations.find(l => l.id === ap.player.pawnLocationId)?.name ?? ap.player.pawnLocationId}
            </button>
          )}
          {validLocs.map(l => (
            <button key={l.id} className="move-btn" onClick={() => ap.store.doMovePawn(l.id)}>{l.name}</button>
          ))}
        </div>
      </div>
    );
  }

  if (state.turnPhase === TurnPhase.DRAW) {
    return (
      <div className="action-panel">
        <h3>Fase: ROBAR</h3>
        <button className="action-btn primary" onClick={() => ap.store.doDrawCards()}>
          Robar cartas y terminar turno
        </button>
      </div>
    );
  }

  if (!ap.locDef) return null;

  return (
    <div className="action-panel">
      <div className="action-panel-header">
        <h3>Fase: ACCIONES — {ap.locDef.name}</h3>
        <span className="power-badge">Poder: {ap.player.power} 💰</span>
      </div>

      <SlotButtons ap={ap} state={state} />

      {ap.pendingAction === ActionType.PLAY_CARD      && <PlayCardFlow      ap={ap} state={state} playerId={playerId} />}
      {ap.pendingAction === ActionType.VANQUISH        && <VanquishFlow      ap={ap} state={state} playerId={playerId} />}
      {ap.pendingAction === ActionType.MOVE_ITEM_ALLY  && <MoveItemAllyFlow  ap={ap} state={state} />}
      {ap.pendingAction === ActionType.MOVE_HERO       && <MoveHeroFlow      ap={ap} state={state} />}
      {ap.pendingAction === ActionType.ACTIVATE_CARD   && <ActivateCardFlow  ap={ap} state={state} />}
      {ap.pendingAction === ActionType.DISCARD && (
        <div className="sub-action">
          <p>Selecciona cartas a descartar de la mano:</p>
          <div className="card-select-list">
            {ap.player.handInstIds.map(id => {
              const c = state.allCards[id];
              if (!c) return null;
              return (
                <button key={id}
                  className={`card-select-btn ${ap.selectedAllyIds.includes(id) ? 'selected' : ''}`}
                  onClick={() => ap.setSelectedAllyIds(prev =>
                    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                  )}>
                  {c.name}
                </button>
              );
            })}
          </div>
          {ap.selectedAllyIds.length > 0 && ap.pendingSlot !== null && (
            <button className="action-btn primary" onClick={() => {
              ap.store.doDiscardFromHand(ap.selectedAllyIds, ap.pendingSlot!);
              ap.clearPending(); ap.setSelectedAllyIds([]);
            }}>
              Descartar {ap.selectedAllyIds.length} carta(s)
            </button>
          )}
        </div>
      )}

      <div className="panel-footer">
        <button className="action-btn secondary" onClick={() => ap.store.doEndActivate()}>
          {ap.availableSlots.length === 0 ? 'Terminar acciones → Robar' : 'Terminar acciones antes de tiempo'}
        </button>
      </div>
    </div>
  );
}

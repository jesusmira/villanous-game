import { useState } from 'react';
import { CardType } from '../core/types';
import type { GameState, LocationId, CardInstId } from '../core/types';
import { getPlugin, getEffectDef } from '../core/villains/registry';
import { getEffectiveStrength } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';

interface Props { state: GameState }

export function FateModal({ state }: Props) {
  const store = useGameStore();
  const { pendingFate } = state;
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [targetLocId, setTargetLocId] = useState<LocationId | null>(null);
  const [targetCardId, setTargetCardId] = useState<CardInstId | null>(null);

  if (!pendingFate) return null;

  const targetPlayer = state.players[pendingFate.targetPlayerIndex];
  const targetPlugin = getPlugin(targetPlayer.villainId);
  const revealedCards = pendingFate.revealedInstIds.map(id => state.allCards[id]).filter(Boolean);
  const autoPlayedCards = (pendingFate.autoPlayedInstIds ?? []).map(id => state.allCards[id]).filter(Boolean);
  const chosenCard = chosenId ? state.allCards[chosenId] : null;

  const validLocs = targetPlugin.locations.filter(
    l => !targetPlayer.locationStates[l.id]?.isLocked,
  );

  // Determine if chosen card requires a target card (e.g. Polvo de Hada → HERO, Burla → HERO)
  const reqTarget = chosenCard?.effectIds
    .map(id => getEffectDef(id)?.requiresTargetCard)
    .find(Boolean) ?? null;

  const targetsAtLoc = (reqTarget && targetLocId)
    ? Object.values(state.allCards).filter(c =>
        c.locationId === targetLocId &&
        c.ownerId === targetPlayer.id &&
        c.cardType === (reqTarget === 'ALLY' ? CardType.ALLY : CardType.HERO),
      )
    : [];

  const canConfirm = chosenId && (
    chosenCard?.cardType === CardType.EFFECT ||
    (targetLocId && (!reqTarget || targetsAtLoc.length === 0 || !!targetCardId))
  );

  function confirm() {
    if (!chosenId) return;
    const loc = targetLocId ?? validLocs[0]?.id;
    if (!loc) return;
    store.doFateResolve(chosenId, loc, targetCardId ? { targetCardInstId: targetCardId } : {});
    setChosenId(null);
    setTargetLocId(null);
    setTargetCardId(null);
  }

  return (
    <div className="modal-overlay">
      <div className="modal fate-modal">
        <h2>Acción Destino</h2>
        <p>Jugando contra <strong>{targetPlayer.name}</strong>. Elige una carta para jugar:</p>

        <div className="fate-cards">
          {autoPlayedCards.map(card => (
            <div key={card.instId} className="fate-card-option fate-card-auto">
              <div className="fate-card-name">{card.name}</div>
              <div className="fate-card-type">{card.cardType}</div>
              {card.baseStrength !== undefined && (
                <div className="fate-card-strength">Fuerza: {card.baseStrength}</div>
              )}
              <div className="fate-card-auto-label">Jugado automáticamente</div>
            </div>
          ))}
          {revealedCards.map(card => (
            <div
              key={card.instId}
              className={`fate-card-option ${chosenId === card.instId ? 'selected' : ''}`}
              onClick={() => { setChosenId(card.instId); setTargetLocId(null); }}
            >
              <div className="fate-card-name">{card.name}</div>
              <div className="fate-card-type">{card.cardType}</div>
              {card.baseStrength !== undefined && (
                <div className="fate-card-strength">Fuerza: {card.baseStrength}</div>
              )}
            </div>
          ))}
        </div>

        {chosenId && chosenCard?.cardType !== CardType.EFFECT && (
          <>
            <p>Elige ubicación en el Reino de {targetPlayer.name}:</p>
            <div className="loc-select-list">
              {validLocs.map(l => (
                <button
                  key={l.id}
                  className={`loc-select-btn ${targetLocId === l.id ? 'selected' : ''}`}
                  onClick={() => { setTargetLocId(l.id); setTargetCardId(null); }}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </>
        )}

        {targetLocId && reqTarget && (
          <>
            <p>Adjuntar a {reqTarget === 'ALLY' ? 'un Aliado' : 'un Héroe'} en esa ubicación:</p>
            {targetsAtLoc.length === 0
              ? <p className="cond-warning">No hay {reqTarget === 'ALLY' ? 'Aliados' : 'Héroes'} aquí. Se jugará sin adjuntar.</p>
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
          </>
        )}

        <div className="modal-footer">
          <button
            className="action-btn primary"
            disabled={!canConfirm}
            onClick={confirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { TurnPhase } from '../core/types';
import type { CardInst, GameState } from '../core/types';
import { CardDefId } from '../core/villains/effectIds';
import { PlayerBoard } from './PlayerBoard';
import { ActionPanel } from './ActionPanel';
import { FateModal } from './FateModal';
import { CuervoModal } from './CuervoModal';
import { DemoslesModal } from './DemoslesModal';
import { ConditionModal } from './ConditionModal';
import { CardDetailModal } from './CardDetailModal';
import { useGameStore } from '../state/gameStore';

const LOG_ENTRIES_VISIBLE = 30;

interface Props { state: GameState }

export function GameBoard({ state }: Props) {
  const resetGame = useGameStore(s => s.resetGame);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<CardInst | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state.log.length]);

  const currentPlayer = state.players[state.currentPlayerIndex];

  const phaseLabels: Record<TurnPhase, string> = {
    [TurnPhase.MOVE]: 'MOVER',
    [TurnPhase.ACTIVATE]: 'ACCIONES',
    [TurnPhase.DRAW]: 'ROBAR',
  };

  return (
    <div className="game-board">
      {/* Header bar */}
      <div className="game-header">
        <div className="game-title">Disney Villainous</div>
        <div className="turn-info">
          <span className="turn-player">{currentPlayer.name}</span>
          <span className="turn-phase phase-badge">{phaseLabels[state.turnPhase]}</span>
          <span className="turn-round">Ronda {state.roundNumber}</span>
        </div>
        <button className="reset-btn" onClick={resetGame}>Nueva partida</button>
      </div>

      {/* Winner banner */}
      {state.winner && (
        <div className="winner-banner">
          🏆 ¡{state.players.find(p => p.id === state.winner)?.name} ha ganado la partida!
          <button className="action-btn primary" onClick={resetGame}>Jugar de nuevo</button>
        </div>
      )}

      {/* Player boards */}
      <div className="boards-container">
        {state.players.map((player, idx) => (
          <PlayerBoard
            key={player.id}
            state={state}
            player={player}
            isActive={!state.winner && state.currentPlayerIndex === idx && !currentPlayer.isAI}
            onCardClick={setSelectedCardId}
            onDetailClick={setDetailCard}
            selectedCardId={selectedCardId}
          />
        ))}
      </div>

      {/* Action panel for human player */}
      {!state.winner && !currentPlayer.isAI && (
        <ActionPanel state={state} playerId={currentPlayer.id} />
      )}

      {/* AI thinking indicator */}
      {!state.winner && currentPlayer.isAI && (
        <div className="ai-thinking">
          La IA ({currentPlayer.name}) está jugando...
        </div>
      )}

      {/* Hand display */}
      {!state.winner && !currentPlayer.isAI && (
        <div className="hand-area">
          <h3>
            Tu mano ({currentPlayer.handInstIds.length} cartas)
            {Object.values(currentPlayer.locationStates).some(ls =>
              ls.heroCardInstIds.some(id => state.allCards[id]?.defId === CardDefId.MAL_FLORA),
            ) && <span className="hand-revealed-badge">MANO AL DESCUBIERTO</span>}
          </h3>
          <div className="hand-cards">
            {currentPlayer.handInstIds.map(id => {
              const card = state.allCards[id];
              if (!card) return null;
              const cost = Math.max(0, card.baseCost + card.costModifier);
              return (
                <div
                  key={id}
                  className={`hand-card ${selectedCardId === id ? 'selected' : ''}`}
                  onClick={() => setSelectedCardId(prev => prev === id ? null : id)}
                  title={card.name}
                >
                  <div className="hand-card-cost">{cost}💰</div>
                  <div className="hand-card-name">{card.name}</div>
                  <div className="hand-card-type">{card.cardType}</div>
                  {card.baseStrength !== undefined && (
                    <div className="hand-card-str">⚔ {card.baseStrength}</div>
                  )}
                  <button
                    className="card-info-btn"
                    onClick={e => { e.stopPropagation(); setDetailCard(card); }}
                    title="Ver detalles"
                  >?</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Card detail modal */}
      {detailCard && (
        <CardDetailModal card={detailCard} state={state} onClose={() => setDetailCard(null)} />
      )}

      {/* Condition modal */}
      {state.pendingCondition && <ConditionModal state={state} />}

      {/* Fate modal */}
      {state.pendingFate && <FateModal state={state} />}

      {/* Cuervo modal */}
      {state.pendingCuervo && <CuervoModal state={state} />}

      {/* Démosles un Susto modal */}
      {state.pendingDemosles && <DemoslesModal state={state} />}

      {/* Game log */}
      <div className="log-panel" ref={logRef}>
        {state.log.slice(-LOG_ENTRIES_VISIBLE).map((entry, i) => (
          <div key={i} className="log-entry">{entry}</div>
        ))}
      </div>
    </div>
  );
}

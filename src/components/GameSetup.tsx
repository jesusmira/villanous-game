import { useState } from 'react';
import type { VillainId, GameSetupOptions } from '../core/types';
import { useGameStore } from '../state/gameStore';

const VILLAINS: { id: VillainId; name: string; color: string; desc: string }[] = [
  { id: 'maleficent', name: 'Maléfica', color: '#4a0080', desc: 'Cubre cada ubicación de tu Reino con al menos una Maldición.' },
  { id: 'hook', name: 'Capitán Garfio', color: '#8b1a1a', desc: 'Encuentra a Peter Pan, desbloquea el Árbol del Ahorcado y derrótalo en el Jolly Roger.' },
];

export function GameSetup() {
  const initGame = useGameStore(s => s.initGame);
  const [p1Villain, setP1Villain] = useState<VillainId>('maleficent');
  const [p2Villain, setP2Villain] = useState<VillainId>('hook');
  const [p2IsAI, setP2IsAI] = useState(true);
  const [p1Name, setP1Name] = useState('Jugador 1');
  const [p2Name, setP2Name] = useState('IA');

  function start() {
    if (p1Villain === p2Villain) {
      alert('Cada jugador debe elegir un Villano diferente.');
      return;
    }
    const opts: GameSetupOptions = {
      player1: { villainId: p1Villain, isAI: false, name: p1Name },
      player2: { villainId: p2Villain, isAI: p2IsAI, name: p2Name },
    };
    initGame(opts);
  }

  return (
    <div className="setup-screen">
      <h1 className="setup-title">Disney Villainous</h1>
      <p className="setup-subtitle">Elige a tus Villanos</p>

      <div className="setup-players">
        <div className="setup-player">
          <h2>Jugador 1</h2>
          <input
            className="setup-name-input"
            value={p1Name}
            onChange={e => setP1Name(e.target.value)}
            placeholder="Nombre"
          />
          <div className="villain-picker">
            {VILLAINS.map(v => (
              <button
                key={v.id}
                className={`villain-btn ${p1Villain === v.id ? 'selected' : ''}`}
                style={{ '--villain-color': v.color } as React.CSSProperties}
                onClick={() => setP1Villain(v.id)}
              >
                <span className="villain-btn-name">{v.name}</span>
                <span className="villain-btn-desc">{v.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setup-vs">VS</div>

        <div className="setup-player">
          <h2>Jugador 2</h2>
          <div className="setup-mode">
            <label>
              <input
                type="checkbox"
                checked={p2IsAI}
                onChange={e => {
                  setP2IsAI(e.target.checked);
                  setP2Name(e.target.checked ? 'IA' : 'Jugador 2');
                }}
              />
              {' '}Controlar con IA
            </label>
          </div>
          {!p2IsAI && (
            <input
              className="setup-name-input"
              value={p2Name}
              onChange={e => setP2Name(e.target.value)}
              placeholder="Nombre"
            />
          )}
          <div className="villain-picker">
            {VILLAINS.map(v => (
              <button
                key={v.id}
                className={`villain-btn ${p2Villain === v.id ? 'selected' : ''}`}
                style={{ '--villain-color': v.color } as React.CSSProperties}
                onClick={() => setP2Villain(v.id)}
              >
                <span className="villain-btn-name">{v.name}</span>
                <span className="villain-btn-desc">{v.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <button className="start-btn" onClick={start}>Comenzar Partida</button>
    </div>
  );
}

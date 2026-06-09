import { useState } from 'react';
import type { VillainId, GameSetupOptions } from '../core/types';
import { getAllPlugins } from '../core/villains/registry';
import { useGameStore } from '../state/gameStore';
import { Image } from './Image';
import { ArrowLeft } from 'lucide-react';

// Villanos reales del juego
const REAL_VILLAINS = getAllPlugins().map(p => ({
  id: p.id as VillainId,
  name: p.name,
  color: p.color,
  desc: p.description,
}));

const VILLAIN_OPTIONS = REAL_VILLAINS;

type GameMode = '1v1' | 'vsia' | null;
type ActivePlayer = 'player1' | 'player2';

interface VillainCircleProps {
  villainId: VillainId;
  description: string;
  onSelect: () => void;
  activePlayer: ActivePlayer;
  isSelectedByP1: boolean;
  isSelectedByP2: boolean;
}

function VillainCircle({ villainId, description, onSelect, activePlayer, isSelectedByP1, isSelectedByP2 }: VillainCircleProps) {
  const [hoveredTooltip, setHoveredTooltip] = useState(false);
  const villain = VILLAIN_OPTIONS.find(v => v.id === villainId)!;

  return (
    <div className="relative">
      <button
        onClick={onSelect}
        onMouseEnter={() => setHoveredTooltip(true)}
        onMouseLeave={() => setHoveredTooltip(false)}
        className="w-16 sm:w-20 md:w-24 h-16 sm:h-20 md:h-24 rounded-full border-2 transition-all duration-150 overflow-hidden hover:scale-110 flex items-center justify-center relative"
        style={{
          borderColor: isSelectedByP1 || isSelectedByP2 ? villain.color : 'rgba(73,69,78,0.6)',
          borderWidth: isSelectedByP1 || isSelectedByP2 ? '3px' : '2px',
        }}
      >
        <img
          src={`/images/villains/${villainId}.webp`}
          alt={villain.name}
          className="w-full h-full object-cover scale-125"
        />

        {/* Highlight ring for active player's selection */}
        {(activePlayer === 'player1' && isSelectedByP1) || (activePlayer === 'player2' && isSelectedByP2) ? (
          <div className="absolute inset-0 rounded-full" style={{ boxShadow: `inset 0 0 10px ${villain.color}` }} />
        ) : null}
      </button>

      {hoveredTooltip && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-surface-container-high border border-outline-variant/60 rounded-lg p-2 w-40 z-50 shadow-lg">
          <p className="text-xs text-on-surface-variant text-center leading-snug">
            {description}
          </p>
        </div>
      )}
    </div>
  );
}

interface PlayerCardProps {
  playerLabel: string;
  name: string;
  villainId: VillainId | null;
  onNameChange: (name: string) => void;
  isActive: boolean;
  onActivate: () => void;
}

function PlayerCard({ playerLabel, name, villainId, onNameChange, isActive, onActivate }: PlayerCardProps) {
  const villain = villainId ? VILLAIN_OPTIONS.find(v => v.id === villainId) : null;

  return (
    <div
      className={`bg-surface-container-low border-2 rounded-xl p-4 flex flex-col gap-3 transition-all cursor-pointer ${
        isActive ? 'border-primary' : 'border-outline-variant/40'
      }`}
      onClick={onActivate}
    >
      <div className="mb-2">
        <h3 className="font-stats text-xs text-on-surface-variant uppercase tracking-widest">
          {playerLabel}
        </h3>
      </div>


      <input
        type="text"
        value={name}
        onChange={e => {
          e.stopPropagation();
          onNameChange(e.target.value);
        }}
        onClick={e => e.stopPropagation()}
        placeholder="Nombre"
        className="bg-surface-container border border-outline-variant/50 rounded px-3 sm:px-2 py-2 sm:py-1 min-h-10 sm:min-h-auto text-sm sm:text-xs text-on-surface outline-none focus:border-primary/60 transition-colors"
      />

      {/* Villano seleccionado - mostrar imagen debajo del nombre */}
      {villain && (
        <div className="flex flex-col items-center gap-2 mt-3">
          <div className="w-24 h-24 rounded-full border-2 overflow-hidden" style={{ borderColor: villain.color }}>
            <img
              src={`/images/villains/${villain.id}.webp`}
              alt={villain.name}
              className="w-full h-full object-cover scale-125"
            />
          </div>
          <p className="text-sm font-serif text-on-surface text-center">
            {villain.name}
          </p>
        </div>
      )}
    </div>
  );
}

export function GameSetup() {
  const initGame = useGameStore(s => s.initGame);
  const [gameMode, setGameMode] = useState<GameMode>(null);
  const [activePlayer, setActivePlayer] = useState<ActivePlayer>('player1');

  const [p1Villain, setP1Villain] = useState<VillainId | null>(null);
  const [p1Name, setP1Name] = useState('Jugador 1');

  const [p2Villain, setP2Villain] = useState<VillainId | null>(null);
  const [p2IsAI, setP2IsAI] = useState(false);
  const [p2Name, setP2Name] = useState('Jugador 2');

  function handleVillainSelect(villainId: VillainId) {
    if (activePlayer === 'player1') {
      setP1Villain(villainId);
      // Si la IA está activa, asignar automáticamente un villano diferente
      if (p2IsAI) {
        const differentVillain = VILLAIN_OPTIONS.find(v => v.id !== villainId);
        if (differentVillain) {
          setP2Villain(differentVillain.id);
        }
      } else {
        // En modo 1v1, cambiar automáticamente a Jugador 2
        setActivePlayer('player2');
      }
    } else {
      // En modo jugador vs jugador, permitir selección manual
      setP2Villain(villainId);
    }
  }

  function start() {
    if (!p1Villain || !p2Villain) {
      alert('Ambos jugadores deben seleccionar un villano.');
      return;
    }
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

  // Pantalla de selección de modo
  if (gameMode === null) {
    return (
      <div className="h-screen flex flex-col items-center justify-center px-4 gap-4 sm:gap-6 md:gap-8 py-4 sm:py-6">
        {/* Logo */}
        <div className="text-center flex flex-col w-full shrink-0">
          <Image
            src="/Logo-vote-villainous.webp"
            className="h-24 sm:h-32 md:h-48 lg:h-96 object-contain"
          />
        </div>

        {/* Mode Selection Buttons */}
        <div className="flex flex-col gap-2 sm:gap-3 w-full max-w-xs shrink-0">
          <button
            onClick={() => setGameMode('1v1')}
            className="px-4 sm:px-6 py-3 sm:py-2.5 min-h-12 sm:min-h-11 text-xs sm:text-sm md:text-base rounded-lg font-serif font-bold uppercase transition-all hover:scale-105 active:scale-95 touch-none"
            style={{
              background: 'linear-gradient(135deg, #d3bcf9 0%, #8b5cf6 100%)',
              color: '#1c1b1b',
            }}
          >
            Jugador vs Jugador
          </button>

          <button
            onClick={() => {
              setGameMode('vsia');
              setP2IsAI(true);
              setP2Name('IA');
            }}
            className="px-4 sm:px-6 py-3 sm:py-2.5 min-h-12 sm:min-h-11 text-xs sm:text-sm md:text-base rounded-lg font-serif font-bold uppercase transition-all hover:scale-105 active:scale-95 touch-none"
            style={{
              background: 'linear-gradient(135deg, #e9c349 0%, #f97316 100%)',
              color: '#1c1b1b',
            }}
          >
            Jugador vs IA
          </button>
        </div>
      </div>
    );
  }

  // Pantalla de selección de villanos
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 gap-6 sm:gap-8 lg:gap-8">
      {/* Header con botón atrás y label */}
      <div className="flex items-center justify-between w-full max-w-full lg:max-w-6xl pt-4 px-2 sm:px-0">
        <button
          onClick={() => {
            setGameMode(null);
            setP1Villain(null);
            setP2Villain(null);
            setActivePlayer('player1');
          }}
          className="p-2 rounded-lg border border-outline-variant/50 text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <ArrowLeft className="w-4 sm:w-5 h-4 sm:h-5" />
        </button>
        <p className="font-stats text-xs sm:text-sm text-on-surface-variant uppercase tracking-widest text-center flex-1 px-4">
          Selecciona Villano ({activePlayer === 'player1' ? 'J1' : 'J2'})
        </p>
        <div className="w-9" />
      </div>

      {/* Main Layout: Always show both players */}
      <div className="flex gap-2 sm:gap-4 lg:gap-6 items-start w-full max-w-full lg:max-w-7xl px-2 sm:px-0">
        {/* Player 1 Card */}
        <div className="shrink-0 w-32 sm:w-40 md:w-48 lg:w-56">
          <PlayerCard
            playerLabel="J1"
            name={p1Name}
            villainId={p1Villain}
            onNameChange={setP1Name}
            isActive={activePlayer === 'player1'}
            onActivate={() => setActivePlayer('player1')}
          />
        </div>

        {/* Villain Selector Center - Grid */}
        <div className="flex-1 flex flex-col items-center w-full">
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-0.5 gap-y-2 sm:gap-y-3 lg:gap-y-4 w-full">
            {VILLAIN_OPTIONS.map(v => (
              <div key={v.id} className="flex justify-center">
                <VillainCircle
                  villainId={v.id}
                  description={v.desc}
                  onSelect={() => handleVillainSelect(v.id)}
                  activePlayer={activePlayer}
                  isSelectedByP1={p1Villain === v.id}
                  isSelectedByP2={p2Villain === v.id}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Player 2 Card */}
        <div className="shrink-0 w-32 sm:w-40 md:w-48 lg:w-56">
          <PlayerCard
            playerLabel="J2"
            name={p2Name}
            villainId={p2Villain}
            onNameChange={setP2Name}
            isActive={activePlayer === 'player2'}
            onActivate={() => setActivePlayer('player2')}
          />
        </div>
      </div>

      {/* Start Button */}
      <button
        onClick={start}
        disabled={!p1Villain || !p2Villain}
        className="px-8 sm:px-12 py-3 sm:py-3 min-h-12 rounded-lg font-stats text-xs sm:text-sm font-bold uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:opacity-85 active:enabled:scale-95 w-full sm:w-auto max-w-xs touch-none"
        style={{
          background: p1Villain && p2Villain
            ? 'linear-gradient(135deg, #2d1b4d 0%, #4f3d71 100%)'
            : 'linear-gradient(135deg, #2d1b4d 0%, #4f3d71 100%)',
          border: '2px solid #75fd00',
          color: '#75fd00',
        }}
      >
        Comenzar Partida
      </button>
    </div>
  );
}

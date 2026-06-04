import { useState } from 'react';
import type { VillainId, GameSetupOptions } from '../core/types';
import { getAllPlugins } from '../core/villains/registry';
import { useGameStore } from '../state/gameStore';
import { Swords } from 'lucide-react';

const VILLAIN_OPTIONS = getAllPlugins().map(p => ({
  id: p.id,
  name: p.name,
  color: p.color,
  desc: p.description,
}));

interface VillainPickerProps {
  selected: VillainId;
  onSelect: (id: VillainId) => void;
  conflictId?: VillainId;
}

function VillainPicker({ selected, onSelect, conflictId }: VillainPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      {VILLAIN_OPTIONS.map(v => {
        const isSelected  = selected === v.id;
        const isConflict  = v.id === conflictId && v.id === selected;
        return (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            className="text-left px-4 py-3 rounded-lg border transition-all duration-150 flex flex-col gap-1"
            style={{
              borderColor: isConflict  ? '#ffb4ab'
                : isSelected ? v.color
                : 'rgba(73,69,78,0.6)',
              background: isSelected
                ? `color-mix(in srgb, ${v.color} 12%, #201f1f)`
                : '#1c1b1b',
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="font-serif text-sm font-bold"
                style={{ color: isConflict ? '#ffb4ab' : isSelected ? v.color : '#e5e2e1' }}
              >
                {v.name}
              </span>
              {isConflict && (
                <span className="font-stats text-[9px] text-error uppercase tracking-wider">
                  Ya elegido
                </span>
              )}
            </div>
            <span className="font-sans text-xs text-on-surface-variant leading-snug">{v.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

export function GameSetup() {
  const initGame = useGameStore(s => s.initGame);
  const [p1Villain, setP1Villain] = useState<VillainId>(VILLAIN_OPTIONS[0].id);
  const [p2Villain, setP2Villain] = useState<VillainId>(VILLAIN_OPTIONS[1].id);
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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 gap-10">

      {/* Title */}
      <div className="text-center flex flex-col gap-2">
        <h1
          className="font-serif text-5xl font-bold italic leading-tight"
          style={{
            background: 'linear-gradient(135deg, #d3bcf9 0%, #e9c349 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Disney Villainous
        </h1>
        <p className="font-stats text-xs text-on-surface-variant uppercase tracking-[0.2em]">
          Elige a tus Villanos
        </p>
      </div>

      {/* Player panels */}
      <div className="flex flex-col sm:flex-row gap-6 items-start w-full max-w-2xl">

        {/* Player 1 */}
        <div className="flex-1 bg-surface-container-low border border-outline-variant/40 rounded-xl p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-stats text-xs text-on-surface-variant uppercase tracking-widest">Jugador 1</h2>
            <input
              className="bg-surface-container border border-outline-variant/50 rounded-lg px-3 py-2 text-sm text-on-surface w-full outline-none focus:border-primary/60 transition-colors"
              value={p1Name}
              onChange={e => setP1Name(e.target.value)}
              placeholder="Nombre"
            />
          </div>
          <VillainPicker
            selected={p1Villain}
            onSelect={setP1Villain}
            conflictId={p2Villain}
          />
        </div>

        {/* VS divider */}
        <div className="flex sm:flex-col items-center justify-center gap-2 sm:pt-16 self-center sm:self-start">
          <div className="h-px w-8 sm:h-8 sm:w-px bg-outline-variant/40" />
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-tertiary/10 border border-tertiary/30">
            <Swords className="w-4 h-4 text-tertiary" />
          </div>
          <div className="h-px w-8 sm:h-8 sm:w-px bg-outline-variant/40" />
        </div>

        {/* Player 2 */}
        <div className="flex-1 bg-surface-container-low border border-outline-variant/40 rounded-xl p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-stats text-xs text-on-surface-variant uppercase tracking-widest">Jugador 2</h2>
            <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer select-none">
              <input
                type="checkbox"
                checked={p2IsAI}
                onChange={e => {
                  setP2IsAI(e.target.checked);
                  setP2Name(e.target.checked ? 'IA' : 'Jugador 2');
                }}
                className="accent-primary w-4 h-4"
              />
              Controlar con IA
            </label>
            {!p2IsAI && (
              <input
                className="bg-surface-container border border-outline-variant/50 rounded-lg px-3 py-2 text-sm text-on-surface w-full outline-none focus:border-primary/60 transition-colors"
                value={p2Name}
                onChange={e => setP2Name(e.target.value)}
                placeholder="Nombre"
              />
            )}
          </div>
          <VillainPicker
            selected={p2Villain}
            onSelect={setP2Villain}
            conflictId={p1Villain}
          />
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={start}
        className="px-12 py-3 rounded-lg font-stats text-sm font-bold uppercase tracking-widest transition-opacity hover:opacity-85"
        style={{
          background: 'linear-gradient(135deg, #2d1b4d 0%, #4f3d71 100%)',
          border: '2px solid #75fd00',
          color: '#75fd00',
        }}
      >
        Comenzar Partida
      </button>
    </div>
  );
}

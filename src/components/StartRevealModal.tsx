import { useEffect, useState } from 'react';
import type { GameState } from '../core/types';
import { modalStyles } from '../styles/modalStyles';

interface Props {
  state: GameState;
  startingPlayerIndex: number;
  onContinue: () => void;
}

const SPIN_MS = 1900;

/** Revela con una Moneda de Poder girando quién empieza la partida (sorteo aleatorio). */
export function StartRevealModal({ state, startingPlayerIndex, onContinue }: Props) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), SPIN_MS);
    return () => clearTimeout(t);
  }, []);

  const starter   = state.players[startingPlayerIndex];
  const other     = state.players[startingPlayerIndex === 0 ? 1 : 0];

  return (
    <div className={modalStyles.overlay}>
      <div className="bg-surface-container-highest/98 border-2 border-tertiary/40 rounded-3xl shadow-2xl flex flex-col items-center gap-6 p-8 w-11/12 sm:w-full sm:max-w-sm pointer-events-auto backdrop-blur-sm">

        <p className="font-stats text-xs uppercase tracking-widest text-on-surface-variant/60">
          {revealed ? 'Sorteo del turno' : 'Lanzando la moneda…'}
        </p>

        {/* Moneda */}
        <div style={{ perspective: '600px' }} className="flex items-center justify-center h-28">
          <div
            className={`relative w-24 h-24 rounded-full ${revealed ? '' : 'coin-spin'}`}
            style={{ transformStyle: 'preserve-3d' }}
          >
            {revealed ? (
              <div
                className="w-24 h-24 rounded-full border-4 overflow-hidden shadow-[0_0_24px_rgba(233,195,73,0.55)]"
                style={{ borderColor: '#e9c349' }}
              >
                <img
                  src={`/images/villains/${starter.villainId}.webp`}
                  alt={starter.name}
                  className="w-full h-full object-cover scale-125"
                />
              </div>
            ) : (
              <div
                className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center shadow-[0_0_24px_rgba(233,195,73,0.5)]"
                style={{
                  background: 'radial-gradient(circle at 35% 30%, #f7e08a, #e9c349 55%, #b8911f)',
                  border: '4px solid #c9a227',
                }}
              >
                <img
                  src="/images/actions/gain_power.png"
                  alt="Moneda de Poder"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        </div>

        {/* Resultado */}
        {revealed ? (
          <>
            <div className="text-center">
              <p className="font-stats text-[11px] uppercase tracking-widest text-on-surface-variant/60 mb-1">
                ¡Empieza!
              </p>
              <h2 className="font-serif text-3xl font-bold text-tertiary">{starter.name}</h2>
              <p className="font-stats text-xs text-on-surface-variant/70 mt-2">
                {other.name} recibe <span className="text-tertiary font-bold">+1 ⚡</span> por ir segundo
              </p>
            </div>
            <button
              onClick={onContinue}
              className="w-full px-6 py-3 min-h-12 rounded-xl border-2 border-tertiary bg-tertiary/20 hover:bg-tertiary/30 text-tertiary font-serif font-bold uppercase tracking-wider transition-all active:scale-95"
            >
              Comenzar
            </button>
          </>
        ) : (
          <p className="font-serif text-base text-on-surface-variant/80 h-13 flex items-center">
            Decidiendo quién mueve primero…
          </p>
        )}
      </div>
    </div>
  );
}

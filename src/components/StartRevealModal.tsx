import { useEffect, useState } from 'react';
import type { GameState } from '../core/types';
import { assetUrl } from '../lib/assets';
import { ModalStage } from './shared/ModalStage';

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
    <ModalStage
      eyebrow={revealed ? 'Sorteo del turno' : 'Lanzando la moneda…'}
      title={revealed ? `¡Empieza ${starter.name}!` : 'Decidiendo quién mueve primero'}
      subtitle={revealed ? <>{other.name} recibe <b className="not-italic text-[#f6dd94]">+1 ⚡</b> por ir segundo.</> : undefined}
      widthClass="max-w-md"
      actions={revealed ? <button onClick={onContinue} className="stage-btn stage-btn--primary">Comenzar</button> : undefined}
    >
      {/* Moneda */}
      <div style={{ perspective: '600px' }} className="flex items-center justify-center h-20 sm:h-28 shrink-0">
        <div
          className={`relative w-20 sm:w-24 h-20 sm:h-24 rounded-full ${revealed ? '' : 'coin-spin'}`}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {revealed ? (
            <div
              className="w-20 sm:w-24 h-20 sm:h-24 rounded-full border-4 overflow-hidden shadow-[0_0_24px_rgba(233,195,73,0.55)]"
              style={{ borderColor: '#e9c349' }}
            >
              <img
                src={assetUrl(`villains/${starter.villainId}.webp`)}
                alt={starter.name}
                className="w-full h-full object-cover scale-125"
              />
            </div>
          ) : (
            <div
              className="w-20 sm:w-24 h-20 sm:h-24 rounded-full overflow-hidden flex items-center justify-center shadow-[0_0_24px_rgba(233,195,73,0.5)]"
              style={{
                background: 'radial-gradient(circle at 35% 30%, #f7e08a, #e9c349 55%, #b8911f)',
                border: '4px solid #c9a227',
              }}
            >
              <img
                src={assetUrl('actions/gain_power.webp')}
                alt="Moneda de Poder"
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>
      </div>
    </ModalStage>
  );
}

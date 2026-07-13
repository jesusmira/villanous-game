import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { GameState } from '../core/types';
import { modalStyles } from '../styles/modalStyles';
import { Image } from './Image';
import { assetUrl } from '../lib/assets';

interface Props {
  state: GameState;
  onPlayAgain: () => void;
}

export function VictoryModal({ state, onPlayAgain }: Props) {
  useEffect(() => {
    if (!state.winner) return;

    // Origen desde el centro
    const origin = { x: 0.5, y: 0.5 };
    const duration = 8 * 1000; // 8 segundos
    const animationEnd = Date.now() + duration;

    // Primera explosión inmediata (izquierda y derecha, hacia arriba 30°)
    confetti({
      particleCount: 40,
      angle: 45,
      spread: 45,
      origin,
      startVelocity: 25,
      gravity: 0.8,
      decay: 0.92,
      ticks: 200,
      colors: ['#e9c349', '#f97316', '#d3bcf9'],
    });
    confetti({
      particleCount: 40,
      angle: 135,
      spread: 45,
      origin,
      startVelocity: 25,
      gravity: 0.8,
      decay: 0.92,
      ticks: 200,
      colors: ['#e9c349', '#f97316', '#d3bcf9'],
    });

    // Explosiones siguientes con intervalo
    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      // Explosión hacia la derecha hacia arriba
      confetti({
        particleCount: 40,
        angle: 45,
        spread: 45,
        origin,
        startVelocity: 25,
        gravity: 0.8,
        decay: 0.92,
        ticks: 200,
        colors: ['#e9c349', '#f97316', '#d3bcf9'],
      });
      // Explosión hacia la izquierda hacia arriba
      confetti({
        particleCount: 40,
        angle: 135,
        spread: 45,
        origin,
        startVelocity: 25,
        gravity: 0.8,
        decay: 0.92,
        ticks: 200,
        colors: ['#e9c349', '#f97316', '#d3bcf9'],
      });
    }, 1600);

    return () => clearInterval(interval);
  }, [state.winner]);

  if (!state.winner) return null;

  const winner = state.players.find(p => p.id === state.winner);

  // Jugada final: las líneas del log desde el último separador de turno. Si el ganador
  // es la IA, esto es exactamente su turno ganador — lo que el jugador no vio en vivo.
  const lastTurnSeparator = state.log.reduce(
    (last, line, i) => (line.startsWith('--- Turno de') ? i : last), -1,
  );
  const finalTurnLines = state.log
    .slice(lastTurnSeparator + 1)
    .filter(line => line.trim().length > 0);

  return (
    <div className={modalStyles.overlay}>

      {/* Modal */}
      <div className="bg-surface-container-highest/98 border-2 border-tertiary/50 rounded-3xl shadow-2xl flex flex-col gap-4 sm:gap-6 p-5 sm:p-8 w-10/12 max-w-xs sm:w-full sm:max-w-md pointer-events-auto backdrop-blur-sm">
        {/* Villain Portrait */}
        <div className="flex justify-center">
          <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-tertiary/60 shadow-lg animate-bounce">
            <Image
              src={assetUrl(`villains/${winner?.villainId}.webp`)}
              alt={winner?.name}
              className="w-full h-full object-cover scale-125"
            />
          </div>
        </div>

        {/* Title */}
        <div className="text-center">
          <p className="font-stats text-xs sm:text-sm uppercase tracking-widest text-on-surface-variant/60 mb-1 sm:mb-2">
            ¡Victoria!
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-tertiary">
            {winner?.name}
          </h2>
          <p className="font-stats text-xs uppercase tracking-wider text-on-surface-variant/50 mt-1 sm:mt-2">
            ha ganado la partida
          </p>
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-linear-to-r from-transparent via-tertiary/30 to-transparent" />

        {/* Stats */}
        <div className="flex gap-3 justify-center">
          <div className="flex flex-col items-center px-4 py-2 bg-surface-container/60 rounded-lg border border-tertiary/20">
            <span className="font-stats text-[10px] text-on-surface-variant/60 uppercase tracking-wider">Poder</span>
            <span className="font-stats text-lg font-bold text-tertiary">{winner?.power ?? 0}</span>
          </div>
          <div className="flex flex-col items-center px-4 py-2 bg-surface-container/60 rounded-lg border border-tertiary/20">
            <span className="font-stats text-[10px] text-on-surface-variant/60 uppercase tracking-wider">Turno</span>
            <span className="font-stats text-lg font-bold text-tertiary">{state.roundNumber}</span>
          </div>
        </div>

        {/* Jugada final */}
        {finalTurnLines.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="font-stats text-[10px] uppercase tracking-wider text-on-surface-variant/60 text-center">
              Jugada final
            </p>
            <div className="bg-surface-container/60 rounded-lg border border-tertiary/20 px-3 py-2 max-h-32 overflow-y-auto flex flex-col gap-1">
              {finalTurnLines.map((line, i) => (
                <p key={i} className="text-[11px] leading-snug text-on-surface-variant/80">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Button */}
        <button
          onClick={onPlayAgain}
          className="px-6 py-3 sm:py-3 min-h-12 sm:min-h-auto rounded-xl border-2 border-tertiary bg-tertiary/20 hover:bg-tertiary/30 text-tertiary font-serif font-bold uppercase tracking-wider transition-all active:scale-95"
        >
          Jugar de nuevo
        </button>
      </div>
    </div>
  );
}

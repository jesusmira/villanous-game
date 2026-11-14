import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { GameState } from '../core/types';
import { Image } from './Image';
import { assetUrl } from '../lib/assets';
import { ModalStage } from './shared/ModalStage';

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
    <ModalStage
      eyebrow="¡Victoria!"
      title={winner?.name ?? ''}
      subtitle="ha ganado la partida"
      widthClass="max-w-md"
      actions={<button onClick={onPlayAgain} className="btn btn--primary">Jugar de nuevo</button>}
    >
      {/* Retrato del villano ganador con anillo de oro. Es lo PRIMERO del contenido y
          .modal-stage-content tiene overflow-y:auto, así que sin el margen superior (mt-10) su
          halo de 40px se cortaba en seco por arriba (mismo caso que la moneda de StartRevealModal). */}
      <div className="villain-avatar-ring order-first mt-10" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.7), 0 0 40px rgba(230,196,106,0.55), 0 10px 24px rgba(0,0,0,0.7)' }}>
        <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-black">
          <Image
            src={assetUrl(`villains/${winner?.villainId}.webp`)}
            alt={winner?.name}
            className="w-full h-full object-cover scale-125"
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-6">
        <span className="stage-stat">Poder <b className="text-gold-bright">{winner?.power ?? 0}</b></span>
        <span className="stage-stat">Ronda <b className="text-gold-bright">{state.roundNumber}</b></span>
      </div>

      {finalTurnLines.length > 0 && (
        <div className="modal-stage-section">
          <span className="modal-stage-label">Jugada final</span>
          <div className="history-sheet history-scroll w-full max-h-40! overflow-y-auto flex flex-col gap-1">
            {finalTurnLines.map((line, i) => (
              <p key={i} className="font-narrative text-[15px] leading-snug text-[#efe6d2]/80">{line}</p>
            ))}
          </div>
        </div>
      )}
    </ModalStage>
  );
}

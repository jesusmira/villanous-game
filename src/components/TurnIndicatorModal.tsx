import { useEffect, useState } from 'react';
import type { PlayerState } from '../core/types';
import { getPlugin } from '../core/villains/registry';

interface Props {
  player: PlayerState;
  isOpen: boolean;
  onClose: () => void;
}

export function TurnIndicatorModal({ player, isOpen, onClose }: Props) {
  const plugin = getPlugin(player.villainId);
  const [displayName, setDisplayName] = useState(player.name);

  useEffect(() => {
    setDisplayName(player.name);
  }, [player.name]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => onClose(), 6000);
    return () => clearTimeout(timer);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
      {/* Fondo oscuro para mejor contraste */}
      <div
        className="absolute inset-0 bg-black/50 pointer-events-auto"
        onClick={onClose}
      />

      <div
        className="relative pointer-events-auto"
        onClick={onClose}
      >
        <div
          className="px-16 py-12 rounded-3xl backdrop-blur-lg border-4 shadow-2xl text-center"
          style={{
            borderColor: plugin.color,
            backgroundColor: `${plugin.color}40`,
            boxShadow: `0 0 60px ${plugin.color}80, 0 0 30px ${plugin.color}60, 0 10px 40px rgba(0,0,0,0.5)`,
          }}
        >
          <p className="font-stats text-sm uppercase tracking-widest text-white mb-3 opacity-90">
            Turno de:
          </p>
          <h1
            className="font-serif text-6xl sm:text-7xl leading-none font-bold drop-shadow-lg"
            style={{ color: '#ffffff', textShadow: `2px 2px 8px ${plugin.color}80` }}
          >
            {displayName}
          </h1>
          <button
            onClick={onClose}
            className="mt-8 px-8 py-3 bg-white/20 hover:bg-white/30 border-2 border-white rounded-lg font-stats text-sm uppercase tracking-widest text-white transition-all hover:scale-105 active:scale-95"
            style={{
              borderColor: plugin.color,
              backgroundColor: `${plugin.color}20`,
            }}
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

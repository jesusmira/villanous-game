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
      <div
        className="animate-pulse pointer-events-auto"
        onClick={onClose}
      >
        <div
          className="px-12 py-8 rounded-3xl backdrop-blur-md border-2 shadow-2xl text-center cursor-pointer hover:scale-105 transition-transform"
          style={{
            borderColor: plugin.color,
            backgroundColor: `${plugin.color}15`,
          }}
        >
          <p className="font-stats text-xs uppercase tracking-widest text-on-surface-variant mb-2">
            Turno
          </p>
          <h1
            className="font-serif text-4xl sm:text-5xl leading-none font-bold"
            style={{ color: plugin.color }}
          >
            {displayName}
          </h1>
          <p className="font-stats text-[10px] uppercase tracking-[0.3em] text-on-surface-variant mt-3">
            Haz clic para continuar
          </p>
        </div>
      </div>
    </div>
  );
}

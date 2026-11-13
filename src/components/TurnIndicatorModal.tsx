import { useEffect } from 'react';
import type { PlayerState } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { ModalStage } from './shared/ModalStage';

interface Props {
  player: PlayerState;
  isOpen: boolean;
  onClose: () => void;
}

export function TurnIndicatorModal({ player, isOpen, onClose }: Props) {
  const plugin = getPlugin(player.villainId);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => onClose(), 6000);
    return () => clearTimeout(timer);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <ModalStage
      zClass="z-[9999]"
      onDismiss={onClose}
      eyebrow="Turno de"
      title={<span className="turn-indicator-name" style={{ textShadow: `0 2px 4px rgba(0,0,0,0.9), 0 0 36px ${plugin.color}cc, 0 0 70px rgba(230,196,106,0.3)` }}>{player.name}</span>}
      subtitle={plugin.name}
      widthClass="max-w-xl"
      actions={<button onClick={onClose} className="btn btn--primary">Aceptar</button>}
    />
  );
}

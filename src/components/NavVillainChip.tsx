import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import type { PlayerState } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { Image } from './Image';
import { assetUrl } from '../lib/assets';

/**
 * Índice del tablero de jugador que se está viendo al hacer scroll: el último cuyo borde superior
 * ya ha pasado una línea al 40% de la altura de la ventana (los tableros son `[data-player-board]`
 * en PlayerBoard, en el mismo orden que `players`). Solo se actualiza desde eventos de scroll/
 * resize, así que no re-renderiza mientras no cambie de tablero.
 */
function useVisibleBoardIndex(playerIds: string[]): number {
  const [index, setIndex] = useState(0);
  const idsKey = playerIds.join('|');

  useEffect(() => {
    const ids = idsKey.split('|');
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * 0.4;
      let active = 0;
      ids.forEach((id, i) => {
        const el = document.querySelector(`[data-player-board="${id}"]`);
        if (el && el.getBoundingClientRect().top <= line) active = i;
      });
      setIndex(active);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [idsKey]);

  return index;
}

function ChipFace({ player }: { player: PlayerState }) {
  const plugin = getPlugin(player.villainId);
  return (
    <span className="nav-villain-face" title={`${plugin.name} · ${player.power} de Poder`}>
      <span className="nav-villain-avatar" style={{ boxShadow: `0 0 0 1.5px ${plugin.color}, 0 0 10px ${plugin.color}88` }}>
        <Image src={assetUrl(`villains/${player.villainId}.webp`)} alt={plugin.name} className="w-full h-full object-cover scale-150" />
      </span>
      <span className="nav-villain-coin" aria-hidden="true">
        <Zap className="w-2.5 h-2.5" fill="currentColor" />
      </span>
      <span className="font-stats text-sm font-bold text-gold-bright leading-none tabular-nums">{player.power}</span>
    </span>
  );
}

/**
 * Pastilla de la barra superior con el avatar y el Poder del villano cuyo tablero se está viendo.
 * Al bajar al tablero siguiente, la actual sale hacia arriba y la nueva entra desde abajo; al
 * subir, al revés (ver .nav-villain-* en animations.css).
 */
export function NavVillainChip({ players }: { players: PlayerState[] }) {
  const visible = useVisibleBoardIndex(players.map(p => p.id));

  // Animación: al cambiar de tablero, la cara anterior se queda montada solo mientras sale.
  const [anim, setAnim] = useState<{ prev: number | null; dir: 'up' | 'down'; key: number }>({ prev: null, dir: 'up', key: 0 });
  const [shown, setShown] = useState(visible);
  if (shown !== visible) {
    // Ajuste durante el render (patrón de React para estado derivado): sin commit intermedio.
    // `shown` todavía es el tablero anterior: de ahí sale la cara que se va y la dirección.
    setShown(visible);
    setAnim(a => ({ prev: shown, dir: visible > shown ? 'up' : 'down', key: a.key + 1 }));
  }

  const current = players[shown];
  const previous = anim.prev !== null ? players[anim.prev] : null;
  if (!current) return null;

  return (
    <span className="nav-villain-stage" aria-live="polite">
      {previous && (
        <span
          key={`out-${anim.key}`}
          className={`nav-villain-slot is-out-${anim.dir}`}
          onAnimationEnd={() => setAnim(a => (a.key === anim.key ? { ...a, prev: null } : a))}
        >
          <ChipFace player={previous} />
        </span>
      )}
      <span key={`in-${anim.key}`} className={`nav-villain-slot ${anim.key > 0 ? `is-in-${anim.dir}` : ''}`}>
        <ChipFace player={current} />
      </span>
    </span>
  );
}

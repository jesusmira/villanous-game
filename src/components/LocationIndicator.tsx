import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { Crown } from 'lucide-react';
import type { GameState, LocationDef, PlayerState } from '../core/types';

interface Props {
  state: GameState;
  player: PlayerState;
  locations: LocationDef[];
  /** Contenedor con scroll horizontal de las ubicaciones (una por pantalla en móvil vertical). */
  scrollerRef: RefObject<HTMLDivElement | null>;
  /** Ubicaciones donde ahora mismo se puede hacer algo (jugar la carta elegida, mover el peón…). */
  highlightedLocIds?: string[];
}

/**
 * Fila de "pestañas" sobre las ubicaciones, solo en móvil vertical (allí se ve una ubicación cada
 * vez y había que deslizar a ciegas): marca en cuál estás, dónde está el peón, cuántos Héroes hay
 * en cada una y cuáles están iluminadas como destino válido. Tocar una salta a esa ubicación.
 */
export function LocationIndicator({ state, player, locations, scrollerRef, highlightedLocIds = [] }: Props) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const w = el.clientWidth || 1;
      setActive(Math.max(0, Math.min(locations.length - 1, Math.round(el.scrollLeft / w))));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { if (frame) cancelAnimationFrame(frame); el.removeEventListener('scroll', onScroll); };
  }, [scrollerRef, locations.length]);

  const goTo = (locId: string) => {
    scrollerRef.current
      ?.querySelector(`[data-loc-id="${locId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  return (
    <nav className="loc-indicator landscape:hidden" aria-label="Ubicaciones">
      {locations.map((loc, i) => {
        const ls = player.locationStates[loc.id];
        const heroes = ls?.heroCardInstIds.filter(id => state.allCards[id]).length ?? 0;
        const isPawn = player.pawnLocationId === loc.id;
        const lit = highlightedLocIds.includes(loc.id);
        return (
          <button
            key={loc.id}
            type="button"
            onClick={() => goTo(loc.id)}
            aria-current={i === active ? 'true' : undefined}
            className={`loc-indicator-tab ${i === active ? 'is-active' : ''} ${lit ? 'is-lit' : ''} ${ls?.isLocked ? 'is-locked' : ''}`}
            title={loc.name}
          >
            {isPawn && <Crown className="loc-indicator-crown" aria-label="Tu peón" />}
            <span className="loc-indicator-name">{loc.name.replace(/^(El|La|Los|Las) /, '')}</span>
            {heroes > 0 && <span className="loc-indicator-heroes" title={`${heroes} Héroe${heroes > 1 ? 's' : ''}`}>{heroes}</span>}
          </button>
        );
      })}
    </nav>
  );
}

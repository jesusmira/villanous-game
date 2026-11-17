import { useEffect, useRef, useState } from 'react';
import { Zap, Star, Layers, BookOpen, ChevronDown, HelpCircle } from 'lucide-react';
import type { GameState, PlayerState } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { Image } from './Image';
import { assetUrl } from '../lib/assets';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { parseProgress } from './shared/winProgress';
import type { GuideTab } from './VillainGuideModal';

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
  const power = useAnimatedNumber(player.power);
  return (
    <span className="nav-villain-face" title={`${plugin.name} · ${player.power} de Poder`}>
      <span className="nav-villain-avatar" style={{ boxShadow: `0 0 0 1.5px ${plugin.color}, 0 0 10px ${plugin.color}88` }}>
        <Image src={assetUrl(`villains/${player.villainId}.webp`)} alt={plugin.name} className="w-full h-full object-cover scale-150" />
      </span>
      <span key={power.flash?.key ?? 0} className={`power-flash ${power.flash ? `is-${power.flash.dir}` : ''} inline-flex items-center gap-[5px]`}>
        <span className="power-coin nav-villain-coin" aria-hidden="true">
          <Zap className="w-2.5 h-2.5" fill="currentColor" />
        </span>
        <span className="power-num font-stats text-sm font-bold text-gold-bright leading-none tabular-nums">{power.shown}</span>
      </span>
    </span>
  );
}

interface Props {
  state: GameState;
  onOpenGuide: (playerId: string, tab: GuideTab) => void;
}

/** Con ratón el desplegable se abre al pasar por encima; en táctil, al tocar. */
const HOVER_CAPABLE = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Pastilla de la barra superior con el avatar y el Poder del villano cuyo tablero se está viendo
 * (al bajar al tablero siguiente, la actual sale hacia arriba y la nueva entra desde abajo; al
 * subir, al revés — ver .nav-villain-* en animations.css). Pulsarla abre un desplegable con la
 * ficha completa del villano: objetivo y progreso, Poder, cartas en mano, mazo y Destino, y los
 * accesos a su Guía y a las Reglas. Sustituye a la antigua placa sobre cada tablero.
 */
export function NavVillainChip({ state, onOpenGuide }: Props) {
  const players = state.players;
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

  // Desplegable: abre con la ficha del villano visible; dentro se puede cambiar al otro.
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(visible);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  const openMenu = () => { setSelected(visible); setOpen(true); };
  // Táctil: el botón alterna. Ratón: el botón no hace nada (ya está abierto por hover).
  const toggle = () => { if (HOVER_CAPABLE) return; if (!open) setSelected(visible); setOpen(o => !o); };
  // Hover: pequeño retardo al salir para poder pasar del botón al panel sin que se cierre.
  const leaveTimer = useRef<number | null>(null);
  const onEnter = () => {
    if (!HOVER_CAPABLE) return;
    if (leaveTimer.current) { window.clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    if (!open) openMenu();
  };
  const onLeave = () => {
    if (!HOVER_CAPABLE) return;
    leaveTimer.current = window.setTimeout(() => setOpen(false), 220);
  };
  useEffect(() => () => { if (leaveTimer.current) window.clearTimeout(leaveTimer.current); }, []);

  const current = players[shown];
  const previous = anim.prev !== null ? players[anim.prev] : null;
  if (!current) return null;

  const sel = players[selected] ?? current;
  const selPlugin = getPlugin(sel.villainId);
  const progress = parseProgress(selPlugin.getWinProgress?.(state, sel) ?? null);
  const isTurn = players[state.currentPlayerIndex]?.id === sel.id && !state.winner;

  return (
    <div ref={rootRef} className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Ficha del villano"
        className={`nav-villain-trigger ${open ? 'is-open' : ''}`}
      >
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
        <ChevronDown className={`nav-villain-caret ${open ? 'is-open' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="nav-villain-menu" role="dialog" aria-label={`Ficha de ${selPlugin.name}`}>
          {/* Cambiar de villano */}
          {players.length > 1 && (
            <div className="flex items-center gap-1.5 self-stretch justify-center">
              {players.map((p, i) => {
                const pl = getPlugin(p.villainId);
                return (
                  <button key={p.id} type="button" onClick={() => setSelected(i)}
                    className={`nav-villain-tab ${i === selected ? 'is-selected' : ''}`} title={pl.name}>
                    <span className="nav-villain-avatar" style={{ boxShadow: i === selected ? `0 0 0 1.5px ${pl.color}, 0 0 10px ${pl.color}88` : 'none' }}>
                      <Image src={assetUrl(`villains/${p.villainId}.webp`)} alt={pl.name} className="w-full h-full object-cover scale-150" />
                    </span>
                    <span className="truncate">{p.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { setOpen(false); onOpenGuide(sel.id, 'guide'); }}
              className="villain-avatar-ring villain-avatar-button shrink-0" title={`Guía de ${selPlugin.name}`} aria-label={`Abrir la Guía de Villano de ${selPlugin.name}`}>
              <span className="block w-14 h-14 rounded-full overflow-hidden bg-black"
                style={{ boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.8), inset 0 0 18px ${selPlugin.color}55` }}>
                <Image src={assetUrl(`villains/${sel.villainId}.webp`)} alt={selPlugin.name} className="w-full h-full object-cover scale-150" />
              </span>
              <span className="villain-avatar-badge" aria-hidden="true"><BookOpen className="w-3 h-3" /></span>
            </button>
            <div className="min-w-0 flex flex-col gap-0.5">
              <span className="font-serif font-semibold text-lg leading-none tracking-[0.04em] text-[#f6dd94]" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>
                {selPlugin.name}
              </span>
              <span className="font-stats text-[9px] font-medium uppercase tracking-[0.22em] text-on-surface-variant/70">
                {sel.name}{sel.isAI && sel.name.trim().toUpperCase() !== 'IA' ? ' · IA' : ''}{isTurn ? ' · su turno' : ''}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="guide-label">Objetivo</span>
            <p className="font-narrative italic text-[15px] leading-snug text-[#f1e6cc]">{selPlugin.description}</p>
            {progress.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {progress.map((item, i) => (
                  <span key={i} className={`guide-progress ${item.done ? 'is-done' : ''}`}>
                    {progress.length > 1 ? (item.done ? '◆ ' : '◇ ') : ''}{item.text}
                  </span>
                ))}
              </div>
            )}
          </div>

          <dl className="nav-villain-stats">
            <div><dt><Zap className="w-3 h-3 text-gold-bright" fill="currentColor" /> Poder</dt><dd>{sel.power}</dd></div>
            <div><dt><Star className="w-3 h-3 text-primary" /> En mano</dt><dd>{sel.handInstIds.length}</dd></div>
            <div><dt><Layers className="w-3 h-3 text-on-surface-variant" /> Mazo</dt><dd>{sel.villainDeckInstIds.length}</dd></div>
            <div><dt><BookOpen className="w-3 h-3 text-error" /> Destino</dt><dd>{sel.fateDeckInstIds.length}</dd></div>
          </dl>

          <div className="flex items-center gap-2">
            <button type="button" className="btn btn--secondary btn--sm flex-1" onClick={() => { setOpen(false); onOpenGuide(sel.id, 'guide'); }}>
              <BookOpen className="w-3.5 h-3.5" /> Guía de {selPlugin.name}
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setOpen(false); onOpenGuide(sel.id, 'rules'); }}>
              <HelpCircle className="w-3.5 h-3.5" /> Reglas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { VillainId } from '../core/types';
import { getAllPlugins } from '../core/villains/registry';
import { useGameStore } from '../state/gameStore';
import { Image } from './Image';
import { assetUrl } from '../lib/assets';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';

const REAL_VILLAINS = getAllPlugins().map(p => ({
  id: p.id as VillainId,
  name: p.name,
  color: p.color,
  desc: p.description,
}));

const VILLAIN_OPTIONS = REAL_VILLAINS;

/** Elige un villano al azar distinto de `excludeId` (para que la IA no copie al jugador 1). */
function pickRandomVillain(excludeId: VillainId): typeof VILLAIN_OPTIONS[0] | undefined {
  const remaining = VILLAIN_OPTIONS.filter(u => u.id !== excludeId);
  return remaining[Math.floor(Math.random() * remaining.length)];
}

// Número de círculos visibles por fila según breakpoint
const MOB_PER_ROW   = 6;   // < 768 px: 1 fila de 6
const DESK_PER_PAGE = 12;  // ≥ 768 px: 2 filas de 6

// Ancho del círculo de villano en el carrusel móvil.
// El juego es landscape-only y el alto útil es pequeño (más aún con la barra del
// navegador). Dimensionamos por ALTURA visible (svh) en vez de por ancho, para que
// el círculo + etiqueta siempre quepan en la zona (overflow:hidden) sin recortarse.
// svh = small viewport height → tiene en cuenta la barra del navegador cuando está visible.
const MOB_CIRCLE_W = 'w-[clamp(35px,22svh,90px)]';

type GameMode    = '1v1' | 'vsia' | null;
type ActivePlayer = 'player1' | 'player2';

// ── Círculo de villano ───────────────────────────────────────────────────────
interface CircleProps {
  villainId: VillainId; name: string; color: string; desc: string;
  onSelect: () => void;
  isP1: boolean; isP2: boolean; activePlayer: ActivePlayer;
  disabled?: boolean;
}
function VillainCircle({ villainId, name, color, desc, onSelect, isP1, isP2, activePlayer, disabled = false }: CircleProps) {
  const [tip, setTip] = useState(false);
  const selected = isP1 || isP2;
  const active   = (activePlayer === 'player1' && isP1) || (activePlayer === 'player2' && isP2);
  return (
    <div className="relative flex flex-col items-center gap-1 min-w-0">
      <button
        onClick={disabled ? undefined : onSelect}
        disabled={disabled}
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        className={`w-full max-w-[min(160px,26svh)] aspect-square rounded-full border-2 overflow-hidden transition-all relative ${disabled ? 'opacity-30 grayscale cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
        style={{
          borderColor: selected ? color : 'rgba(73,69,78,0.55)',
          borderWidth: selected ? 3 : 2,
          boxShadow: active ? `0 0 16px 3px ${color}55` : undefined,
        }}
      >
        <img src={assetUrl(`villains/${villainId}.webp`)} alt={name} className="w-full h-full object-cover scale-125" />
        {active && <div className="absolute inset-0 rounded-full" style={{ boxShadow: `inset 0 0 12px ${color}` }} />}
        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-stats text-[7px] sm:text-[8px] uppercase tracking-wide text-on-surface bg-black/60 rounded px-1 py-0.5">En uso</span>
          </div>
        )}
      </button>
      <span
        className="text-[9px] sm:text-[10px] font-serif text-center leading-tight w-full truncate transition-colors"
        style={{ color: selected ? color : 'rgba(200,190,220,0.45)' }}
      >{name}</span>
      {tip && (
        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-surface-container-high border border-outline-variant/60 rounded-lg p-2 w-28 z-50 shadow-lg pointer-events-none">
          <p className="text-[9px] text-on-surface-variant text-center leading-snug">{desc}</p>
        </div>
      )}
    </div>
  );
}

// ── Tarjeta de jugador (altura fija, sin layout shift) ───────────────────────
interface PCProps {
  label: string; name: string; villainId: VillainId | null;
  vColor?: string; vName?: string;
  onNameChange: (n: string) => void; isActive: boolean; onActivate: () => void;
}
function PlayerCard({ label, name, villainId, vColor, vName, onNameChange, isActive, onActivate }: PCProps) {
  return (
    <div
      className="flex items-center gap-2 bg-surface-container-low border-2 rounded-xl p-2 sm:p-2.5 [@media(max-height:500px)]:p-1.5 cursor-pointer select-none transition-colors"
      style={{ borderColor: isActive ? (vColor ?? '#d3bcf9') : 'rgba(73,69,78,0.4)' }}
      onClick={onActivate}
    >
      <div
        className="shrink-0 rounded-full border-2 overflow-hidden w-10 h-10 [@media(max-height:500px)]:w-8 [@media(max-height:500px)]:h-8"
        style={{ borderColor: vColor ?? 'rgba(73,69,78,0.35)' }}
      >
        {villainId
          ? <img src={assetUrl(`villains/${villainId}.webp`)} alt={vName} className="w-full h-full object-cover scale-125" />
          : <div className="w-full h-full bg-surface-container flex items-center justify-center">
              <span className="text-on-surface-variant/25 font-serif">?</span>
            </div>
        }
      </div>
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <span className="font-stats text-[8px] uppercase tracking-widest text-on-surface-variant/60">{label}</span>
        <input
          type="text" value={name} placeholder="Nombre"
          onChange={e => { e.stopPropagation(); onNameChange(e.target.value); }}
          onClick={e => e.stopPropagation()}
          className="bg-surface-container border border-outline-variant/50 rounded px-2 py-1 text-xs text-on-surface outline-none focus:border-primary/60 w-full"
        />
        <span className="font-serif text-[10px] leading-tight truncate" style={{ color: vColor ?? 'transparent', minHeight: '0.875rem' }}>
          {vName ?? ' '}
        </span>
      </div>
    </div>
  );
}

// ── Botón de flecha ──────────────────────────────────────────────────────────
function NavBtn({ dir, disabled, onClick }: { dir: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full border border-outline-variant/50 text-on-surface-variant hover:text-on-surface hover:border-outline disabled:opacity-25 disabled:cursor-not-allowed transition-all active:scale-90"
    >
      {dir === 'left' ? <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" /> : <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />}
    </button>
  );
}

// ── Indicador de página (puntos) ─────────────────────────────────────────────
function PageDots({ total, current }: { total: number; current: number }) {
  if (total <= 1) return null;
  return (
    <div className="flex gap-1 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="h-1.5 rounded-full transition-all"
          style={{
            width: i === current ? 16 : 6,
            background: i === current ? 'rgba(211,188,249,0.8)' : 'rgba(73,69,78,0.4)',
          }}
        />
      ))}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export function GameSetup() {
  const initGame = useGameStore(s => s.initGame);
  const [gameMode, setGameMode]         = useState<GameMode>(null);
  const [activePlayer, setActivePlayer] = useState<ActivePlayer>('player1');

  // Página independiente por breakpoint (no se puede saber cuál se muestra sin JS)
  const [mobPage,  setMobPage]  = useState(0);
  const [deskPage, setDeskPage] = useState(0);

  const [p1Villain, setP1Villain] = useState<VillainId | null>(null);
  const [p1Name,    setP1Name]    = useState('Jugador 1');
  const [p2Villain, setP2Villain] = useState<VillainId | null>(null);
  const [p2IsAI,    setP2IsAI]    = useState(false);
  const [p2Name,    setP2Name]    = useState('Jugador 2');

  const mobTotal  = Math.ceil(VILLAIN_OPTIONS.length / MOB_PER_ROW);
  const deskTotal = Math.ceil(VILLAIN_OPTIONS.length / DESK_PER_PAGE);
  const mobSlice  = VILLAIN_OPTIONS.slice(mobPage  * MOB_PER_ROW,   (mobPage  + 1) * MOB_PER_ROW);
  const deskSlice = VILLAIN_OPTIONS.slice(deskPage * DESK_PER_PAGE, (deskPage + 1) * DESK_PER_PAGE);
  // Columnas = nº de villanos (máx 6). Con pocos villanos evita que queden
  // pequeños y descentrados en una rejilla de 6 huecos.
  const deskCols = Math.min(VILLAIN_OPTIONS.length, 6);

  const p1Meta = p1Villain ? VILLAIN_OPTIONS.find(v => v.id === p1Villain) ?? null : null;
  const p2Meta = p2Villain ? VILLAIN_OPTIONS.find(v => v.id === p2Villain) ?? null : null;

  function circleProps(v: typeof VILLAIN_OPTIONS[0]) {
    // El villano que ya tiene el OTRO jugador no se puede elegir (no dos del mismo).
    const otherVillain = activePlayer === 'player1' ? p2Villain : p1Villain;
    return {
      villainId: v.id, name: v.name, color: v.color, desc: v.desc,
      activePlayer,
      isP1: p1Villain === v.id && p1Meta?.name === v.name,
      isP2: p2Villain === v.id && p2Meta?.name === v.name,
      disabled: v.id === otherVillain,
      onSelect: () => select(v),
    };
  }

  function select(v: typeof VILLAIN_OPTIONS[0]) {
    // Bloqueo de seguridad: no permitir elegir el villano que ya tiene el otro jugador.
    const otherVillain = activePlayer === 'player1' ? p2Villain : p1Villain;
    if (v.id === otherVillain) return;
    if (activePlayer === 'player1') {
      setP1Villain(v.id);
      if (p2IsAI) {
        const pick = pickRandomVillain(v.id);
        if (pick) setP2Villain(pick.id);
      } else {
        setActivePlayer('player2');
      }
    } else {
      setP2Villain(v.id);
    }
  }

  function goBack() {
    setGameMode(null); setP1Villain(null); setP2Villain(null);
    setActivePlayer('player1'); setMobPage(0); setDeskPage(0);
    setP2IsAI(false); setP2Name('Jugador 2');
  }

  function start() {
    if (!p1Villain || !p2Villain) { alert('Ambos jugadores deben seleccionar un villano.'); return; }
    if (p1Villain === p2Villain)  { alert('Cada jugador debe elegir un Villano diferente.'); return; }
    initGame({
      player1: { villainId: p1Villain, isAI: false, name: p1Name },
      player2: { villainId: p2Villain, isAI: p2IsAI, name: p2Name },
    });
  }

  // ── Modo de juego ──────────────────────────────────────────────────────────
  if (gameMode === null) {
    return (
      <div className="h-svh flex flex-col items-center justify-center px-4 gap-5">
        <Image src="/Logo-vote-villainous.webp" className="h-28 sm:h-40 md:h-56 lg:h-72 object-contain" />
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={() => { setGameMode('1v1'); setP2IsAI(false); setP2Name('Jugador 2'); }}
            className="px-6 py-3 min-h-11 text-sm rounded-lg font-serif font-bold uppercase transition-all hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(135deg,#d3bcf9,#8b5cf6)', color: '#1c1b1b' }}>
            Jugador vs Jugador
          </button>
          <button onClick={() => { setGameMode('vsia'); setP2IsAI(true); setP2Name('IA'); }}
            className="px-6 py-3 min-h-11 text-sm rounded-lg font-serif font-bold uppercase transition-all hover:scale-105 active:scale-95"
            style={{ background: 'linear-gradient(135deg,#e9c349,#f97316)', color: '#1c1b1b' }}>
            Jugador vs IA
          </button>
        </div>
      </div>
    );
  }

  // ── Selección de villanos ──────────────────────────────────────────────────
  // CSS grid de filas: [cabecera auto] [villanos 1fr] [indicador auto] [jugadores auto] [botón auto]
  // La zona de villanos (1fr) nunca puede desbordar porque tiene overflow:hidden.
  // SIEMPRE es una sola fila de círculos → no hay problema de altura sin importar
  // el ratio del viewport.
  return (
    <div style={{ minHeight: '100dvh', maxHeight: '100dvh', display: 'grid', gridTemplateRows: 'auto 1fr auto auto auto', overflowY: 'auto' }}>

      {/* Cabecera */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 [@media(max-height:500px)]:pt-1.5">
        <button onClick={goBack}
          className="p-1.5 sm:p-2 rounded-lg border border-outline-variant/50 text-on-surface-variant hover:text-on-surface transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <p className="font-stats text-[10px] sm:text-xs text-on-surface-variant uppercase tracking-widest text-center flex-1 px-3">
          Selecciona Villano ({activePlayer === 'player1' ? 'J1' : 'J2'})
        </p>
        <div className="w-7 sm:w-8" />
      </div>

      {/* ── Zona de villanos (1fr, overflow:hidden) ── */}
      <div style={{ overflow: 'hidden' }} className="flex items-center justify-center px-3 py-2 [@media(max-height:560px)]:py-0.5">

        {/* MOBILE (<768px): carrusel 1 fila, 6 por página */}
        <div className="md:hidden flex items-center justify-center gap-1 px-2 w-full">
          <NavBtn dir="left"  disabled={mobPage === 0}           onClick={() => setMobPage(p => p - 1)} />
          <div className="flex gap-2 justify-center">
            {mobSlice.map((v, i) => (
              <div key={`m${mobPage}-${i}`} className={MOB_CIRCLE_W}>
                <VillainCircle {...circleProps(v)} />
              </div>
            ))}
            {Array.from({ length: MOB_PER_ROW - mobSlice.length }).map((_, i) => (
              <div key={`me${i}`} className={MOB_CIRCLE_W} />
            ))}
          </div>
          <NavBtn dir="right" disabled={mobPage >= mobTotal - 1} onClick={() => setMobPage(p => p + 1)} />
        </div>

        {/* DESKTOP (≥768px) y landscape de móvil: grid de hasta 6 columnas.
            grid-cols-6 fija las pistas, así que NO hacen falta placeholders para
            mantener el ancho; añadirlos solo forzaba filas vacías de tamaño
            completo que inflaban la altura y recortaban los círculos. */}
        <div className="hidden md:flex flex-col items-center gap-3 w-full" style={{ maxWidth: deskCols * 150 }}>
          <div className="grid gap-3 w-full" style={{ gridTemplateColumns: `repeat(${deskCols}, minmax(0, 1fr))` }}>
            {deskSlice.map((v, i) => (
              <VillainCircle key={`d${deskPage}-${i}`} {...circleProps(v)} />
            ))}
          </div>
        </div>
      </div>

      {/* Indicador de página */}
      <div className="flex items-center justify-center gap-3 py-1">
        {/* Mobile dots */}
        <div className="md:hidden">
          <PageDots total={mobTotal} current={mobPage} />
        </div>
        {/* Desktop: dots + flechas de paginación */}
        <div className="hidden md:flex items-center gap-3">
          <NavBtn dir="left"  disabled={deskPage === 0}            onClick={() => setDeskPage(p => p - 1)} />
          <PageDots total={deskTotal} current={deskPage} />
          <NavBtn dir="right" disabled={deskPage >= deskTotal - 1} onClick={() => setDeskPage(p => p + 1)} />
        </div>
      </div>

      {/* Tarjetas de jugadores */}
      <div className="flex gap-2 sm:gap-3 px-3 sm:px-4 pb-2 sm:pb-3 [@media(max-height:500px)]:pb-1">
        <div className="flex-1 min-w-0">
          <PlayerCard label="Jugador 1" name={p1Name} villainId={p1Villain}
            vColor={p1Meta?.color} vName={p1Meta?.name} onNameChange={setP1Name}
            isActive={activePlayer === 'player1'} onActivate={() => setActivePlayer('player1')} />
        </div>
        <div className="flex-1 min-w-0">
          <PlayerCard label={p2IsAI ? 'IA' : 'Jugador 2'} name={p2Name} villainId={p2Villain}
            vColor={p2Meta?.color} vName={p2Meta?.name} onNameChange={setP2Name}
            isActive={activePlayer === 'player2'} onActivate={() => setActivePlayer('player2')} />
        </div>
      </div>

      {/* Botón de inicio */}
      <div className="flex justify-center px-4 pb-4 sm:pb-5 [@media(max-height:500px)]:pb-2">
        <button
          onClick={start} disabled={!p1Villain || !p2Villain}
          className="w-full max-w-xs px-8 py-2.5 sm:py-3 min-h-10 sm:min-h-11 [@media(max-height:500px)]:py-1.5 [@media(max-height:500px)]:min-h-9 rounded-lg font-stats text-xs sm:text-sm font-bold uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:opacity-85 active:enabled:scale-95"
          style={{ background: 'linear-gradient(135deg,#2d1b4d,#4f3d71)', border: '2px solid #75fd00', color: '#75fd00' }}
        >
          Comenzar Partida
        </button>
      </div>
    </div>
  );
}

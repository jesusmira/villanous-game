import { Suspense, use, useState } from 'react';
import type { GameState, PlayerId, CardDef, VillainId } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getPlayer } from '../core/engine/stateHelpers';
import { GUIDE_LOADERS, loadRules } from '../content';
import { ModalStage } from './shared/ModalStage';
import { Markdown } from './shared/Markdown';
import { parseMarkdown } from './shared/markdownParser';
import { parseProgress } from './shared/winProgress';
import { ACTION_IMG } from './shared/actionImages';
import { ACTION_LABELS } from './shared/actionLabels';
import { Image } from './Image';
import { assetUrl } from '../lib/assets';
import { Lock, ArrowRight } from 'lucide-react';
import type { MdBlock } from './shared/markdownParser';

export type GuideTab = 'guide' | 'rules';

interface Props {
  state: GameState;
  /** Jugador cuya Guía de Villano se muestra en la pestaña "Guía". */
  playerId: PlayerId;
  initialTab: GuideTab;
  onClose: () => void;
}

// Caché de promesas a nivel de módulo: `use()` necesita la MISMA promesa entre renders, y así el
// texto solo se descarga una vez por sesión.
const textCache = new Map<string, Promise<string>>();
function loadText(key: string, loader: () => Promise<string>): Promise<string> {
  let p = textCache.get(key);
  if (!p) { p = loader(); textCache.set(key, p); }
  return p;
}

/**
 * Guía de Villano + Reglas del juego, consultables durante la partida. Se abre pulsando el
 * avatar de un villano (pestaña Guía de ese villano) o el botón de Reglas de la barra superior.
 */
export function VillainGuideModal({ state, playerId, initialTab, onClose }: Props) {
  const [tab, setTab] = useState<GuideTab>(initialTab);
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);

  return (
    <ModalStage
      zClass="z-110"
      onDismiss={onClose}
      eyebrow={tab === 'guide' ? 'Guía de Villano' : 'Disney Villainous'}
      title={tab === 'guide' ? plugin.name : 'Reglas del juego'}
      widthClass="max-w-2xl"
      actions={<button onClick={onClose} className="btn btn--secondary">Cerrar</button>}
    >
      <div className="flex gap-2" role="tablist">
        <button role="tab" aria-selected={tab === 'guide'} onClick={() => setTab('guide')}
          className={`chip ${tab === 'guide' ? 'is-chosen' : ''}`}>
          Guía de {plugin.name}
        </button>
        <button role="tab" aria-selected={tab === 'rules'} onClick={() => setTab('rules')}
          className={`chip ${tab === 'rules' ? 'is-chosen' : ''}`}>
          Reglas
        </button>
      </div>

      <div className="guide-panel" style={{ '--villain-color': plugin.color }}>
        <Suspense fallback={<p className="modal-stage-note">Cargando…</p>}>
          {tab === 'guide'
            ? <GuideTabContent state={state} playerId={playerId} />
            : <RulesTabContent />}
        </Suspense>
      </div>
    </ModalStage>
  );
}

// ── Pestaña Guía ────────────────────────────────────────────────────────────

function GuideTabContent({ state, playerId }: { state: GameState; playerId: PlayerId }) {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const source = use(loadText(`guide:${player.villainId}`, GUIDE_LOADERS[player.villainId]));
  const progress = parseProgress(plugin.getWinProgress?.(state, player) ?? null);
  const isHuman = !player.isAI;

  return (
    <>
      <header className="guide-hero">
        <div className="villain-avatar-ring shrink-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-black">
            <Image src={assetUrl(`villains/${player.villainId}.webp`)} className="w-full h-full object-cover scale-150" />
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <span className="guide-label">Objetivo</span>
          <p className="guide-objective">{plugin.description}</p>
          {progress.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="guide-label">Ahora:</span>
              {progress.map((item, i) => (
                <span key={i} className={`guide-progress ${item.done ? 'is-done' : ''}`}>
                  {item.done ? '◆' : '◇'} {item.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <span className="guide-label">{isHuman ? 'Tu Reino' : `Reino de ${plugin.name}`}</span>
        <div className="guide-locations">
          {plugin.locations.map(loc => (
            <div key={loc.id} className="guide-location">
              <span className="guide-location-name">
                {loc.startsLocked && <Lock className="inline w-3 h-3 mr-1 -mt-0.5" aria-label="Empieza bloqueada" />}
                {loc.name}
              </span>
              <div className="flex flex-wrap justify-center gap-1">
                {loc.actions.map((a, i) => {
                  const label = `${ACTION_LABELS[a.type] ?? a.type}${a.value ? ` ${a.value}` : ''}`;
                  return (
                    <span key={i} className="guide-action" title={label}>
                      <img src={ACTION_IMG[a.type]} alt={label} className="w-full h-full object-contain" />
                      {a.value ? <span className="guide-action-value">{a.value}</span> : null}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {plugin.locations.some(l => l.startsLocked) && (
          <p className="guide-hint"><Lock className="inline w-3 h-3 mr-1 -mt-0.5" />Empieza la partida bloqueada.</p>
        )}
      </section>

      <Markdown
        source={source}
        renderCards={names => <CardRow villainId={player.villainId} names={names} />}
        renderRotation={b => <RotationDemo villainId={player.villainId} block={b} />}
      />
    </>
  );
}

/** Miniaturas de las cartas que nombra la guía, buscadas por nombre en los mazos del villano. */
function CardRow({ villainId, names }: { villainId: VillainId; names: string[] }) {
  const defs = names
    .map(n => findCardDef(villainId, n))
    .filter((d): d is CardDef => !!d?.imageFile);
  if (defs.length === 0) return null;
  return (
    <div className="guide-cards">
      {defs.map(d => (
        <figure key={d.id} className="guide-card">
          <Image src={assetUrl(`cards/${d.villainId}/${d.imageFile}.webp`)} alt={d.name} className="w-full h-full object-cover" />
          <figcaption>{d.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Busca una carta del villano por nombre (sin distinguir mayúsculas). */
function findCardDef(villainId: VillainId, name: string): CardDef | undefined {
  const plugin = getPlugin(villainId);
  return [...plugin.villainCardDefs, ...plugin.fateCardDefs]
    .find(d => d.name.toLowerCase() === name.toLowerCase());
}

/** Proporción alto/ancho de los escaneos de carta (389×561). */
const CARD_RATIO = 561 / 389;

/**
 * Directiva `@giro:` — la carta en su posición normal, una flecha y la misma carta girada N grados
 * (Soldado Naipe → Postigo, Héroe menguado/agrandado…). El hueco de la carta girada se calcula con
 * su caja envolvente para que no se solape con la flecha ni con el texto.
 */
function RotationDemo({ villainId, block }: { villainId: VillainId; block: Extract<MdBlock, { kind: 'rotate' }> }) {
  const def = findCardDef(villainId, block.name);
  if (!def?.imageFile) return null;
  const src = assetUrl(`cards/${def.villainId}/${def.imageFile}.webp`);
  const rad = (block.degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  // Caja envolvente en múltiplos del ancho de carta (--guide-card-w, ver modals.css).
  const boxW = cos + CARD_RATIO * sin;
  const boxH = sin + CARD_RATIO * cos;

  return (
    <div className="guide-rotation">
      <figure className="guide-card">
        <Image src={src} alt={def.name} className="w-full h-full object-cover" />
        {block.before && <figcaption>{block.before}</figcaption>}
      </figure>
      <ArrowRight className="guide-rotation-arrow" aria-hidden="true" />
      <figure className="guide-rotation-turned">
        <div
          className="guide-rotation-box"
          style={{ width: `calc(var(--guide-card-w) * ${boxW})`, height: `calc(var(--guide-card-w) * ${boxH})` }}
        >
          <div className="guide-rotation-inner" style={{ transform: `translate(-50%, -50%) rotate(${block.degrees}deg)` }}>
            <Image src={src} alt={`${def.name} girada ${block.degrees}°`} className="w-full h-full object-cover" />
          </div>
        </div>
        {block.after && <figcaption>{block.after}</figcaption>}
      </figure>
    </div>
  );
}

// ── Pestaña Reglas ──────────────────────────────────────────────────────────

function RulesTabContent() {
  const source = use(loadText('rules', loadRules));
  const sections = parseMarkdown(source).flatMap(b => (b.kind === 'h2' ? [b] : []));

  return (
    <>
      <nav className="guide-toc" aria-label="Índice de reglas">
        {sections.map(s => (
          <button key={s.id} type="button" className="guide-toc-link"
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {s.text}
          </button>
        ))}
      </nav>
      <Markdown source={source} />
    </>
  );
}

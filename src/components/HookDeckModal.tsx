import { useState } from 'react';
import { X } from 'lucide-react';
import { CardType } from '../core/types';
import type { CardDef, CardInst, GameState } from '../core/types';
import { villainCardDefs, fateCardDefs } from '../core/villains/hook/cards';
import { getEffectiveStrength } from '../core/engine/stateHelpers';

interface Props { state: GameState; onClose: () => void }

const TYPE_LABEL: Partial<Record<CardType, string>> = {
  [CardType.ALLY]:      'Aliado',
  [CardType.ITEM]:      'Objeto',
  [CardType.EFFECT]:    'Efecto',
  [CardType.CONDITION]: 'Condición',
  [CardType.HERO]:      'Héroe',
};

const TYPE_COLOR: Partial<Record<CardType, string>> = {
  [CardType.ALLY]:      'bg-green-900/40 text-green-300 border-green-700/40',
  [CardType.ITEM]:      'bg-blue-900/40 text-blue-300 border-blue-700/40',
  [CardType.EFFECT]:    'bg-amber-900/40 text-amber-300 border-amber-700/40',
  [CardType.CONDITION]: 'bg-purple-900/40 text-purple-300 border-purple-700/40',
  [CardType.HERO]:      'bg-red-900/40 text-red-300 border-red-700/40',
};

const TYPE_ORDER: CardType[] = [
  CardType.ALLY,
  CardType.ITEM,
  CardType.EFFECT,
  CardType.CONDITION,
  CardType.HERO,
];

// ── Fila para cartas de la mano (CardInst) ────────────────────────────────────

const ALL_DEFS = [...villainCardDefs, ...fateCardDefs];

function HandCardRow({ card, state }: { card: CardInst; state: GameState }) {
  const typeColor    = TYPE_COLOR[card.cardType] ?? 'bg-surface-variant text-on-surface-variant border-outline-variant';
  const typeLabel    = TYPE_LABEL[card.cardType] ?? card.cardType;
  const effectiveStr = card.baseStrength != null ? getEffectiveStrength(state, card.instId) : null;
  const baseCostTotal = Math.max(0, card.baseCost + card.costModifier);
  const description  = ALL_DEFS.find(d => d.id === card.defId)?.description;
  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-outline-variant/15 last:border-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`font-stats text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${typeColor}`}>
          {typeLabel}
        </span>
        <span className="text-[12px] font-medium text-on-surface leading-tight">{card.name}</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {effectiveStr != null && (
            <span className="font-stats text-[10px] text-secondary-container font-bold">F{effectiveStr}</span>
          )}
          <span className="font-stats text-[10px] text-on-surface-variant/60">
            {baseCostTotal === 0 ? 'gratis' : `coste ${baseCostTotal}`}
          </span>
        </div>
      </div>
      {description && (
        <p className="text-[10px] text-on-surface-variant/70 leading-relaxed pl-1">{description}</p>
      )}
    </div>
  );
}

// ── Fila para definiciones del mazo (CardDef) ─────────────────────────────────

function dedupeByBaseId(defs: CardDef[]): Array<{ def: CardDef; count: number }> {
  const seen = new Map<string, { def: CardDef; count: number }>();
  for (const def of defs) {
    const baseId = def.id.replace(/_\d+$/, '');
    if (seen.has(baseId)) {
      seen.get(baseId)!.count++;
    } else {
      seen.set(baseId, { def, count: 1 });
    }
  }
  return Array.from(seen.values());
}

function groupByType(entries: Array<{ def: CardDef; count: number }>) {
  const groups = new Map<CardType, Array<{ def: CardDef; count: number }>>();
  for (const entry of entries) {
    const t = entry.def.type;
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t)!.push(entry);
  }
  return groups;
}

function DeckCardRow({ def, count }: { def: CardDef; count: number }) {
  const typeColor = TYPE_COLOR[def.type] ?? 'bg-surface-variant text-on-surface-variant border-outline-variant';
  const typeLabel = TYPE_LABEL[def.type] ?? def.type;
  const strength  = (def as { strength?: number }).strength;
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-outline-variant/15 last:border-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`font-stats text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${typeColor}`}>
          {typeLabel}
        </span>
        <span className="text-[12px] font-medium text-on-surface leading-tight">{def.name}</span>
        {count > 1 && (
          <span className="font-stats text-[9px] text-on-surface-variant/50">×{count}</span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {strength != null && (
            <span className="font-stats text-[10px] text-secondary-container">F{strength}</span>
          )}
          <span className="font-stats text-[10px] text-on-surface-variant/60">
            {def.cost === 0 ? 'gratis' : `coste ${def.cost}`}
          </span>
        </div>
      </div>
      {def.description && (
        <p className="text-[10px] text-on-surface-variant/70 leading-relaxed pl-1">{def.description}</p>
      )}
    </div>
  );
}

// ── Modal principal ───────────────────────────────────────────────────────────

type Tab = 'hand' | 'villain' | 'fate';

export function HookDeckModal({ state, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('hand');

  const hookPlayer = state.players.find(p => p.villainId === 'hook');
  const handCards  = (hookPlayer?.handInstIds ?? [])
    .map(id => state.allCards[id])
    .filter(Boolean) as CardInst[];

  const source      = tab === 'villain' ? villainCardDefs : fateCardDefs;
  const deduped     = dedupeByBaseId(source);
  const groups      = groupByType(deduped);
  const orderedKeys = TYPE_ORDER.filter(t => groups.has(t));

  const TABS: { id: Tab; label: string }[] = [
    { id: 'hand',    label: `Mano (${handCards.length})` },
    { id: 'villain', label: `Villano (${villainCardDefs.length})` },
    { id: 'fate',    label: `Destino (${fateCardDefs.length})` },
  ];

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface-container-highest/95 backdrop-blur-xl border border-outline-variant/30 rounded-2xl shadow-2xl flex flex-col w-full max-w-sm max-h-[80vh] pointer-events-auto overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0 border-b border-outline-variant/20">
          <h2 className="font-serif text-sm text-on-surface">Cartas de Garfio</h2>
          <button onClick={onClose} className="text-on-surface-variant/50 hover:text-on-surface transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-outline-variant/20">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 font-stats text-[9px] uppercase tracking-wider transition-colors ${
                tab === t.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-on-surface-variant/50 hover:text-on-surface-variant'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto history-scroll px-5 py-2">

          {/* Pestaña Mano */}
          {tab === 'hand' && (
            handCards.length === 0
              ? <p className="text-[11px] text-on-surface-variant/40 italic pt-3">Mano vacía</p>
              : handCards.map(card => (
                  <HandCardRow key={card.instId} card={card} state={state} />
                ))
          )}

          {/* Pestañas Villano / Destino */}
          {tab !== 'hand' && orderedKeys.map(type => {
            const entries = groups.get(type)!;
            return (
              <div key={type} className="mb-3">
                <p className="font-stats text-[9px] uppercase tracking-[0.2em] text-on-surface-variant/40 mb-1 pt-1">
                  {TYPE_LABEL[type]}s
                </p>
                {entries.map(({ def, count }) => (
                  <DeckCardRow key={def.id} def={def} count={count} />
                ))}
              </div>
            );
          })}

        </div>
      </div>
    </div>
  );
}

import type { GameState } from '../core/types';
import { getPlugin, getCardDef } from '../core/villains/registry';
import { getPlayer } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';

interface Props { state: GameState }

export function AuroraModal({ state }: Props) {
  const doResolveAuroraHero = useGameStore(s => s.doResolveAuroraHero);
  const { pendingAuroraHero } = state;
  if (!pendingAuroraHero) return null;

  const { heroInstId, targetPlayerId } = pendingAuroraHero;
  const hero       = state.allCards[heroInstId];
  const heroDef    = hero ? getCardDef(hero.defId) : null;
  const plugin     = getPlugin(state.players.find(p => p.id === targetPlayerId)!.villainId);
  const targetPlayer = getPlayer(state, targetPlayerId);

  const validLocs = plugin.locations.filter(l =>
    !targetPlayer.locationStates[l.id]?.isLocked,
  );

  if (!hero) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-100 backdrop-blur-sm">
      <div className="bg-surface-container-highest border border-primary/30 rounded-2xl shadow-2xl flex flex-col gap-4 p-5 w-full max-w-sm mx-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-16 rounded-lg border border-outline-variant/30 shrink-0 flex flex-col items-center justify-end p-1.5"
            style={{ background: 'linear-gradient(160deg, #3a2010 0%, #1f1008 100%)' }}
          >
            <span className="font-serif text-[9px] text-on-surface/70 text-center leading-tight">{hero.name}</span>
          </div>
          <div>
            <h2 className="font-serif text-base text-on-surface">Aurora revela</h2>
            <p className="font-stats text-[10px] uppercase tracking-widest text-primary/70 mt-0.5">
              {hero.name} · Héroe · Fuerza {hero.baseStrength}
            </p>
            {heroDef?.description && (
              <p className="text-[10px] text-on-surface/55 leading-snug mt-1">{heroDef.description}</p>
            )}
          </div>
        </div>

        {/* Location picker */}
        <div>
          <p className="font-stats text-[9px] uppercase tracking-wider text-on-surface-variant/60 mb-2">
            Elige dónde colocarlo:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {validLocs.map(loc => (
              <button
                key={loc.id}
                onClick={() => doResolveAuroraHero(loc.id)}
                className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container hover:border-primary hover:bg-primary/10 text-left transition-all group"
              >
                <div className="font-serif text-[11px] text-on-surface group-hover:text-primary leading-tight">
                  {loc.name}
                </div>
                <div className="font-stats text-[8px] uppercase tracking-widest text-on-surface-variant/50 mt-0.5">
                  {targetPlayer.locationStates[loc.id]?.heroCardInstIds.length ?? 0} héroes
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

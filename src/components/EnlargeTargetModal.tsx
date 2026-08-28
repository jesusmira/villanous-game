import type { GameState } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getPlayer } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';
import { ACTION_LABELS } from './shared/actionLabels';
import { ACTION_IMG } from './shared/actionImages';

interface Props { state: GameState }

export function EnlargeTargetModal({ state }: Props) {
  const doResolveEnlargeTarget = useGameStore(s => s.doResolveEnlargeTarget);
  const { pendingEnlargeTarget } = state;

  if (!pendingEnlargeTarget) return null;
  const { heroInstId, eligible } = pendingEnlargeTarget;
  const hero = state.allCards[heroInstId];
  // Las ubicaciones son del Reino de la Reina (dueña del Héroe), no de quien juega Agrandar.
  const plugin = getPlugin(getPlayer(state, hero.ownerId).villainId);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-surface-container-highest/95 border border-primary/30 rounded-2xl shadow-2xl flex flex-col gap-5 p-6 w-full max-w-xl pointer-events-auto">
        <div>
          <h2 className="font-serif text-base text-on-surface">Agrandar</h2>
          <p className="text-[11px] text-on-surface-variant/70 mt-1 leading-snug">
            Elige a qué ubicación adyacente y qué acción tapará también {hero?.name ?? 'el Héroe'}:
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          {eligible.map(({ locationId, slotIndex }) => {
            const locDef = plugin.locations.find(l => l.id === locationId);
            const action = locDef?.actions[slotIndex];
            const imgSrc = action ? ACTION_IMG[action.type] : undefined;
            return (
              <button
                key={`${locationId}_${slotIndex}`}
                onClick={() => doResolveEnlargeTarget(locationId, slotIndex)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl border border-outline-variant/40 bg-surface-container hover:border-primary hover:bg-primary/10 active:scale-95 text-left transition-all"
              >
                {imgSrc && (
                  <div className="w-9 h-9 shrink-0 rounded-full overflow-hidden border-2 border-primary/50">
                    <img src={imgSrc} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <span className="flex-1">
                  <span className="font-serif text-[12px] text-on-surface block">{locDef?.name ?? locationId}</span>
                  <span className="font-stats text-[9px] uppercase tracking-widest text-primary/70">
                    {action ? ACTION_LABELS[action.type] ?? action.type : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import type { GameState } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getPlayer } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';
import { ACTION_LABELS } from './shared/actionLabels';
import { ACTION_IMG } from './shared/actionImages';

interface Props { state: GameState }

export function ShrinkSlotModal({ state }: Props) {
  const doResolveShrinkSlotChoice = useGameStore(s => s.doResolveShrinkSlotChoice);
  const { pendingShrinkSlotChoice } = state;

  if (!pendingShrinkSlotChoice || pendingShrinkSlotChoice.queue.length === 0) return null;
  const { heroInstId, locationId, eligibleSlotIndices } = pendingShrinkSlotChoice.queue[0];
  const hero = state.allCards[heroInstId];
  const plugin = getPlugin(getPlayer(state, hero.ownerId).villainId);
  const locDef = plugin.locations.find(l => l.id === locationId);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-surface-container-highest/95 border border-primary/30 rounded-2xl shadow-2xl flex flex-col gap-5 p-6 w-full max-w-xl pointer-events-auto">
        <div>
          <h2 className="font-serif text-base text-on-surface">Menguar</h2>
          <p className="text-[11px] text-on-surface-variant/70 mt-1 leading-snug">
            Elige qué acción de {locDef?.name ?? locationId} sigue tapada por {hero?.name ?? 'el Héroe'} — la otra queda libre:
          </p>
        </div>

        <div className="flex justify-center gap-4">
          {eligibleSlotIndices.map(slotIndex => {
            const action = locDef?.actions[slotIndex];
            const imgSrc = action ? ACTION_IMG[action.type] : undefined;
            return (
              <button
                key={slotIndex}
                onClick={() => doResolveShrinkSlotChoice(slotIndex)}
                className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl border border-outline-variant/40 bg-surface-container hover:border-primary hover:bg-primary/10 active:scale-95 transition-all"
              >
                {imgSrc && (
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-primary/50 shadow-lg">
                    <img src={imgSrc} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <span className="font-stats text-[10px] uppercase tracking-widest text-on-surface">
                  {action ? ACTION_LABELS[action.type] ?? action.type : `Casilla ${slotIndex}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

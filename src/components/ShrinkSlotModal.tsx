import type { GameState } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getPlayer } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';
import { ACTION_LABELS } from './shared/actionLabels';
import { ACTION_IMG } from './shared/actionImages';
import { ModalStage } from './shared/ModalStage';

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
    <ModalStage
      passThrough
      tone="arcane"
      eyebrow="Menguar"
      title="¿Qué acción sigue tapada?"
      subtitle={`${hero?.name ?? 'El Héroe'} en ${locDef?.name ?? locationId}: la otra acción queda libre.`}
      widthClass="max-w-xl"
    >
      <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
        {eligibleSlotIndices.map(slotIndex => {
          const action = locDef?.actions[slotIndex];
          const imgSrc = action ? ACTION_IMG[action.type] : undefined;
          return (
            <button key={slotIndex} onClick={() => doResolveShrinkSlotChoice(slotIndex)} className="stage-action">
              {imgSrc && <img src={imgSrc} alt="" className="stage-action-token" />}
              <span className="stage-pick-caption">
                {action ? ACTION_LABELS[action.type] ?? action.type : `Casilla ${slotIndex}`}
              </span>
            </button>
          );
        })}
      </div>
    </ModalStage>
  );
}

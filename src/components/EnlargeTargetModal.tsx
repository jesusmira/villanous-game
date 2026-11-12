import type { GameState } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getPlayer } from '../core/engine/stateHelpers';
import { useGameStore } from '../state/gameStore';
import { ACTION_LABELS } from './shared/actionLabels';
import { ACTION_IMG } from './shared/actionImages';
import { ModalStage } from './shared/ModalStage';

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
    <ModalStage
      passThrough
      tone="arcane"
      eyebrow="Agrandar"
      title="¿Qué tapa también?"
      subtitle={`Elige la ubicación adyacente y la acción que tapará ${hero?.name ?? 'el Héroe'}.`}
      widthClass="max-w-xl"
    >
      <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
        {eligible.map(({ locationId, slotIndex }) => {
          const locDef = plugin.locations.find(l => l.id === locationId);
          const action = locDef?.actions[slotIndex];
          const imgSrc = action ? ACTION_IMG[action.type] : undefined;
          return (
            <button key={`${locationId}_${slotIndex}`} onClick={() => doResolveEnlargeTarget(locationId, slotIndex)} className="stage-action">
              {imgSrc && <img src={imgSrc} alt="" className="stage-action-token" />}
              <span className="font-serif text-sm font-semibold text-[#f3e2b3] text-center leading-tight">{locDef?.name ?? locationId}</span>
              <span className="stage-pick-caption">{action ? ACTION_LABELS[action.type] ?? action.type : ''}</span>
            </button>
          );
        })}
      </div>
    </ModalStage>
  );
}

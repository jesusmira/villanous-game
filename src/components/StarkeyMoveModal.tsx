import { useState } from 'react';
import type { CardInstId, GameState, LocationId, PlayerId } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getPlayer } from '../core/engine/stateHelpers';
import { CardComponent } from './CardComponent';
import { ModalStage } from './shared/ModalStage';

interface Props {
  state: GameState;
  playerId: PlayerId;
  cardName: string;
  onConfirm: (heroId: CardInstId, destLocId: LocationId) => void;
  onSkip: () => void;
  onCancel: () => void;
}

/** Sr. Starkey: "puedes mover un Héroe a una ubicación adyacente" — opcional, de ahí el botón
 *  Ignorar (juega la carta sin mover a nadie). Elegir héroe y destino es responsabilidad del
 *  jugador humano; la IA usa su propia heurística (ver pickStarkeyHeroTarget) sin pasar por aquí. */
export function StarkeyMoveModal({ state, playerId, cardName, onConfirm, onSkip, onCancel }: Props) {
  const player = getPlayer(state, playerId);
  const plugin = getPlugin(player.villainId);
  const [heroId, setHeroId] = useState<CardInstId | null>(null);

  const heroEntries = Object.entries(player.locationStates).flatMap(
    ([locId, ls]) => ls.heroCardInstIds.map(id => ({ id, locId })),
  );
  const heroLocId = heroId ? heroEntries.find(h => h.id === heroId)?.locId : undefined;
  const destOptions = heroLocId
    ? (plugin.locations.find(l => l.id === heroLocId)?.adjacentIds ?? [])
        .filter(adjId => !player.locationStates[adjId]?.isLocked)
    : [];

  return (
    <ModalStage
      zClass="z-110"
      onDismiss={onCancel}
      eyebrow={cardName}
      title="Mover un Héroe"
      subtitle="Puedes mover un Héroe a una ubicación adyacente."
      actions={<>
        <button onClick={onCancel} className="btn btn--secondary">Cancelar</button>
        <button onClick={onSkip} className="btn btn--secondary">Ignorar — no mover</button>
      </>}
    >
      {heroEntries.length === 0 ? (
        <p className="modal-stage-note">No hay Héroes en tu Reino.</p>
      ) : (
        <div className="modal-stage-section">
          <span className="modal-stage-label">Héroe a mover</span>
          <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
            {heroEntries.map(({ id }) => {
              const card = state.allCards[id];
              if (!card) return null;
              return (
                <button key={id} onClick={() => setHeroId(id)} className={`stage-pick ${heroId === id ? 'is-chosen' : ''}`}>
                  <CardComponent card={card} state={state} selected={heroId === id} sizeClassName="card-size-stage" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {heroId && (
        <div className="modal-stage-section">
          <span className="modal-stage-label">Ubicación destino (adyacente)</span>
          <div className="flex flex-wrap justify-center gap-2">
            {destOptions.map(locId => (
              <button key={locId} className="chip" onClick={() => onConfirm(heroId, locId)}>
                {plugin.locations.find(l => l.id === locId)?.name ?? locId}
              </button>
            ))}
            {destOptions.length === 0 && (
              <p className="modal-stage-note">Sin ubicaciones adyacentes desbloqueadas.</p>
            )}
          </div>
        </div>
      )}
    </ModalStage>
  );
}

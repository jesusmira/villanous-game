import { useState } from 'react';
import type { CardInstId, GameState, LocationId, PlayerId } from '../core/types';
import { getPlugin } from '../core/villains/registry';
import { getPlayer } from '../core/engine/stateHelpers';
import { CardComponent } from './CardComponent';

interface Props {
  state: GameState;
  playerId: PlayerId;
  cardName: string;
  onConfirm: (heroId: CardInstId, destLocId: LocationId) => void;
  onSkip: () => void;
  onCancel: () => void;
}

const SEL = 'px-2.5 py-1.5 rounded border border-outline-variant/40 text-xs font-stats text-on-surface-variant bg-surface-container hover:border-primary hover:text-primary transition-all';
const SKIP_BTN = 'px-3 py-1.5 rounded border border-outline-variant/50 text-on-surface-variant text-xs font-stats hover:border-outline hover:text-on-surface transition-all';

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
    <div className="fixed inset-0 flex items-center justify-center z-110 p-4" onClick={onCancel}>
      <div
        className="bg-surface-container-highest border border-tertiary/30 rounded-2xl shadow-2xl flex flex-col gap-4 p-5 w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-base text-on-surface">{cardName}</h2>
            <p className="text-[11px] text-on-surface-variant/70 mt-1 leading-snug">
              Puedes mover un Héroe a una ubicación adyacente.
            </p>
          </div>
          <button onClick={onCancel} className="text-on-surface-variant/40 hover:text-on-surface transition-colors text-lg leading-none">×</button>
        </div>

        {heroEntries.length === 0 ? (
          <p className="text-xs text-error/70">No hay Héroes en tu Reino.</p>
        ) : (
          <>
            <p className="text-xs text-on-surface-variant">Elige el Héroe a mover:</p>
            <div className="flex gap-3 flex-wrap justify-center">
              {heroEntries.map(({ id }) => {
                const card = state.allCards[id];
                if (!card) return null;
                return (
                  <div
                    key={id}
                    onClick={() => setHeroId(id)}
                    className={`cursor-pointer transition-all rounded-xl ${heroId === id ? 'ring-2 ring-primary opacity-100' : 'opacity-70 hover:opacity-100 hover:scale-105'}`}
                  >
                    <CardComponent card={card} state={state} />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {heroId && (
          <>
            <p className="text-xs text-on-surface-variant">Elige ubicación destino (adyacente):</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {destOptions.map(locId => (
                <button key={locId} className={SEL} onClick={() => onConfirm(heroId, locId)}>
                  {plugin.locations.find(l => l.id === locId)?.name ?? locId}
                </button>
              ))}
              {destOptions.length === 0 && (
                <p className="text-xs text-error/70">Sin ubicaciones adyacentes desbloqueadas.</p>
              )}
            </div>
          </>
        )}

        <div className="flex justify-end border-t border-outline-variant/20 pt-3">
          <button className={SKIP_BTN} onClick={onSkip}>Ignorar — no mover Héroe</button>
        </div>
      </div>
    </div>
  );
}

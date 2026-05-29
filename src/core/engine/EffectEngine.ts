import { EffectTrigger } from '../types';
import type { GameState, EffectContext, CardInstId } from '../types';
import { getEffectDef } from '../villains/registry';
import { addLog } from './stateHelpers';

export function runEffects(
  state: GameState,
  cardInstId: CardInstId,
  trigger: EffectTrigger,
  ctx: EffectContext,
): GameState {
  const card = state.allCards[cardInstId];
  if (!card) return state;

  let s = state;
  for (const effId of card.effectIds) {
    const eff = getEffectDef(effId);
    if (!eff || eff.trigger !== trigger) continue;
    try {
      s = eff.execute(s, ctx);
    } catch (e) {
      s = addLog(s, `Error en efecto ${effId}: ${(e as Error).message}`);
    }
  }
  return s;
}

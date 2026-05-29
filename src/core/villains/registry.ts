import type { VillainPlugin, VillainId, CardDef, EffectDef } from '../types';
import { maleficentPlugin } from './maleficent';
import { hookPlugin } from './hook';

const plugins: Record<VillainId, VillainPlugin> = {
  maleficent: maleficentPlugin,
  hook: hookPlugin,
};

const cardDefMap: Record<string, CardDef> = {};
const effectDefMap: Record<string, EffectDef> = {};

for (const plugin of Object.values(plugins)) {
  for (const def of [...plugin.villainCardDefs, ...plugin.fateCardDefs]) {
    cardDefMap[def.id] = def;
  }
  for (const eff of plugin.effects) {
    effectDefMap[eff.id] = eff;
  }
}

export function getPlugin(villainId: VillainId): VillainPlugin {
  return plugins[villainId];
}

export function getCardDef(defId: string): CardDef | undefined {
  return cardDefMap[defId];
}

export function getEffectDef(effectId: string): EffectDef | undefined {
  return effectDefMap[effectId];
}

export function getAllPlugins(): VillainPlugin[] {
  return Object.values(plugins);
}

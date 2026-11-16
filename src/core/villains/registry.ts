import type { VillainPlugin, VillainId, CardDef, EffectDef } from '../types';
import { maleficentPlugin } from './maleficent';
import { hookPlugin } from './hook';
import { jhonPlugin } from './jhon';
import { queenPlugin } from './queen';

const plugins: Record<VillainId, VillainPlugin> = {
  maleficent: maleficentPlugin,
  hook: hookPlugin,
  jhon: jhonPlugin,
  queen: queenPlugin,
};

const cardDefMap: Record<string, CardDef> = {};
const effectDefMap: Record<string, EffectDef> = {};
const locationNameMap: Record<string, string> = {};

for (const plugin of Object.values(plugins)) {
  for (const loc of plugin.locations) locationNameMap[loc.id] = loc.name;
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

/** Nombre legible de una ubicación (los ids son únicos entre villanos). Para el registro de partida. */
export function locName(locationId: string): string {
  return locationNameMap[locationId] ?? locationId;
}

export function getAllPlugins(): VillainPlugin[] {
  return Object.values(plugins);
}

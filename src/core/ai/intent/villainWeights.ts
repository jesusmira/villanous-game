// ─── Perfil de pesos dinámicos por villano ─────────────────────────────────────────
// Ver VillainWeightProfile/WeightCategory (types.ts) para el porqué. Este módulo solo tiene el
// valor por defecto (no-op) y el mapeo categoría→peso — la multiplicación en sí vive donde ya se
// calculaban las puntuaciones (planner.ts chooseIntention, actionScoring.ts scoreAction), no aquí.
import type { VillainWeightProfile, WeightCategory } from './types';

export const DEFAULT_VILLAIN_WEIGHTS: VillainWeightProfile = {
  objectiveWeight: 1,
  heroRemovalWeight: 1,
  fateWeight: 1,
  powerWeight: 1,
  comboWeight: 1,
  pressureWeight: 1,
  locationValueWeight: 1,
};

/** Peso del perfil correspondiente a una categoría — switch exhaustivo (TS avisa si se añade una
 *  categoría nueva a WeightCategory sin darle un caso aquí) en vez de concatenar strings
 *  (`categoria + 'Weight'`), para que un typo no produzca silenciosamente un peso de `undefined`. */
export function weightForCategory(profile: VillainWeightProfile, category: WeightCategory): number {
  switch (category) {
    case 'objective': return profile.objectiveWeight;
    case 'heroRemoval': return profile.heroRemovalWeight;
    case 'fate': return profile.fateWeight;
    case 'power': return profile.powerWeight;
    case 'combo': return profile.comboWeight;
    case 'pressure': return profile.pressureWeight;
    case 'locationValue': return profile.locationValueWeight;
  }
}

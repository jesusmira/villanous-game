import { assetUrl } from '../../lib/assets';

/** ActionType → URL del icono en el Storage de Supabase. Fuente única para todos los componentes. */
export const ACTION_IMG: Record<string, string> = {
  GAIN_POWER:     assetUrl('actions/gain_power.webp'),
  VANQUISH:       assetUrl('actions/vanquish.webp'),
  MOVE_HERO:      assetUrl('actions/move_hero.webp'),
  MOVE_ITEM_ALLY: assetUrl('actions/move_item_ally.webp'),
  ACTIVATE_CARD:  assetUrl('actions/activate_card.webp'),
  DISCARD:        assetUrl('actions/discard.webp'),
  PLAY_CARD:      assetUrl('actions/play_card.webp'),
  FATE:           assetUrl('actions/fate.webp'),
};

import { ActionType } from '../../core/types';

export const ACTION_LABELS: Partial<Record<ActionType, string>> = {
  GAIN_POWER:     'Ganar Poder',
  PLAY_CARD:      'Jugar Carta',
  FATE:           'Destino',
  VANQUISH:       'Vencer',
  MOVE_ITEM_ALLY: 'Mover Objeto/Aliado',
  MOVE_HERO:      'Mover Héroe',
  ACTIVATE_CARD:  'Activar',
  DISCARD:        'Descartar',
};

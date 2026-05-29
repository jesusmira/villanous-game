// Effect and card-def IDs referenced by engine code outside the plugin that defines them.
// Using these constants makes cross-plugin references type-safe and refactor-proof.

export const EffectId = {
  // Maleficent
  RAVEN_ACTIVATE:       'mal_raven_activate',
  ESPADA_ON_PLAY:       'mal_espada_on_play',
  // Hook
  BURLA_ATTACH:         'hook_burla_attach',
  PELOTON_ADJ_VANQUISH: 'hook_peloton_adj_vanquish',
  A_LA_ORDEN:           'hook_a_la_orden',
  STARKEY_MOVE_HERO:    'hook_starkey_move_hero',
  // Condition cards
  MALICIA_COND:         'mal_malicia_cond',
  TIRANIA_COND:         'mal_tirania_cond',
  OBSESION_COND:        'hook_obsesion_cond',
  PERSPICAZ_COND:       'hook_perspicaz_cond',
} as const;

export const CardDefId = {
  HOOK_PETER_PAN: 'hook_fate_peter_pan',
  MAL_FLORA:      'mal_f_flora',
} as const;

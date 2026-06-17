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
  // Príncipe Juan
  JHON_ROBIN_POWER_MOD: 'jhon_robin_power_mod',
  JHON_ALAN_CHECK:      'jhon_alan_check',
  JHON_LELO_CHECK:      'jhon_lelo_check',
  JHON_TIRO_CHECK:      'jhon_tiro_check',
  JHON_CORONA_COST:     'jhon_corona_cost',
  JHON_ORDEN_POWER:     'jhon_orden_power',
  JHON_ARQUERO_ADJ:     'jhon_arquero_adj',
  JHON_COBARDIA_COND:   'jhon_cobardia_cond',
  JHON_IMPUESTOS:       'jhon_impuestos',
  JHON_ENCARCELAMIENTO: 'jhon_encarcelamiento',
  JHON_LITTLE_JOHN:     'jhon_little_john',
  JHON_ARCO_ATTACH:     'jhon_arco_attach',
  JHON_FLECHA_ATTACH:   'jhon_flecha_attach',
  JHON_SHERIF:          'jhon_sherif',
  JHON_HISS:            'jhon_hiss',
  JHON_ROBAR_RICOS:     'jhon_robar_ricos',
} as const;

export const CardDefId = {
  HOOK_PETER_PAN:      'hook_fate_peter_pan',
  HOOK_TIC_TAC:        'hook_f_tictac',
  HOOK_WENDY:          'hook_f_wendy',
  MAL_FLORA:           'mal_f_flora',
  // Príncipe Juan
  JHON_ROBIN_HOOD:     'jhon_f_robin',
  JHON_LADY_MARIAN:    'jhon_f_marian',
  JHON_TOBY:           'jhon_f_toby',
  JHON_ALAN_A_DALE:    'jhon_f_alan',
  JHON_LELO:           'jhon_v_lelo',
  JHON_TIRO_LISTO:     'jhon_v_tiro',
  JHON_ORDEN:          'jhon_v_orden',
  JHON_ARQUEROS:       'jhon_v_arqueros',
} as const;

// Prefijos de defId para "familias" de cartas (varias copias _1/_2/_3, o variantes sin un
// único id exacto). startsWith() es seguro aquí: ningún otro id del mismo villano comparte
// el prefijo. Usar estas constantes en vez de literales sueltos evita que un rename de id
// rompa una comparación en silencio.
export const CardDefPrefix = {
  MAL_SUENO:        'mal_v_sueno',
  MAL_FUEGO:        'mal_v_fuego',
  MAL_SELVA:        'mal_v_selva',
  HOOK_MAPA:        'hook_v_mapa',
  HOOK_CANON:       'hook_v_canon',
  HOOK_RIVAL:       'hook_v_rival',
  HOOK_SUSTO:       'hook_v_susto',
  HOOK_PERSPICAZ:   'hook_v_perspicaz',
  HOOK_OBSESION:    'hook_v_obsesion',
} as const;

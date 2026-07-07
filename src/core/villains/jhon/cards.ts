import { ActionType, CardDeck, CardType } from '../../types';
import type { LocationDef } from '../../types';
import { EffectId, CardDefId } from '../effectIds';

// ── Location IDs ─────────────────────────────────────────────────────────────
export const JhonLocationId = {
  BOSQUE:     'jhon_bosque',
  IGLESIA:    'jhon_iglesia',
  NOTTINGHAM: 'jhon_nottingham',
  PRISON:     'jhon_prison',
} as const;

// ── Locations ──────────────────────────────────────────────────────────────────
export const locations: LocationDef[] = [
  {
    id: JhonLocationId.BOSQUE,
    name: 'Bosque de Sherwood',
    actions: [
      { type: ActionType.GAIN_POWER, value: 1 },
      { type: ActionType.DISCARD },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.FATE },
    ],
    adjacentIds: [JhonLocationId.IGLESIA],
  },
  {
    id: JhonLocationId.IGLESIA,
    name: 'Iglesia del Fraile Tuck',
    actions: [
      { type: ActionType.GAIN_POWER, value: 2 },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.MOVE_ITEM_ALLY },
    ],
    adjacentIds: [JhonLocationId.BOSQUE, JhonLocationId.NOTTINGHAM],
  },
  {
    id: JhonLocationId.NOTTINGHAM,
    name: 'Nottingham',
    actions: [
      { type: ActionType.FATE },
      { type: ActionType.GAIN_POWER, value: 1 },
      { type: ActionType.VANQUISH },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: [JhonLocationId.IGLESIA, JhonLocationId.PRISON],
  },
  {
    id: JhonLocationId.PRISON,
    name: 'La Prisión',
    actions: [
      { type: ActionType.GAIN_POWER, value: 3 },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.DISCARD },
    ],
    adjacentIds: [JhonLocationId.NOTTINGHAM],
    heroesNeverCoverSlots: true,
    actionsInBottomRow: true,
  },
];

// ── Fate (hero) cards ───────────────────────────────────────────────────────────
export const fateCardDefs = [
  { id: 'jhon_f_rey',      name: 'Rey Ricardo',   type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, strength: 5, effectIds: [] as string[], description: 'El Príncipe Juan no puede jugar Efectos.',                                              imageFile: 'heroe/rey' },
  { id: CardDefId.JHON_ALAN_A_DALE, name: 'Alan-a-Dale', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, strength: 2, effectIds: [] as string[], description: 'Todos los demás Héroes en el Reino reciben +1 Fuerza.',                            imageFile: 'heroe/alan' },
  { id: 'jhon_f_kluck',    name: 'Lady Kluck',    type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, strength: 6, effectIds: [] as string[], description: 'Lady Kluck no puede ser jugada ni movida a La Prisión.',                              imageFile: 'heroe/kluck' },
  { id: 'jhon_f_littlejohn', name: 'Little John', type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, strength: 5, effectIds: [EffectId.JHON_LITTLE_JOHN] as string[], description: 'Coge hasta 4 Monedas al Príncipe Juan y ponlas sobre Little John.',                   imageFile: 'heroe/littleJohn' },
  { id: CardDefId.JHON_LADY_MARIAN, name: 'Lady Marian', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, strength: 3, effectIds: [] as string[], description: 'Cuando sea derrotada, encuentra a Robin Hood y juégalo en la misma ubicación.',  imageFile: 'heroe/marian' },
  { id: CardDefId.JHON_ROBIN_HOOD,  name: 'Robin Hood',  type: CardType.HERO, deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, strength: 5, effectIds: [EffectId.JHON_ROBIN_POWER_MOD] as string[], description: 'Las ganancias de Poder del Príncipe Juan se reducen en -1.', imageFile: 'heroe/robin' },
  { id: 'jhon_f_skippy',   name: 'Skippy',        type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, strength: 2, effectIds: [] as string[], description: 'Los Arqueros Lobo no pueden usarse para derrotar a Skippy.',                          imageFile: 'heroe/skippy' },
  { id: CardDefId.JHON_TOBY, name: 'Toby',        type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, strength: 2, effectIds: [] as string[], description: 'Cuando sea derrotado, vuelve al mazo de Destino.',                                   imageFile: 'heroe/toby' },
  { id: 'jhon_f_fraile',   name: 'Fraile Tuck',   type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, strength: 3, effectIds: [] as string[], description: 'Puede descartar todas las Órdenes de Búsqueda en su ubicación.',                     imageFile: 'heroe/fraile' },
  // Objects (Buen Disfraz x3)
  { id: 'jhon_f_disfraz_1', name: 'Buen Disfraz', type: CardType.ITEM,   deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, effectIds: [] as string[], description: 'Únelo a un Héroe. No puede ser derrotado. PJ puede pagar 2 Monedas para descartarlo.',             imageFile: 'heroe/disfraz' },
  { id: 'jhon_f_disfraz_2', name: 'Buen Disfraz', type: CardType.ITEM,   deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, effectIds: [] as string[], description: 'Únelo a un Héroe. No puede ser derrotado. PJ puede pagar 2 Monedas para descartarlo.',             imageFile: 'heroe/disfraz' },
  { id: 'jhon_f_disfraz_3', name: 'Buen Disfraz', type: CardType.ITEM,   deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, effectIds: [] as string[], description: 'Únelo a un Héroe. No puede ser derrotado. PJ puede pagar 2 Monedas para descartarlo.',             imageFile: 'heroe/disfraz' },
  // Effects (Robar a los Ricos x3)
  { id: 'jhon_f_robar_1',  name: 'Robar a los Ricos', type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, effectIds: [EffectId.JHON_ROBAR_RICOS] as string[], description: 'Coge hasta 4 Monedas al Príncipe Juan y ponlas sobre un Héroe.',                              imageFile: 'heroe/robar' },
  { id: 'jhon_f_robar_2',  name: 'Robar a los Ricos', type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, effectIds: [EffectId.JHON_ROBAR_RICOS] as string[], description: 'Coge hasta 4 Monedas al Príncipe Juan y ponlas sobre un Héroe.',                              imageFile: 'heroe/robar' },
  { id: 'jhon_f_robar_3',  name: 'Robar a los Ricos', type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'jhon' as const, cost: 0, effectIds: [EffectId.JHON_ROBAR_RICOS] as string[], description: 'Coge hasta 4 Monedas al Príncipe Juan y ponlas sobre un Héroe.',                              imageFile: 'heroe/robar' },
];

// Add Alan-a-Dale aura receiver to all heroes except Alan himself
for (const card of fateCardDefs) {
  if (card.type === CardType.HERO && card.id !== CardDefId.JHON_ALAN_A_DALE) {
    card.effectIds = [...card.effectIds, EffectId.JHON_ALAN_CHECK];
  }
}

// ── Villain cards ───────────────────────────────────────────────────────────────
export const villainCardDefs = [
  // Conditions
  { id: 'jhon_v_avaricia_1', name: 'Avaricia',   type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 0, effectIds: [] as string[], description: 'Si otro jugador tiene 6+ Monedas, recibe 3 Monedas de Poder.',                             imageFile: 'villano/avaricia' },
  { id: 'jhon_v_avaricia_2', name: 'Avaricia',   type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 0, effectIds: [] as string[], description: 'Si otro jugador tiene 6+ Monedas, recibe 3 Monedas de Poder.',                             imageFile: 'villano/avaricia' },
  // Effects
  { id: 'jhon_v_trampa_1',   name: 'Trampa',     type: CardType.EFFECT,    deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 1, effectIds: [] as string[], description: 'Mueve un Aliado a cualquier ubicación. Lleva a cabo una acción Vencer.',                  imageFile: 'villano/trampa' },
  { id: 'jhon_v_trampa_2',   name: 'Trampa',     type: CardType.EFFECT,    deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 1, effectIds: [] as string[], description: 'Mueve un Aliado a cualquier ubicación. Lleva a cabo una acción Vencer.',                  imageFile: 'villano/trampa' },
  { id: 'jhon_v_intimidacion', name: 'Intimidación', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 2, effectIds: [EffectId.JHON_INTIMIDACION] as string[], description: 'Lleva a cabo una acción Vencer sin descartar los Aliados utilizados.',                   imageFile: 'villano/intimidacion' },
  // Objects
  { id: 'jhon_v_corona',     name: 'Corona del Rey Ricardo', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 1, effectIds: [EffectId.JHON_CORONA_COST] as string[], description: 'Los costes se reducen en -1 si el Príncipe Juan está aquí.', imageFile: 'villano/corona' },
  { id: 'jhon_v_flecha',     name: 'Flecha Dorada', type: CardType.ITEM,   deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 0, effectIds: [EffectId.JHON_FLECHA_ATTACH] as string[], description: 'Recibe 2 Monedas cuando el Aliado derrote a un Héroe.',                                    imageFile: 'villano/flecha' },
  // Allies
  { id: CardDefId.JHON_LELO, name: 'Lelo',       type: CardType.ALLY,      deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 2, strength: 2, effectIds: [EffectId.JHON_LELO_CHECK] as string[], description: 'Todos los Aliados en su ubicación reciben +1 Fuerza.', imageFile: 'villano/lelo' },
  { id: 'jhon_v_sherif',     name: 'Sheriff de Nottingham', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 3, strength: 3, effectIds: [EffectId.JHON_SHERIF] as string[], description: 'Antes de mover al Príncipe Juan, muévelo a una ubicación adyacente. Si hay Héroes allí, recibe 1 Moneda de Poder.', imageFile: 'villano/sherif' },
  { id: 'jhon_v_hiss',       name: 'Sir Hiss',   type: CardType.ALLY,      deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 2, strength: 2, effectIds: [EffectId.JHON_HISS] as string[], description: 'Realiza una acción tapada si el Príncipe Juan está aquí.',                      imageFile: 'villano/hiss' },
  { id: CardDefId.JHON_TIRO_LISTO, name: 'Tiro Listo', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 2, strength: 4, effectIds: [EffectId.JHON_TIRO_CHECK] as string[], description: 'Todos los demás Aliados en su ubicación reciben -1 Fuerza.', imageFile: 'villano/tiro' },
  // Orden de Búsqueda x3
  { id: CardDefId.JHON_ORDEN + '_1', name: 'Orden de Búsqueda', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 1, effectIds: [EffectId.JHON_ORDEN_POWER] as string[], description: 'Recibe 2 Monedas cada vez que se juegue un Héroe aquí.', imageFile: 'villano/orden' },
  { id: CardDefId.JHON_ORDEN + '_2', name: 'Orden de Búsqueda', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 1, effectIds: [EffectId.JHON_ORDEN_POWER] as string[], description: 'Recibe 2 Monedas cada vez que se juegue un Héroe aquí.', imageFile: 'villano/orden' },
  { id: CardDefId.JHON_ORDEN + '_3', name: 'Orden de Búsqueda', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 1, effectIds: [EffectId.JHON_ORDEN_POWER] as string[], description: 'Recibe 2 Monedas cada vez que se juegue un Héroe aquí.', imageFile: 'villano/orden' },
  // Apreciados Impuestos x3
  { id: 'jhon_v_impuestos_1', name: 'Apreciados Impuestos', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 0, effectIds: [EffectId.JHON_IMPUESTOS] as string[], description: 'Recibe 1 Moneda de Poder por cada Héroe en tu Reino.',         imageFile: 'villano/impuestos' },
  { id: 'jhon_v_impuestos_2', name: 'Apreciados Impuestos', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 0, effectIds: [EffectId.JHON_IMPUESTOS] as string[], description: 'Recibe 1 Moneda de Poder por cada Héroe en tu Reino.',         imageFile: 'villano/impuestos' },
  { id: 'jhon_v_impuestos_3', name: 'Apreciados Impuestos', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 0, effectIds: [EffectId.JHON_IMPUESTOS] as string[], description: 'Recibe 1 Moneda de Poder por cada Héroe en tu Reino.',         imageFile: 'villano/impuestos' },
  // Encarcelamiento x3
  { id: 'jhon_v_encarcel_1', name: 'Encarcelamiento', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 2, effectIds: [EffectId.JHON_ENCARCELAMIENTO] as string[], description: 'Mueve un Héroe a La Prisión.',                                  imageFile: 'villano/encarcelamiento' },
  { id: 'jhon_v_encarcel_2', name: 'Encarcelamiento', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 2, effectIds: [EffectId.JHON_ENCARCELAMIENTO] as string[], description: 'Mueve un Héroe a La Prisión.',                                  imageFile: 'villano/encarcelamiento' },
  { id: 'jhon_v_encarcel_3', name: 'Encarcelamiento', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 2, effectIds: [EffectId.JHON_ENCARCELAMIENTO] as string[], description: 'Mueve un Héroe a La Prisión.',                                  imageFile: 'villano/encarcelamiento' },
  // Guardias Rinoceronte x3
  { id: 'jhon_v_rino_1',    name: 'Guardias Rinoceronte', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 3, strength: 4, effectIds: [] as string[], description: 'Sin Habilidad adicional.',                                                    imageFile: 'villano/rinoceronte' },
  { id: 'jhon_v_rino_2',    name: 'Guardias Rinoceronte', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 3, strength: 4, effectIds: [] as string[], description: 'Sin Habilidad adicional.',                                                    imageFile: 'villano/rinoceronte' },
  { id: 'jhon_v_rino_3',    name: 'Guardias Rinoceronte', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 3, strength: 4, effectIds: [] as string[], description: 'Sin Habilidad adicional.',                                                    imageFile: 'villano/rinoceronte' },
  // Arqueros Lobo x3
  { id: CardDefId.JHON_ARQUEROS + '_1', name: 'Arqueros Lobo', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 2, strength: 2, effectIds: [EffectId.JHON_ARQUERO_ADJ] as string[], description: 'Puede derrotar a un Héroe en su ubicación o en una adyacente.', imageFile: 'villano/arqueros' },
  { id: CardDefId.JHON_ARQUEROS + '_2', name: 'Arqueros Lobo', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 2, strength: 2, effectIds: [EffectId.JHON_ARQUERO_ADJ] as string[], description: 'Puede derrotar a un Héroe en su ubicación o en una adyacente.', imageFile: 'villano/arqueros' },
  { id: CardDefId.JHON_ARQUEROS + '_3', name: 'Arqueros Lobo', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 2, strength: 2, effectIds: [EffectId.JHON_ARQUERO_ADJ] as string[], description: 'Puede derrotar a un Héroe en su ubicación o en una adyacente.', imageFile: 'villano/arqueros' },
  // Arco con Flechas x2
  { id: 'jhon_v_arco_1',    name: 'Arco con Flechas', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 1, effectIds: [EffectId.JHON_ARCO_ATTACH] as string[], description: 'El Aliado recibe +1 Fuerza. Si debe descartarse, descarta este Objeto en su lugar.',           imageFile: 'villano/arco' },
  { id: 'jhon_v_arco_2',    name: 'Arco con Flechas', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 1, effectIds: [EffectId.JHON_ARCO_ATTACH] as string[], description: 'El Aliado recibe +1 Fuerza. Si debe descartarse, descarta este Objeto en su lugar.',           imageFile: 'villano/arco' },
  // Cobardía x2
  { id: 'jhon_v_cobardia_1', name: 'Cobardía',  type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 0, effectIds: [EffectId.JHON_COBARDIA_COND] as string[], description: 'Si otro jugador tiene 3+ Aliados, juega un Aliado de tu mano gratis.', imageFile: 'villano/cobardia' },
  { id: 'jhon_v_cobardia_2', name: 'Cobardía',  type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'jhon' as const, cost: 0, effectIds: [EffectId.JHON_COBARDIA_COND] as string[], description: 'Si otro jugador tiene 3+ Aliados, juega un Aliado de tu mano gratis.', imageFile: 'villano/cobardia' },
];

// Receiver effects: add LELO_CHECK and TIRO_CHECK to all allies except Lelo and Tiro themselves
for (const card of villainCardDefs) {
  if (
    card.type === CardType.ALLY &&
    card.id !== CardDefId.JHON_LELO &&
    card.id !== CardDefId.JHON_TIRO_LISTO
  ) {
    card.effectIds = [...card.effectIds, EffectId.JHON_LELO_CHECK, EffectId.JHON_TIRO_CHECK];
  }
}

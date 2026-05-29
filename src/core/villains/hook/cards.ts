import { CardType, CardDeck, ActionType } from '../../types';
import type { CardDef, LocationDef } from '../../types';

function copies(count: number, base: Omit<CardDef, 'id'> & { id: string }): CardDef[] {
  return Array.from({ length: count }, (_, i) => ({ ...base, id: `${base.id}_${i + 1}` }));
}

export const HookLocationId = {
  JOLLY_ROGER: 'jollyroger',
  SKULL_ROCK:  'skullrock',
  LAGOON:      'lagoon',
  HANGMAN:     'hangman',
} as const;

export const HookObjectiveStep = {
  HANGMAN_UNLOCKED:   'HANGMAN_UNLOCKED',
  PETER_PAN_DEFEATED: 'PETER_PAN_DEFEATED_AT_JOLLYROGER',
} as const;

// ─── LOCATIONS ───────────────────────────────────────────────────────────────

export const locations: LocationDef[] = [
  {
    id: 'jollyroger',
    name: 'Jolly Roger',
    actions: [
      { type: ActionType.GAIN_POWER, value: 1 },
      { type: ActionType.DISCARD },
      { type: ActionType.VANQUISH },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: ['skullrock'],
  },
  {
    id: 'skullrock',
    name: 'Roca Calavera',
    actions: [
      { type: ActionType.GAIN_POWER, value: 1 },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.FATE },
      { type: ActionType.DISCARD },
    ],
    adjacentIds: ['jollyroger', 'lagoon'],
  },
  {
    id: 'lagoon',
    name: 'Laguna de las Sirenas',
    actions: [
      { type: ActionType.PLAY_CARD },
      { type: ActionType.MOVE_ITEM_ALLY },
      { type: ActionType.GAIN_POWER, value: 3 },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: ['skullrock', 'hangman'],
  },
  {
    id: 'hangman',
    name: 'Árbol del Verdugo',
    actions: [
      { type: ActionType.FATE },
      { type: ActionType.GAIN_POWER, value: 2 },
      { type: ActionType.MOVE_HERO },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: ['lagoon'],
    startsLocked: true,
  },
];

// ─── VILLAIN CARDS ────────────────────────────────────────────────────────────

export const villainCardDefs: CardDef[] = [
  { id: 'hook_v_mapa',      name: 'Mapa de Nunca Jamás',  type: CardType.ITEM,      deck: CardDeck.VILLAIN, villainId: 'hook', cost: 4,              effectIds: ['hook_unlock_hangman'],   description: 'Desbloquea el Árbol del Ahorcado al jugarlo. Puedes descartarlo en lugar de pagar el Precio de un Objeto.' },
  { id: 'hook_v_mecanismo', name: 'Mecanismo Ingenioso',  type: CardType.ITEM,      deck: CardDeck.VILLAIN, villainId: 'hook', cost: 2,              effectIds: [], grantsActionSlot: { type: ActionType.MOVE_HERO },              description: 'Esta ubicación ofrece una acción extra: Mover un Héroe.' },
  { id: 'hook_v_smee',      name: 'Sr. Smee',             type: CardType.ALLY,      deck: CardDeck.VILLAIN, villainId: 'hook', cost: 2, strength: 2, effectIds: ['hook_smee_jollyroger'], description: 'Obtiene +2 Fuerza si está en el Jolly Roger.' },
  { id: 'hook_v_starkey',   name: 'Sr. Starkey',          type: CardType.ALLY,      deck: CardDeck.VILLAIN, villainId: 'hook', cost: 2, strength: 2, effectIds: ['hook_starkey_move_hero'], description: 'Al jugarlo, puedes mover un Héroe a una ubicación adyacente.' },
  ...copies(2, { id: 'hook_v_orden',     name: '¡A la orden, señor!', type: CardType.EFFECT,    deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1,              effectIds: ['hook_a_la_orden'],                                               description: 'Mueve un Aliado a una ubicación adyacente. Ese Aliado recibe +2 Fuerza hasta el final del turno.' }),
  ...copies(2, { id: 'hook_v_canon',     name: 'Cañón',               type: CardType.ITEM,      deck: CardDeck.VILLAIN, villainId: 'hook', cost: 2,              effectIds: [], grantsActionSlot: { type: ActionType.VANQUISH },              description: 'Esta ubicación ofrece una acción extra: Vencer.' }),
  ...copies(2, { id: 'hook_v_estuche',   name: 'El Estuche de Garfio',type: CardType.ITEM,      deck: CardDeck.VILLAIN, villainId: 'hook', cost: 2,              effectIds: [], grantsActionSlot: { type: ActionType.GAIN_POWER, value: 1 }, description: 'Esta ubicación ofrece una acción extra: Ganar Poder (+1).' }),
  ...copies(2, { id: 'hook_v_maton',     name: 'Matón Pirata',        type: CardType.ALLY,      deck: CardDeck.VILLAIN, villainId: 'hook', cost: 3, strength: 4, effectIds: [],                                                               description: 'Sin Habilidad adicional.' }),
  ...copies(2, { id: 'hook_v_obsesion',  name: 'Obsesión',            type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0,              effectIds: ['hook_obsesion_cond'],                                            description: 'Cuando otro jugador derrote un Héroe de Fuerza 4+, revela tu mazo de Destino hasta un Héroe. Juégalo o descártalo.' }),
  ...copies(2, { id: 'hook_v_perspicaz', name: 'Perspicaz',           type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0,              effectIds: ['hook_perspicaz_cond'],                                           description: 'Si otro jugador tiene un Aliado de Fuerza 4+, puedes jugar un Aliado de tu mano de forma gratuita.' }),
  ...copies(2, { id: 'hook_v_sable',     name: 'Sable',               type: CardType.ITEM,      deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1,              effectIds: ['hook_sable_attach'],                                             description: 'Únelo a un Aliado. Ese Aliado obtiene +2 Fuerza.' }),
  ...copies(3, { id: 'hook_v_susto',     name: 'Démosles un susto',   type: CardType.EFFECT,    deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1,              effectIds: ['hook_demosles_susto'],                                           description: 'Mira las dos cartas de arriba de tu mazo de Destino. Descártalas o ponlas en el orden que quieras.' }),
  ...copies(3, { id: 'hook_v_espadachin',name: 'Espadachín',          type: CardType.ALLY,      deck: CardDeck.VILLAIN, villainId: 'hook', cost: 1, strength: 2, effectIds: [],                                                               description: 'Sin Habilidad adicional.' }),
  ...copies(3, { id: 'hook_v_peloton',   name: 'Pelotón de Abordaje', type: CardType.ALLY,      deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0, strength: 2, effectIds: ['hook_peloton_adj_vanquish'],                                     description: 'Al Vencer puede actuar desde su ubicación o una adyacente.' }),
  ...copies(3, { id: 'hook_v_rival',     name: 'Rival Digno',         type: CardType.EFFECT,    deck: CardDeck.VILLAIN, villainId: 'hook', cost: 0,              effectIds: ['hook_rival_digno'],                                              description: 'Recibes 2 Monedas de Poder. Revela tu mazo de Destino hasta un Héroe. Juégalo y descarta el resto.' }),
];

// ─── FATE CARDS ───────────────────────────────────────────────────────────────

export const fateCardDefs: CardDef[] = [
  { id: 'hook_f_campanilla',    name: 'Campanilla',    type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 2, effectIds: ['hook_campanilla_discard_ally', 'hook_wendy_aura'], description: 'Al jugarla, puedes descartar un Aliado de su ubicación.' },
  { id: 'hook_f_juan',          name: 'Juan',          type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 2, effectIds: ['hook_juan_item_bonus', 'hook_wendy_aura'],         description: '+1 Fuerza si tiene algún Objeto unido.' },
  { id: 'hook_f_miguel',        name: 'Miguel',        type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 1, effectIds: ['hook_miguel_hero_bonus', 'hook_wendy_aura'],       description: '+1 Fuerza por cada ubicación del Reino de Garfio que tenga un Héroe.' },
  { id: 'hook_fate_peter_pan',  name: 'Peter Pan',     type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 8, effectIds: ['hook_wendy_aura', 'hook_peter_pan_reveal'],        description: 'Al ser revelado se juega inmediatamente en el Árbol del Ahorcado (incluso si está bloqueado).' },
  { id: 'hook_f_tictac',        name: 'Tic Tac',       type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 5, effectIds: ['hook_wendy_aura', 'hook_tictac_hand_discard'],     description: 'Si Garfio se mueve a la ubicación de Tic Tac, debe descartar su mano inmediatamente.' },
  { id: 'hook_f_wendy',         name: 'Wendy',         type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 3, effectIds: [],                                                  description: 'Todos los demás Héroes del Reino reciben +1 Fuerza.' },
  ...copies(2, { id: 'hook_f_burla',   name: 'Burla',        type: CardType.ITEM,   deck: CardDeck.FATE, villainId: 'hook', cost: 0, effectIds: ['hook_burla_attach'],   description: 'Únela a un Héroe. Garfio debe derrotar primero a los Héroes con Burla.' }),
  ...copies(2, { id: 'hook_f_jaqueca', name: 'Gran Jaqueca', type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'hook', cost: 0, effectIds: ['hook_gran_jaqueca'],   description: 'Descarta un Objeto del Reino del Capitán Garfio.' }),
  ...copies(2, { id: 'hook_f_ninos',   name: 'Niños Perdidos', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'hook', cost: 0, strength: 4, effectIds: ['hook_wendy_aura', 'hook_require_two_allies'], description: 'Para derrotarlos se necesitan al menos dos Aliados.' }),
  ...copies(3, { id: 'hook_f_polvo',   name: 'Polvo de Hada', type: CardType.ITEM,  deck: CardDeck.FATE, villainId: 'hook', cost: 0, effectIds: ['hook_polvo_attach'],   description: 'Únelo a un Héroe. Ese Héroe recibe +2 Fuerza.' }),
];

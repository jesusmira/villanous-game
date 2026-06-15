import { CardType, CardDeck, ActionType } from '../../types';
import type { CardDef, LocationDef } from '../../types';

function copies(count: number, base: Omit<CardDef, 'id'> & { id: string }): CardDef[] {
  return Array.from({ length: count }, (_, i) => ({ ...base, id: `${base.id}_${i + 1}` }));
}

// ─── LOCATIONS ───────────────────────────────────────────────────────────────

export const locations: LocationDef[] = [
  {
    id: 'montanas',
    name: 'Montañas Prohibidas',
    actions: [
      { type: ActionType.MOVE_ITEM_ALLY },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.GAIN_POWER, value: 1 },
      { type: ActionType.FATE },
    ],
    adjacentIds: ['cabana'],
  },
  {
    id: 'cabana',
    name: 'La Cabaña de Briar Rose',
    actions: [
      { type: ActionType.GAIN_POWER, value: 2 },
      { type: ActionType.MOVE_ITEM_ALLY },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.DISCARD },
    ],
    adjacentIds: ['montanas', 'bosque'],
  },
  {
    id: 'bosque',
    name: 'El Bosque',
    actions: [
      { type: ActionType.DISCARD },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.GAIN_POWER, value: 3 },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: ['cabana', 'castillo'],
  },
  {
    id: 'castillo',
    name: 'El Castillo del Rey Stefan',
    actions: [
      { type: ActionType.GAIN_POWER, value: 1 },
      { type: ActionType.FATE },
      { type: ActionType.VANQUISH },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: ['bosque'],
  },
];

// ─── VILLAIN CARDS ────────────────────────────────────────────────────────────

export const villainCardDefs: CardDef[] = [
  { id: 'mal_v_cuervo',  name: 'El Cuervo', type: CardType.ALLY,  deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, strength: 1, activationCost: 0, effectIds: ['mal_raven_activate'],  description: 'ACTIVAR: muévelo a cualquier ubicación y lleva a cabo una de las acciones disponibles. No puede realizar acciones Destino.', imageFile: 'cuervo' },
  { id: 'mal_v_rueca',   name: 'Rueca',     type: CardType.ITEM,  deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 1, effectIds: ['mal_rueca_power'],                                      description: 'Si un Héroe es jugado en esta ubicación, recibes una cantidad de Poder equivalente a la Fuerza de ese Héroe.', imageFile: 'rueca' },
  { id: 'mal_v_cetro',   name: 'Cetro',     type: CardType.ITEM,  deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 1, effectIds: ['mal_cetro_cost_reduce'],                                description: 'Si Maléfica está en esta ubicación, el coste de jugar un Efecto o una Maldición se reduce en 1.', imageFile: 'cetro' },
  ...copies(2, { id: 'mal_v_sueno',       name: 'Sueño Sin Sueños',          type: CardType.CURSE,     deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, effectIds: ['mal_sueno_hero_debuff', 'mal_sueno_on_ally_placed'], description: 'Los Héroes de esta ubicación reciben -2 Fuerza. Se descarta cuando se juegue un Aliado aquí.', imageFile: 'sueno' }),
  ...copies(2, { id: 'mal_v_malicia',     name: 'Malicia',                   type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 0, effectIds: ['mal_malicia_cond'],  description: 'Cuando otro jugador derrote un Héroe de Fuerza 4+, puedes derrotar un Héroe de Fuerza 4 o inferior.', imageFile: 'malicia' }),
  ...copies(2, { id: 'mal_v_tirania',     name: 'Tiranía',                   type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 0, effectIds: ['mal_tirania_cond'],  description: 'Cuando otro jugador tenga 3+ Aliados en su Reino, puedes robar 3 cartas y descartar 3.', imageFile: 'tirania' }),
  ...copies(3, { id: 'mal_v_desaparecer', name: 'Desaparecer',               type: CardType.EFFECT,    deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 0, effectIds: ['mal_desaparecer'],   description: 'En tu próximo turno Maléfica no necesita moverse a una nueva ubicación.', imageFile: 'desaparecer' }),
  ...copies(3, { id: 'mal_v_risueno',     name: 'Esbirro Risueño',           type: CardType.ALLY,      deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 1, strength: 1, effectIds: ['mal_risueno_bonus'], description: '+1 Fuerza por cada Héroe en su ubicación.', imageFile: 'risueno' }),
  ...copies(3, { id: 'mal_v_salvaje',     name: 'Esbirro Salvaje',           type: CardType.ALLY,      deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, strength: 4, effectIds: [],       description: 'Sin Habilidad adicional.', imageFile: 'salvaje' }),
  ...copies(3, { id: 'mal_v_siniestro',   name: 'Esbirro Siniestro',         type: CardType.ALLY,      deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 2, strength: 3, effectIds: ['mal_sinister_minion_bonus'], description: '+1 Fuerza si hay alguna Maldición en su ubicación.', imageFile: 'siniestro' }),
  ...copies(3, { id: 'mal_v_dragon',      name: 'Forma de Dragón',           type: CardType.EFFECT,    deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, effectIds: ['mal_forma_dragon'],  description: 'Derrota a un Héroe de Fuerza 3 o inferior. Si eres blanco de Destino antes de tu próximo turno, ganas 3 Monedas de Poder.', imageFile: 'dragon' }),
  ...copies(3, { id: 'mal_v_fuego',       name: 'Fuego Verde',               type: CardType.CURSE,     deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 3, effectIds: ['mal_fuego_verde_effect'], description: 'No se pueden jugar Héroes en esta ubicación. Se descarta si Maléfica se mueve aquí.', imageFile: 'fuego' }),
  ...copies(3, { id: 'mal_v_selva',       name: 'Selva de Mortales Espinos', type: CardType.CURSE,     deck: CardDeck.VILLAIN, villainId: 'maleficent', cost: 2, effectIds: ['mal_selva_curse'],   description: 'Los Héroes deben tener Fuerza 4+ para jugarse aquí. Se descarta cuando se juegue un Héroe en esta ubicación.', imageFile: 'selva' }),
];

// ─── FATE CARDS ───────────────────────────────────────────────────────────────

export const fateCardDefs: CardDef[] = [
  { id: 'mal_f_aurora',    name: 'Aurora',           type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 4, effectIds: ['mal_aurora_reveal', 'mal_sueno_victim'],        description: 'Al jugarla, revela la carta superior del mazo de Destino de Maléfica. Si es un Héroe, juégalo. Si no, devuélvelo arriba.', imageFile: 'aurora' },
  { id: 'mal_f_fauna',     name: 'Fauna',            type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 2, effectIds: ['mal_fauna_discard_curse', 'mal_sueno_victim'],  description: 'Al jugarla, puedes descartar Sueño Sin Sueños de la ubicación donde la juegues.', imageFile: 'fauna' },
  { id: 'mal_f_flora',     name: 'Flora',            type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 3, effectIds: ['mal_flora_reveal_hand', 'mal_sueno_victim'],    description: 'Maléfica debe revelar su mano. Hasta que Flora sea derrotada, Maléfica juega con las cartas visibles.', imageFile: 'flora' },
  { id: 'mal_f_primavera', name: 'Primavera',        type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 4, effectIds: ['mal_sueno_victim', 'mal_primavera_block_curse'], description: 'No se pueden jugar Maldiciones en la ubicación de Primavera.', imageFile: 'primavera' },
  { id: 'mal_f_felipe',    name: 'Príncipe Felipe',  type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 5, effectIds: ['mal_felipe_discard_allies', 'mal_sueno_victim'], description: 'Al jugarlo, puedes descartar todos los Aliados de su ubicación.', imageFile: 'felipe' },
  { id: 'mal_f_estefano',  name: 'Rey Estéfano',    type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 4, effectIds: ['mal_estefano_move_pawn', 'mal_sueno_victim'],   description: 'Al jugarlo, puedes mover a Maléfica a cualquier ubicación.', imageFile: 'estefano' },
  { id: 'mal_f_huberto',   name: 'Rey Huberto',      type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 3, effectIds: ['mal_huberto_move_allies', 'mal_sueno_victim'],  description: 'Al jugarlo, puedes mover un Aliado de cada ubicación adyacente a la ubicación del Rey Huberto.', imageFile: 'huberto' },
  ...copies(3, { id: 'mal_f_espada',   name: 'Espada de la Verdad', type: CardType.ITEM,   deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, effectIds: ['mal_espada_on_play', 'mal_espada_cost'], description: 'Únela a un Héroe sin Objeto. Ese Héroe recibe +2 Fuerza. El coste de Maldiciones en esa ubicación aumenta en +2.', imageFile: 'espada' }),
  ...copies(3, { id: 'mal_f_guardias', name: 'Guardias',            type: CardType.HERO,   deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, strength: 3, effectIds: ['mal_sueno_victim', 'mal_require_two_allies'], description: 'Para derrotarlos se deben utilizar al menos dos Aliados.', imageFile: 'guardias' }),
  ...copies(2, { id: 'mal_f_suenos',   name: 'Una vez en sueños',  type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'maleficent', cost: 0, effectIds: ['mal_una_vez_suenos'], description: 'Descarta una Maldición de una ubicación del Reino de Maléfica que tenga un Héroe.', imageFile: 'suenos' }),
];

import { ActionType, CardDeck, CardType } from '../../types';
import type { CardDef, LocationDef } from '../../types';
import { EffectId } from '../effectIds';

function copies(count: number, base: Omit<CardDef, 'id'> & { id: string }): CardDef[] {
  return Array.from({ length: count }, (_, i) => ({ ...base, id: `${base.id}_${i + 1}` }));
}

// ─── LOCATIONS ───────────────────────────────────────────────────────────────

export const QueenLocationId = {
  PATIO:        'queen_patio',
  LABERINTO:    'queen_laberinto',
  TULGEY:       'queen_tulgey',
  CONEJOBLANCO: 'queen_conejoblanco',
} as const;

export const locations: LocationDef[] = [
  {
    id: QueenLocationId.PATIO,
    name: 'Patio',
    actions: [
      { type: ActionType.DISCARD },
      { type: ActionType.MOVE_ITEM_ALLY },
      { type: ActionType.GAIN_POWER, value: 2 },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: [QueenLocationId.LABERINTO],
  },
  {
    id: QueenLocationId.LABERINTO,
    name: 'Laberinto de Setos',
    actions: [
      { type: ActionType.PLAY_CARD },
      { type: ActionType.ACTIVATE_CARD },
      { type: ActionType.GAIN_POWER, value: 3 },
      { type: ActionType.PLAY_CARD },
    ],
    adjacentIds: [QueenLocationId.PATIO, QueenLocationId.TULGEY],
  },
  {
    id: QueenLocationId.TULGEY,
    name: 'Bosque de Tulgey',
    actions: [
      { type: ActionType.FATE },
      { type: ActionType.PLAY_CARD },
      { type: ActionType.DISCARD },
      { type: ActionType.VANQUISH },
    ],
    adjacentIds: [QueenLocationId.LABERINTO, QueenLocationId.CONEJOBLANCO],
  },
  {
    id: QueenLocationId.CONEJOBLANCO,
    name: 'Casa del Conejo Blanco',
    actions: [
      { type: ActionType.PLAY_CARD },
      { type: ActionType.GAIN_POWER, value: 1 },
      { type: ActionType.ACTIVATE_CARD },
      { type: ActionType.FATE },
    ],
    adjacentIds: [QueenLocationId.TULGEY],
  },
];

// ─── VILLAIN CARDS ────────────────────────────────────────────────────────────

const SOLDADO_BASE = {
  type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'queen' as const,
  cost: 2, strength: 3, activationCost: 1, effectIds: ['queen_soldado_toggle'],
  description: 'ACTIVAR (1 Moneda): convierte este Soldado Naipe en un Postigo, o de Postigo en Soldado Naipe.',
};

export const villainCardDefs: CardDef[] = [
  ...copies(2, { ...SOLDADO_BASE, id: 'queen_v_treboles', name: 'Soldados Naipe: Tréboles', imageFile: 'treboles' }),
  ...copies(2, { ...SOLDADO_BASE, id: 'queen_v_rombos',   name: 'Soldados Naipe: Diamantes', imageFile: 'rombos' }),
  ...copies(2, { ...SOLDADO_BASE, id: 'queen_v_corazones', name: 'Soldados Naipe: Corazones', imageFile: 'corazones' }),
  ...copies(2, { ...SOLDADO_BASE, id: 'queen_v_picas',    name: 'Soldados Naipe: Picas', imageFile: 'picas' }),

  { id: 'queen_v_rey', name: 'El Rey', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'queen', cost: 2, strength: 2, effectIds: ['queen_el_rey_discount'], description: 'El Precio para jugar los Soldados Naipe se reduce en -1 Moneda de Poder.', imageFile: 'rey' },
  { id: 'queen_v_deedum', name: 'Tweedle Dee y Tweedle Dum', type: CardType.ALLY, deck: CardDeck.VILLAIN, villainId: 'queen', cost: 3, strength: 2, effectIds: ['queen_tweedle_survives'], description: 'No se descartan cuando son utilizados para derrotar a un Héroe.', imageFile: 'deedum' },

  ...copies(3, { id: 'queen_v_cabeza', name: '¡Que le corten la cabeza!', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'queen' as const, cost: 3, effectIds: [EffectId.QUEEN_CABEZA], description: 'Derrota a un Héroe de Fuerza 4 o inferior.', imageFile: 'cabeza' }),
  ...copies(3, { id: 'queen_v_tiro', name: 'Efectúa el tiro', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'queen' as const, cost: 4, effectIds: ['queen_efectua_el_tiro'], description: 'Si hay un Postigo en cada ubicación de tu Reino, revela las 5 cartas de arriba de tu mazo. Si el Precio total es inferior a la Fuerza total de tus Postigos, ganas la partida. Si no, descarta las 5 cartas.', imageFile: 'tiro' }),
  ...copies(2, { id: 'queen_v_orden', name: 'Por orden de la Reina', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'queen' as const, cost: 2, effectIds: ['queen_por_orden'], description: 'Convierte hasta dos Soldados Naipe en Postigos.', imageFile: 'orden' }),
  ...copies(2, { id: 'queen_v_menguar', name: 'Menguar', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'queen' as const, cost: 2, effectIds: [EffectId.QUEEN_MENGUAR], description: 'Mengua a un Héroe o devuelve a su tamaño normal a un Héroe agrandado.', imageFile: 'menguar' }),
  ...copies(2, { id: 'queen_v_no_cumple', name: 'Feliz No Cumpleaños', type: CardType.EFFECT, deck: CardDeck.VILLAIN, villainId: 'queen' as const, cost: 0, effectIds: ['queen_no_cumple'], description: 'Recibe 1 Moneda de Poder por cada Aliado que haya en tu Reino.', imageFile: 'noCumple' }),

  ...copies(2, { id: 'queen_v_furia', name: 'Furia', type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'queen' as const, cost: 0, effectIds: ['queen_furia_cond'], description: 'Si otro jugador derrota a un Héroe de Fuerza 4 o superior, mengua hasta dos Héroes.', imageFile: 'furia' }),
  ...copies(2, { id: 'queen_v_juicio', name: 'Juicio', type: CardType.CONDITION, deck: CardDeck.VILLAIN, villainId: 'queen' as const, cost: 0, effectIds: ['queen_juicio_cond'], description: 'Si otro jugador tiene tres o más Aliados en su Reino, recibe 3 Monedas de Poder.', imageFile: 'juicio' }),

  ...copies(3, { id: 'queen_v_lanza', name: 'Lanza', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'queen' as const, cost: 1, effectIds: ['queen_lanza_attach'], description: 'Únela a un Aliado. Ese Aliado recibe +1 Fuerza.', imageFile: 'lanza' }),
  { id: 'queen_v_reloj', name: 'Reloj', type: CardType.ITEM, deck: CardDeck.VILLAIN, villainId: 'queen', cost: 1, activationCost: 0, effectIds: ['queen_reloj_activate'], description: 'ACTIVAR: gana 1 Moneda de Poder por cada Postigo que tengas en tu Reino.', imageFile: 'reloj' },
];

// ─── FATE (DESTINO) CARDS ─────────────────────────────────────────────────────

export const fateCardDefs: CardDef[] = [
  ...copies(2, { id: 'queen_f_agrandar', name: 'Agrandar', type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'queen' as const, cost: 0, effectIds: ['queen_agrandar'], description: 'Agranda a un Héroe o devuelve a su estado normal a un Héroe menguado.', imageFile: 'agrandar' }),
  ...copies(2, { id: 'queen_f_tarde', name: '¡Llego tarde! ¡Llego tarde!', type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'queen' as const, cost: 0, effectIds: ['queen_llego_tarde'], description: 'Escoge y juega un Héroe de Fuerza 3 o inferior de la pila de descartes de Destino de la Reina de Corazones.', imageFile: 'tarde' }),
  ...copies(2, { id: 'queen_f_mome', name: 'Mome Raths', type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'queen' as const, cost: 0, effectIds: ['queen_mome_raths'], description: 'Mueve un Aliado a cualquier ubicación.', imageFile: 'mome' }),

  { id: 'queen_f_alicia', name: 'Alicia', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'queen', cost: 0, strength: 5, effectIds: ['queen_alicia_block'], description: 'La Reina de Corazones no puede mover Aliados ni Objetos.', imageFile: 'alicia' },
  { id: 'queen_f_conejo', name: 'Conejo Blanco', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'queen', cost: 0, strength: 2, effectIds: ['queen_conejo_activation_cost'], description: 'El Precio para activar los Soldados Naipe y los Postigos aumenta en +1 Moneda de Poder.', imageFile: 'conejo' },
  { id: 'queen_f_dodo', name: 'Dodo', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'queen', cost: 0, strength: 3, effectIds: ['queen_dodo_block_wicket'], description: 'Los Soldados Naipe que estén en su misma ubicación no pueden ser convertidos en Postigos.', imageFile: 'dodo' },
  { id: 'queen_f_liron', name: 'El Lirón', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'queen', cost: 0, strength: 1, effectIds: [EffectId.QUEEN_LIRON_IMMUNE], description: 'El Lirón no puede ser Menguado.', imageFile: 'liron' },
  { id: 'queen_f_rison', name: 'Gato Risón', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'queen', cost: 0, strength: 5, effectIds: ['queen_rison_on_play', 'queen_rison_on_discard'], description: 'Al jugarlo, puedes convertir hasta dos Postigos en Soldados Naipe. Cuando sea derrotado, la Reina puede convertir hasta dos Soldados Naipe en Postigos.', imageFile: 'rison' },
  { id: 'queen_f_liebre', name: 'Liebre de Marzo', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'queen', cost: 0, strength: 3, effectIds: ['queen_liebre_bonus'], description: 'Recibe +2 Fuerza si el Sombrerero Loco está en el Reino de la Reina de Corazones.', imageFile: 'liebre' },
  { id: 'queen_f_madriguera', name: 'Madriguera del Conejo', type: CardType.EFFECT, deck: CardDeck.FATE, villainId: 'queen', cost: 0, effectIds: ['queen_madriguera'], description: 'Si Alicia está en el Reino, descarta un Aliado de su ubicación. Si no, encuentra a Alicia y juégala.', imageFile: 'madriguera' },
  { id: 'queen_f_oruga', name: 'Oruga', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'queen', cost: 0, strength: 2, effectIds: ['queen_oruga_debuff'], description: 'Todos los Aliados que estén en su ubicación reciben -1 Fuerza.', imageFile: 'oruga' },
  { id: 'queen_f_sombrerero', name: 'Sombrerero Loco', type: CardType.HERO, deck: CardDeck.FATE, villainId: 'queen', cost: 0, strength: 3, effectIds: ['queen_sombrerero_bonus'], description: 'Recibe +2 Fuerza si la Liebre de Marzo está en el Reino de la Reina de Corazones.', imageFile: 'sombrerero' },
];

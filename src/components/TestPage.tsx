import { useState } from 'react';
import type { GameState, CardInst } from '../core/types';
import { CardType, TurnPhase } from '../core/types';
import { CardComponent } from './CardComponent';
import { AuroraModal } from './AuroraModal';
import { FateModal } from './FateModal';
import { HistoryModal } from './HistoryModal';
import { ConditionModal } from './ConditionModal';
import { CuervoModal } from './CuervoModal';
import { DemoslesModal } from './DemoslesModal';
import { FloraRevealModal } from './FloraRevealModal';
import { VictoryModal } from './VictoryModal';

// Crear cartas de prueba
const testCards: Record<string, CardInst> = {
  // Flora - cartas en mano
  card_1: {
    instId: 'card_1',
    defId: 'test_ally_1',
    name: 'Esbirro Risueño',
    cardType: CardType.ALLY,
    villainId: 'maleficent',
    ownerId: 'p2',
    baseCost: 2,
    baseStrength: 2,
    costModifier: 0,
    strengthModifier: 0,
    effectIds: [],
    attachedItemInstIds: [],
    locationId: undefined,
    attachedToInstId: undefined,
    deck: 'VILLAIN',
    bonusThisTurn: 0,
    imageFile: 'cuervo',
  },
  card_2: {
    instId: 'card_2',
    defId: 'test_item_1',
    name: 'Espada de la Verdad',
    cardType: CardType.ITEM,
    villainId: 'maleficent',
    ownerId: 'p2',
    baseCost: 3,
    costModifier: 0,
    strengthModifier: 0,
    effectIds: [],
    attachedItemInstIds: [],
    locationId: undefined,
    attachedToInstId: undefined,
    deck: 'VILLAIN',
    bonusThisTurn: 0,
    imageFile: 'espada',
  },
  card_3: {
    instId: 'card_3',
    defId: 'test_curse_1',
    name: 'Fuego Verde',
    cardType: CardType.CURSE,
    villainId: 'maleficent',
    ownerId: 'p2',
    baseCost: 1,
    costModifier: 0,
    strengthModifier: 0,
    effectIds: [],
    attachedItemInstIds: [],
    locationId: undefined,
    attachedToInstId: undefined,
    deck: 'VILLAIN',
    bonusThisTurn: 0,
    imageFile: 'fuego',
  },
  card_4: {
    instId: 'card_4',
    defId: 'test_effect_1',
    name: 'Hechizo Oscuro',
    cardType: CardType.EFFECT,
    villainId: 'maleficent',
    ownerId: 'p2',
    baseCost: 4,
    costModifier: 0,
    strengthModifier: 0,
    effectIds: [],
    attachedItemInstIds: [],
    locationId: undefined,
    attachedToInstId: undefined,
    deck: 'VILLAIN',
    bonusThisTurn: 0,
  },
  card_5: {
    instId: 'card_5',
    defId: 'test_ally_2',
    name: 'Demonio Menor',
    cardType: CardType.ALLY,
    villainId: 'maleficent',
    ownerId: 'p2',
    baseCost: 1,
    baseStrength: 1,
    costModifier: 0,
    strengthModifier: 0,
    effectIds: [],
    attachedItemInstIds: [],
    locationId: undefined,
    attachedToInstId: undefined,
    deck: 'VILLAIN',
    bonusThisTurn: 0,
    imageFile: 'dragon',
  },
  // Aurora - héroe
  hero_1: {
    instId: 'hero_1',
    defId: 'test_hero_1',
    name: 'Peter Pan',
    cardType: CardType.HERO,
    villainId: 'hook',
    ownerId: 'p2',
    baseCost: 0,
    baseStrength: 5,
    costModifier: 0,
    strengthModifier: 0,
    effectIds: [],
    attachedItemInstIds: [],
    locationId: undefined,
    attachedToInstId: undefined,
    deck: 'FATE',
    bonusThisTurn: 0,
  },
  // Condition - cartas con condiciones
  cond_1: {
    instId: 'cond_1',
    defId: 'test_cond_1',
    name: 'Malicia (Condition)',
    cardType: CardType.CONDITION,
    villainId: 'maleficent',
    ownerId: 'p1',
    baseCost: 0,
    costModifier: 0,
    strengthModifier: 0,
    effectIds: ['mal_malicia_cond'],
    attachedItemInstIds: [],
    locationId: undefined,
    attachedToInstId: undefined,
    deck: 'VILLAIN',
    bonusThisTurn: 0,
  },
};

// Estado mock simple para pruebas
const MOCK_STATE: GameState = {
  allCards: testCards,
  players: [
    {
      id: 'p1',
      name: 'Jugador 1',
      villainId: 'maleficent',
      power: 10,
      handInstIds: [],
      villainDeckInstIds: [],
      villainDiscardInstIds: [],
      fateDeckInstIds: [],
      fateDiscardInstIds: [],
      pawnLocationId: 'throne_room',
      locationStates: {
        montanas: { id: 'montanas', villainCardInstIds: [], heroCardInstIds: [], isLocked: false },
        cabana: { id: 'cabana', villainCardInstIds: [], heroCardInstIds: [], isLocked: false },
        pasado: { id: 'pasado', villainCardInstIds: [], heroCardInstIds: [], isLocked: false },
        pantano: { id: 'pantano', villainCardInstIds: [], heroCardInstIds: [], isLocked: false },
      },
      isAI: false,
      completedObjectiveSteps: [],
    },
    {
      id: 'p2',
      name: 'Jugador 2',
      villainId: 'hook',
      power: 8,
      handInstIds: ['card_1', 'card_2', 'card_3', 'card_4', 'card_5'],
      villainDeckInstIds: [],
      villainDiscardInstIds: [],
      fateDeckInstIds: [],
      fateDiscardInstIds: [],
      pawnLocationId: 'mermaid_lagoon',
      locationStates: {
        mermaid_lagoon: { id: 'mermaid_lagoon', villainCardInstIds: [], heroCardInstIds: [], isLocked: false },
        skull_rock: { id: 'skull_rock', villainCardInstIds: [], heroCardInstIds: [], isLocked: false },
        forest_neverland: { id: 'forest_neverland', villainCardInstIds: [], heroCardInstIds: [], isLocked: false },
        jolly_roger: { id: 'jolly_roger', villainCardInstIds: [], heroCardInstIds: [], isLocked: false },
      },
      isAI: false,
      completedObjectiveSteps: [],
    },
  ],
  currentPlayerIndex: 0,
  turnPhase: TurnPhase.MOVE,
  winner: null,
  usedActionSlotIndices: [],
  log: ['Juego iniciado'],
  roundNumber: 1,
  pendingAuroraHero: undefined,
  pendingCondition: undefined,
  pendingCuervo: undefined,
  pendingDemosles: undefined,
};

interface ModalButton {
  key: string;
  label: string;
  setup: (state: GameState) => GameState;
}

export function TestPage() {
  const [testState, setTestState] = useState<GameState>(MOCK_STATE);
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);

  const setupAuroraHero = (state: GameState): GameState => ({
    ...state,
    pendingAuroraHero: {
      heroInstId: 'hero_1',
      targetPlayerId: 'p1',
      actingPlayerId: 'p1',
      isHero: true,
    },
  });

  const setupAuroraNoHero = (state: GameState): GameState => ({
    ...state,
    pendingAuroraHero: {
      heroInstId: 'card_3',
      targetPlayerId: 'p1',
      actingPlayerId: 'p1',
      isHero: false,
    },
  });

  const setupFate = (state: GameState): GameState => ({
    ...state,
    pendingFate: {
      actingPlayerId: 'p1',
      targetPlayerIndex: 1,
      revealedInstIds: [],
      autoPlayedInstIds: [],
    },
  });

  const setupHistory = (state: GameState): GameState => ({
    ...state,
    log: [
      'Juego iniciado',
      'Maléfica juega Esbirro Risueño',
      'Esbirro Risueño es vencido',
      'Hook juega Sr. Smee',
      'Peter Pan es ubicado en Jolly Roger',
      'Maléfica activa Maldición: Fuego Verde',
      'Hook vence a Peter Pan',
    ],
  });

  const setupCondition = (state: GameState): GameState => ({
    ...state,
    pendingCondition: {
      reactingPlayerId: 'p1',
      triggerType: 'VANQUISH_4PLUS',
      eligibleCardInstIds: ['cond_1'],
    },
  });

  const setupCuervo = (state: GameState): GameState => {
    // Cuervo necesita un aliado en el tablero - usar ubicación de Maleficent
    const newState = { ...state };
    if (newState.players[0].locationStates['montanas']) {
      newState.players[0].locationStates['montanas'] = {
        id: 'montanas',
        villainCardInstIds: ['card_1'],
        heroCardInstIds: [],
        isLocked: false,
      };
    }
    return {
      ...newState,
      pendingCuervo: { playerId: 'p1', locationId: 'montanas' },
    };
  };

  const setupDemosles = (state: GameState): GameState => ({
    ...state,
    pendingDemosles: { playerId: 'p1', topCardIds: ['card_1', 'card_2'] },
  });

  const setupFlora = (state: GameState): GameState => state;

  const setupVictory = (state: GameState): GameState => ({
    ...state,
    winner: 'p1',
    roundNumber: 8,
  });

  const modals: ModalButton[] = [
    { key: 'aurora_hero', label: '✨ Aurora (Con Héroe)', setup: setupAuroraHero },
    { key: 'aurora_no_hero', label: '✨ Aurora (Sin Héroe)', setup: setupAuroraNoHero },
    { key: 'fate', label: '🎴 Destino', setup: setupFate },
    { key: 'history', label: '📜 Historial', setup: setupHistory },
    { key: 'condition', label: '📋 Condición', setup: setupCondition },
    { key: 'cuervo', label: '🐦 Cuervo', setup: setupCuervo },
    { key: 'demosles', label: '🌿 Demosles', setup: setupDemosles },
    { key: 'flora', label: '🌸 Flora', setup: setupFlora },
    { key: 'victory', label: '🏆 Victoria', setup: setupVictory },
  ];

  const toggleModal = (modalBtn: ModalButton) => {
    if (selectedDetail === modalBtn.key) {
      setTestState(MOCK_STATE);
      setSelectedDetail(null);
    } else {
      const newState = modalBtn.setup(MOCK_STATE);
      setTestState(newState);
      setSelectedDetail(modalBtn.key);
    }
  };

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-serif font-bold mb-2">🧪 Pruebas de Modales</h1>
          <p className="text-on-surface-variant">Visualiza todos los modales disponibles del juego</p>
        </div>

        {/* Botones organizados en grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
          {modals.map(modal => (
            <button
              key={modal.key}
              onClick={() => toggleModal(modal)}
              className={`px-4 py-3 rounded-lg font-stats text-sm uppercase tracking-wider transition-all ${
                selectedDetail === modal.key
                  ? 'bg-primary text-on-primary ring-2 ring-primary/50 scale-105'
                  : 'bg-surface-container border border-outline-variant/40 text-on-surface hover:bg-surface-container-high hover:border-primary/50'
              }`}
            >
              {modal.label}
            </button>
          ))}
        </div>

        {/* Estado actual */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg p-4 mb-8">
          <p className="text-xs font-stats text-on-surface-variant/60 uppercase tracking-widest">
            {selectedDetail ? `Modal activo: ${selectedDetail}` : 'Sin modal activo'}
          </p>
        </div>

        {/* Modales renderizados */}
        <div className="relative">
          <AuroraModal state={testState} />
          <FateModal state={testState} />
          {selectedDetail === 'history' && <HistoryModal state={testState} onClose={() => setSelectedDetail(null)} />}
          <ConditionModal state={testState} />
          <CuervoModal state={testState} />
          <DemoslesModal state={testState} />
          {selectedDetail === 'flora' && <FloraRevealModal state={testState} victim={testState.players[1]} onClose={() => setSelectedDetail(null)} />}
          {selectedDetail === 'victory' && <VictoryModal state={testState} onPlayAgain={() => setSelectedDetail(null)} />}
        </div>

        {/* Card preview section */}
        <div className="mt-12 pt-8 border-t border-outline-variant/20">
          <h2 className="text-2xl font-serif font-bold mb-6">Esqueleto de Cartas</h2>
          <p className="text-on-surface-variant text-sm mb-4">Cartas sin imagen (solo gradiente de fondo)</p>
          <div className="flex gap-6 flex-wrap">
            {[CardType.ALLY, CardType.ITEM, CardType.EFFECT, CardType.CURSE, CardType.HERO].map(cardType => (
              <div key={cardType} className="flex flex-col gap-2">
                <span className="text-xs font-stats uppercase tracking-wider text-on-surface-variant">{cardType}</span>
                <CardComponent
                  card={{
                    instId: `test_${cardType}`,
                    defId: `test_${cardType}`,
                    name: `Test ${cardType}`,
                    cardType,
                    villainId: 'maleficent',
                    ownerId: 'p1',
                    baseCost: 3,
                    baseStrength: cardType === CardType.HERO ? 5 : undefined,
                    costModifier: 0,
                    strengthModifier: 0,
                    effectIds: [],
                    attachedItemInstIds: [],
                    locationId: undefined,
                    attachedToInstId: undefined,
                    deck: 'VILLAIN',
                    bonusThisTurn: 0,
                  } as CardInst}
                  state={testState}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import { TurnPhase, CardDeck } from '../../types';
import type {
  GameState, PlayerState, CardInst, CardInstId, PlayerId, GameSetupOptions,
} from '../../types';
import { getPlugin } from '../../villains/registry';
import { shuffle } from '../../utils/shuffle';

const SECOND_PLAYER_POWER_BONUS = 1;

export function createInitialState(options: GameSetupOptions): GameState {
  const p1Id = 'player_0';
  const p2Id = 'player_1';
  const startingPlayerIndex = options.startingPlayerIndex ?? 0;
  const plugin1 = getPlugin(options.player1.villainId);
  const plugin2 = getPlugin(options.player2.villainId);

  const allCards: Record<CardInstId, CardInst> = {};
  let counter = 0;

  function makeInsts(plugin: ReturnType<typeof getPlugin>, ownerId: PlayerId) {
    return [...plugin.villainCardDefs, ...plugin.fateCardDefs].map(def => {
      const instId = `c${counter++}`;
      const inst: CardInst = {
        instId,
        defId: def.id,
        ownerId,
        villainId: def.villainId,
        deck: def.deck,
        cardType: def.type,
        name: def.name,
        baseCost: def.cost,
        baseStrength: def.strength,
        effectIds: def.effectIds,
        activationCost: def.activationCost,
        grantsActionSlot: def.grantsActionSlot,
        imageFile: def.imageFile,
        locationId: undefined,
        attachedToInstId: undefined,
        attachedItemInstIds: [],
        strengthModifier: 0,
        costModifier: 0,
        bonusThisTurn: 0,
      };
      allCards[instId] = inst;
      return instId;
    });
  }

  const p1AllInstIds = makeInsts(plugin1, p1Id);
  const p2AllInstIds = makeInsts(plugin2, p2Id);

  function split(instIds: string[], plugin: ReturnType<typeof getPlugin>, ownerId: PlayerId) {
    const villain = shuffle(
      instIds.filter(id => allCards[id].deck === CardDeck.VILLAIN && allCards[id].ownerId === ownerId),
    );
    const fate = shuffle(
      instIds.filter(id => allCards[id].deck === CardDeck.FATE && allCards[id].ownerId === ownerId),
    );
    const hand = villain.splice(0, plugin.handSize);
    return { villain, fate, hand };
  }

  const p1Split = split([...p1AllInstIds, ...p2AllInstIds], plugin1, p1Id);
  const p2Split = split([...p1AllInstIds, ...p2AllInstIds], plugin2, p2Id);

  function makeLocStates(plugin: ReturnType<typeof getPlugin>) {
    const map: PlayerState['locationStates'] = {};
    for (const loc of plugin.locations) {
      map[loc.id] = {
        id: loc.id,
        isLocked: !!loc.startsLocked,
        villainCardInstIds: [],
        heroCardInstIds: [],
      };
    }
    return map;
  }

  const player1: PlayerState = {
    id: p1Id,
    name: options.player1.name,
    villainId: options.player1.villainId,
    power: plugin1.startingPower + (startingPlayerIndex === 0 ? 0 : SECOND_PLAYER_POWER_BONUS),
    pawnLocationId: plugin1.startingLocationId,
    handInstIds: p1Split.hand,
    villainDeckInstIds: p1Split.villain,
    villainDiscardInstIds: [],
    fateDeckInstIds: p1Split.fate,
    fateDiscardInstIds: [],
    locationStates: makeLocStates(plugin1),
    isAI: options.player1.isAI,
    completedObjectiveSteps: [],
  };

  const player2: PlayerState = {
    id: p2Id,
    name: options.player2.name,
    villainId: options.player2.villainId,
    power: plugin2.startingPower + (startingPlayerIndex === 1 ? 0 : SECOND_PLAYER_POWER_BONUS),
    pawnLocationId: plugin2.startingLocationId,
    handInstIds: p2Split.hand,
    villainDeckInstIds: p2Split.villain,
    villainDiscardInstIds: [],
    fateDeckInstIds: p2Split.fate,
    fateDiscardInstIds: [],
    locationStates: makeLocStates(plugin2),
    isAI: options.player2.isAI,
    completedObjectiveSteps: [],
  };

  const starter = startingPlayerIndex === 0 ? player1 : player2;

  return {
    players: [player1, player2],
    currentPlayerIndex: startingPlayerIndex,
    turnPhase: TurnPhase.MOVE,
    winner: null,
    allCards,
    roundNumber: 1,
    usedActionSlotIndices: [],
    pendingFate: undefined,
    log: [`¡La partida ha comenzado! Empieza ${starter.name}.`],
  };
}

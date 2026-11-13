import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { TurnPhase, CardType, ActionType } from '../core/types';
import type { CardInst, GameState, VillainId } from '../core/types';
import { preloadGameImages } from '../lib/preload';
import { CardDefId, EffectId } from '../core/villains/effectIds';
import { getEffectDef, getPlugin } from '../core/villains/registry';
import { PlayerBoard } from './PlayerBoard';
import { ActionPanel } from './ActionPanel';
import { TurnIndicatorModal } from './TurnIndicatorModal';
import { FateModal } from './FateModal';
import { CuervoModal } from './CuervoModal';
import { DemoslesModal } from './DemoslesModal';
import { ConditionModal } from './ConditionModal';
import { HistoryModal } from './HistoryModal';
import { HookDeckModal } from './HookDeckModal';
import { AuroraModal } from './AuroraModal';
import { JaquecaModal } from './JaquecaModal';
import { WicketPickModal } from './WicketPickModal';
import { ShrinkPickModal } from './ShrinkPickModal';
import { EnlargeTargetModal } from './EnlargeTargetModal';
import { ShrinkSlotModal } from './ShrinkSlotModal';
import { ShotRevealModal } from './ShotRevealModal';
import { VanquishModal } from './VanquishModal';
import { FloraRevealModal } from './FloraRevealModal';
import { VictoryModal } from './VictoryModal';
import { ConfirmLeaveModal } from './ConfirmLeaveModal';
import { AttachTargetModal } from './AttachTargetModal';
import { StarkeyMoveModal } from './StarkeyMoveModal';
import { VillainGuideModal } from './VillainGuideModal';
import type { GuideTab } from './VillainGuideModal';
import { HandFan } from './HandFan';
import { CardFocus, FocusPrimaryButton, FocusSecondaryButton } from './CardFocus';
import { ModalStage } from './shared/ModalStage';
import { TestPage } from './TestPage';
import { useGameStore } from '../state/gameStore';
import { useActionPanelState } from './useActionPanelState';
import { canMovePawn, canPlayCard, canMoveItemAlly, canMoveHero, canPayToDiscardItem } from '../core/engine/RuleEngine';
import { computeKingdomCostMod } from '../core/engine/stateHelpers';
import { getAvailableSlotIndices, getActionAtSlot } from '../core/engine/slotHelpers';
import { buildPlayCtx, getAttachCandidates } from '../core/ai/contextBuilder';
import { LayoutGrid, RotateCcw, ScrollText, Beaker, BookOpen, HelpCircle } from 'lucide-react';

// Dispositivo cuyo puntero PRIMARIO es táctil (tablet/móvil). En estos no hay hover
// prolongado ni arrastre desde la mano: un toque abre el Modo Enfoque y "Jugar" selecciona.
// Un portátil con pantalla táctil pero ratón sigue siendo puntero fino.
const IS_COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

interface Props { state: GameState }

export function GameBoard({ state }: Props) {
  // ─── Store methods ───────────────────────────────────────────────────────
  const resetGame       = useGameStore(s => s.resetGame);
  const aiReplayQueue   = useGameStore(s => s.aiReplayQueue);
  const doFateResolve   = useGameStore(s => s.doFateResolve);
  const doActivateRaven  = useGameStore(s => s.doActivateRaven);
  const doActivateSherif = useGameStore(s => s.doActivateSherif);
  const doResolveTrampa = useGameStore(s => s.doResolveTrampa);

  // ─── UI State: Card selection & detail ────────────────────────────────────
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  // Modo Enfoque: carta abierta en grande (clic). `from` decide los botones: Jugar/Volver
  // desde la mano, Cerrar desde el tablero.
  const [focusCard, setFocusCard]           = useState<{ card: CardInst; from: 'hand' | 'board' } | null>(null);
  // Vista lateral por hover prolongado (solo ratón): no bloquea el tablero ni lleva botones.
  const [peek, setPeek]                     = useState<{ id: string; side: 'left' | 'right' } | null>(null);

  // ─── UI State: Drawers & modals ───────────────────────────────────────────
  const [historyOpen, setHistoryOpen]       = useState(false);
  // Guía de Villano / Reglas: jugador cuya guía se muestra y pestaña inicial.
  const [guide, setGuide]                   = useState<{ playerId: string; tab: GuideTab } | null>(null);
  const [floraOpen, setFloraOpen]           = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showTests, setShowTests]           = useState(false);
  const [showHookDeck, setShowHookDeck]     = useState(false);
  const [showTurnIndicator, setShowTurnIndicator] = useState(false);

  // ─── Drag & Drop State ────────────────────────────────────────────────────
  const [dragCardId, setDragCardId]         = useState<string | null>(null);
  const [fateDragCardId, setFateDragCardId] = useState<string | null>(null);
  const [dragBoardCardId, setDragBoardCardId] = useState<string | null>(null);
  const [dragHeroCardId, setDragHeroCardId]   = useState<string | null>(null);
  const [dragRavenId, setDragRavenId]         = useState<string | null>(null);
  const [dragSherifId, setDragSherifId]       = useState<string | null>(null);
  const [dragAllyForTrampaId, setDragAllyForTrampaId] = useState<string | null>(null);

  // ─── Pending Actions ──────────────────────────────────────────────────────
  const [discardIds, setDiscardIds]         = useState<string[]>([]);
  const [pendingItemDrop, setPendingItemDrop] = useState<{ cardId: string; locId: string; mapaId: string; normalCost: number; forcedTargetCardInstId?: string } | null>(null);
  const [pendingAttachTarget, setPendingAttachTarget] = useState<{
    cardId: string; locId: string; reqTarget: 'ALLY' | 'HERO'; candidates: string[];
  } | null>(null);
  const [pendingStarkeyMove, setPendingStarkeyMove] = useState<{ cardId: string; locId: string } | null>(null);

  // ─── Replay & Turn tracking ───────────────────────────────────────────────
  const prevPlayerIndexRef = useRef(state.currentPlayerIndex);

  // Precarga en memoria las imágenes de los villanos en juego (una vez por partida).
  const villainKey = state.players.map(p => p.villainId).join(',');
  useEffect(() => {
    preloadGameImages(villainKey.split(',') as VillainId[]);
  }, [villainKey]);

  // Botón/gesto "atrás" del navegador (o del móvil, en PWA instalada): sin esto, al no haber
  // ningún router, simplemente abandona la app. Se añade una entrada de historial al entrar en
  // la partida para poder interceptar el "atrás" y mostrar el mismo modal de confirmación que el
  // botón de "Nueva partida" de la barra superior, en vez de perder la partida sin avisar.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });
  useEffect(() => {
    window.history.pushState({ villanosGame: true }, '');
    const handlePopState = () => {
      if (stateRef.current.winner) {
        resetGame();
        return;
      }
      // Repone la entrada que el navegador acaba de consumir: el abandono real solo ocurre
      // si el jugador confirma en el modal, no por el simple gesto/clic de "atrás".
      window.history.pushState({ villanosGame: true }, '');
      setShowLeaveConfirm(true);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [resetGame]);

  // Esc cancela la carta elegida para jugar (si no hay un Modo Enfoque abierto, que ya usa Esc).
  useEffect(() => {
    if (!selectedCardId || focusCard) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedCardId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedCardId, focusCard]);

  // Hover prolongado (450 ms) sobre cualquier carta marcada con data-inspect-id → vista lateral
  // anclada al lado contrario del puntero. Delegado en document: no hace falta cablear cada carta.
  useEffect(() => {
    if (IS_COARSE_POINTER) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let currentId: string | null = null;
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const id = (e.target as Element | null)?.closest?.('[data-inspect-id]')?.getAttribute('data-inspect-id') ?? null;
      if (id === currentId) return;
      currentId = id;
      clearTimeout(timer);
      if (!id) { setPeek(null); return; }
      const x = e.clientX;
      timer = setTimeout(() => setPeek({ id, side: x > window.innerWidth / 2 ? 'left' : 'right' }), 450);
    };
    // Empezar a arrastrar o hacer clic cancela la vista lateral.
    const onDown = () => { clearTimeout(timer); currentId = null; setPeek(null); };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerdown', onDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', onDown);
    };
  }, []);

  // ── AI replay ────────────────────────────────────────────────────────────
  const [replayIndex, setReplayIndex]       = useState(-1);
  const replayRef = useRef(aiReplayQueue);
  // Mientras el modal "Turno de..." sigue abierto, el índice ya apunta al primer paso (para
  // que el modal siga mostrando al jugador correcto — `state` ya refleja el turno de la IA
  // COMPLETO en cuanto responde el worker, así que sin esto `displayedState` saltaba directo
  // al estado post-turno y el modal mostraba al rival equivocado). Lo que se retiene es solo
  // el AVANCE automático cada 750ms: no arranca hasta cerrar el modal (ver
  // handleCloseTurnIndicator), para que el turno de la IA visiblemente empiece tras Aceptar.
  const [replayHeld, setReplayHeld]         = useState(false);
  const guideOpen = guide !== null;

  // Reinicia el índice de replay cuando llega una nueva cola de jugadas de la IA. Se ajusta
  // durante el render (en vez de en un useEffect) para evitar un commit intermedio con el
  // índice viejo. Los refs no se tocan aquí — solo está permitido fuera del render (abajo).
  const [prevAiReplayQueue, setPrevAiReplayQueue] = useState(aiReplayQueue);
  if (prevAiReplayQueue !== aiReplayQueue) {
    setPrevAiReplayQueue(aiReplayQueue);
    setReplayHeld(aiReplayQueue.length > 0 && showTurnIndicator);
    setReplayIndex(aiReplayQueue.length === 0 ? -1 : 0);
  }

  useEffect(() => {
    replayRef.current = aiReplayQueue;
  }, [aiReplayQueue]);

  // Auto-abrir cajón y limpiar selección al activar/desactivar modo descarte
  const isReplaying    = replayIndex >= 0 && replayIndex < aiReplayQueue.length;
  const displayedState = isReplaying ? aiReplayQueue[replayIndex] : state;

  useEffect(() => {
    if (replayIndex < 0 || replayIndex >= replayRef.current.length) return;
    if (replayHeld) return; // esperando a que se cierre el modal de turno
    if (guideOpen) return;  // pausado mientras se consulta la Guía/Reglas, para no perderse jugadas
    const id = setTimeout(() => setReplayIndex(i => i + 1), 750);
    return () => clearTimeout(id);
  }, [replayIndex, replayHeld, guideOpen]);

  // Cierra el modal "Turno de..." y libera el avance automático si estaba retenido.
  const handleCloseTurnIndicator = () => {
    setShowTurnIndicator(false);
    setReplayHeld(false);
  };

  // Muestra el modal de turno cuando cambia el turno actual (solo en modo 2 jugadores)
  useLayoutEffect(() => {
    if (state.currentPlayerIndex !== prevPlayerIndexRef.current && state.players.length === 2 && !isReplaying) {
      setShowTurnIndicator(true);
    }
    prevPlayerIndexRef.current = state.currentPlayerIndex;
  }, [state.currentPlayerIndex, state.players.length, isReplaying]);

  // Descripción de la acción actual (último entry nuevo del log)
  const replayLabel = isReplaying
    ? aiReplayQueue[replayIndex].log[aiReplayQueue[replayIndex].log.length - 1] ?? ''
    : '';

  const currentPlayer = displayedState.players[displayedState.currentPlayerIndex];

  // Single shared action state — used by both tokens (LocationTile) and ActionPanel
  const ap = useActionPanelState(displayedState, currentPlayer.id);

  // Al entrar o salir del modo Descartar se vacía la selección. Ajustado durante el render
  // (mismo motivo que el replay arriba) en vez de en un useEffect.
  const [prevPendingAction, setPrevPendingAction] = useState(ap.pendingAction);
  if (prevPendingAction !== ap.pendingAction) {
    setPrevPendingAction(ap.pendingAction);
    setDiscardIds([]);
  }

  // La carta elegida para jugar solo tiene sentido dentro de la fase de Acciones del turno en
  // que se eligió. Antes solo se limpiaba al jugarla: si el turno terminaba sin poder colocarla
  // (sin Poder o sin acción Jugar Carta), seguía marcada en los turnos siguientes.
  const selectionScope = `${state.roundNumber}-${state.currentPlayerIndex}-${state.turnPhase}`;
  const [prevSelectionScope, setPrevSelectionScope] = useState(selectionScope);
  if (prevSelectionScope !== selectionScope) {
    setPrevSelectionScope(selectionScope);
    setSelectedCardId(null);
  }

  const phaseLabels: Record<TurnPhase, string> = {
    [TurnPhase.MOVE]:     'MOVER',
    [TurnPhase.ACTIVATE]: 'ACCIONES',
    [TurnPhase.DRAW]:     'ROBAR',
  };

  const phaseOrder: TurnPhase[] = [TurnPhase.MOVE, TurnPhase.ACTIVATE, TurnPhase.DRAW];

  const handCards = currentPlayer.handInstIds
    .map(id => displayedState.allCards[id])
    .filter(Boolean);

  const handRevealed = Object.values(currentPlayer.locationStates).some(ls =>
    ls.heroCardInstIds.some(id => displayedState.allCards[id]?.defId === CardDefId.MAL_FLORA),
  );

  // Flora en el tablero: busca en TODOS los jugadores quién tiene Flora como héroe atacante
  const floraVictim = displayedState.players.find(p =>
    Object.values(p.locationStates).some(ls =>
      ls.heroCardInstIds.some(id => displayedState.allCards[id]?.defId === CardDefId.MAL_FLORA),
    ),
  ) ?? null;

  const isHumanTurn = !displayedState.winner && !currentPlayer.isAI && !isReplaying;

  // Parte VISIBLE del abanico de la mano (las cartas asoman desde fuera de la pantalla) para
  // que el final del tablero nunca quede tapado: el padding inferior de <main> la sigue.
  const handFanRef = useRef<HTMLDivElement | null>(null);
  const [bottomUiHeight, setBottomUiHeight] = useState(0);
  useEffect(() => {
    const el = handFanRef.current;
    if (!el) { setBottomUiHeight(0); return; }
    const measure = () => setBottomUiHeight(Math.max(0, window.innerHeight - el.getBoundingClientRect().top));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [isHumanTurn]);


  // ── Cartas de la mano que se pueden jugar ahora en alguna ubicación (brillo "jugable") ─
  const playableIds = ((): Set<string> => {
    const ids = new Set<string>();
    if (!isHumanTurn || displayedState.turnPhase !== TurnPhase.ACTIVATE) return ids;
    const playSlotIdx = getAvailableSlotIndices(displayedState, currentPlayer.id, currentPlayer.pawnLocationId)
      .find(i => getActionAtSlot(displayedState, currentPlayer.id, i)?.type === ActionType.PLAY_CARD);
    if (playSlotIdx === undefined) return ids;
    for (const id of currentPlayer.handInstIds) {
      if (ap.plugin.locations.some(l => canPlayCard(displayedState, currentPlayer.id, id, playSlotIdx, l.id).valid)) ids.add(id);
    }
    return ids;
  })();

  // ── Play highlights: resalta ubicaciones al seleccionar o arrastrar carta ─
  type PlayState = 'valid' | 'cant-afford' | 'blocked';
  const activeHighlightId = dragCardId ?? selectedCardId;
  const playHighlights = ((): Record<string, { playState: PlayState; cost: number }> | undefined => {
    if (!isHumanTurn || displayedState.turnPhase !== TurnPhase.ACTIVATE) return undefined;
    if (!activeHighlightId || !currentPlayer.handInstIds.includes(activeHighlightId)) return undefined;
    const card = displayedState.allCards[activeHighlightId];
    if (!card) return undefined;
    if (!card) return undefined;

    // Busca un slot PLAY_CARD disponible en la ubicación del peón
    const pawnLoc = currentPlayer.pawnLocationId;
    const available = getAvailableSlotIndices(displayedState, currentPlayer.id, pawnLoc);
    const playSlotIdx = available.find(idx => getActionAtSlot(displayedState, currentPlayer.id, idx)?.type === ActionType.PLAY_CARD);

    const result: Record<string, { playState: PlayState; cost: number }> = {};
    for (const loc of ap.plugin.locations) {
      if (currentPlayer.locationStates[loc.id]?.isLocked) continue;
      const costMod = computeKingdomCostMod(displayedState, currentPlayer.id, card, loc.id);
      const cost    = Math.max(0, card.baseCost + card.costModifier + costMod);

      if (playSlotIdx === undefined) {
        result[loc.id] = { playState: 'blocked', cost };
      } else {
        const check = canPlayCard(displayedState, currentPlayer.id, activeHighlightId, playSlotIdx, loc.id);
        if (check.valid) {
          result[loc.id] = { playState: 'valid', cost };
        } else if (currentPlayer.power < cost) {
          result[loc.id] = { playState: 'cant-afford', cost };
        } else {
          result[loc.id] = { playState: 'blocked', cost };
        }
      }
    }
    return result;
  })();

  const activeFateCardId = state.pendingFate ? fateDragCardId : null;

  // ── Fate highlights: resalta ubicaciones del rival al arrastrar/seleccionar carta Destino ─
  const fateHighlights = ((): Record<string, { playState: PlayState; cost: number }> | undefined => {
    if (!state.pendingFate || !activeFateCardId) return undefined;
    const card = state.allCards[activeFateCardId];
    if (!card) return undefined;
    const targetPlayer = state.players[state.pendingFate.targetPlayerIndex];
    const { locations }  = getPlugin(targetPlayer.villainId);

    // Las cartas EFFECT pueden resolverse en cualquier ubicación desbloqueada.
    if (card.cardType === CardType.EFFECT) {
      const result: Record<string, { playState: PlayState; cost: number }> = {};
      for (const loc of locations) {
        result[loc.id] = targetPlayer.locationStates[loc.id]?.isLocked
          ? { playState: 'blocked', cost: 0 }
          : { playState: 'valid',   cost: 0 };
      }
      return result;
    }

    const result: Record<string, { playState: PlayState; cost: number }> = {};
    for (const loc of locations) {
      if (targetPlayer.locationStates[loc.id]?.isLocked) { result[loc.id] = { playState: 'blocked', cost: 0 }; continue; }
      const heroBlocked = targetPlayer.locationStates[loc.id]?.villainCardInstIds.some(id =>
        state.allCards[id]?.effectIds.some(eid => getEffectDef(eid)?.blocksHeroPlay),
      );
      if (heroBlocked && card.cardType !== CardType.ITEM) {
        result[loc.id] = { playState: 'blocked', cost: 0 };
        continue;
      }
      const minStr = targetPlayer.locationStates[loc.id]?.villainCardInstIds.reduce((max, cId) => {
        for (const eid of (state.allCards[cId]?.effectIds ?? [])) {
          const eff = getEffectDef(eid);
          if (eff?.heroMinStrengthRequired) return Math.max(max, eff.heroMinStrengthRequired);
        }
        return max;
      }, 0) ?? 0;
      if (card.cardType === CardType.HERO && minStr > 0 && (card.baseStrength ?? 0) < minStr) {
        result[loc.id] = { playState: 'blocked', cost: 0 };
      } else {
        result[loc.id] = { playState: 'valid', cost: 0 };
      }
    }
    return result;
  })();

  // ── Move board card highlights (MOVE_ITEM_ALLY drag) ─────────────────────────
  const moveBoardHighlights = ((): Record<string, { playState: PlayState; cost: number }> | undefined => {
    if (!dragBoardCardId || !isHumanTurn) return undefined;
    if (displayedState.turnPhase !== TurnPhase.ACTIVATE) return undefined;
    const pawnLoc = currentPlayer.pawnLocationId;
    const avail   = getAvailableSlotIndices(displayedState, currentPlayer.id, pawnLoc);
    const slotIdx = avail.find(i => getActionAtSlot(displayedState, currentPlayer.id, i)?.type === ActionType.MOVE_ITEM_ALLY);
    if (slotIdx === undefined) return undefined;
    const result: Record<string, { playState: PlayState; cost: number }> = {};
    for (const loc of ap.plugin.locations) {
      if (canMoveItemAlly(displayedState, currentPlayer.id, dragBoardCardId, loc.id, slotIdx).valid) {
        result[loc.id] = { playState: 'valid', cost: 0 };
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  })();

  // ── Move hero highlights (MOVE_HERO drag) ─────────────────────────────────────
  const moveHeroHighlights = ((): Record<string, { playState: PlayState; cost: number }> | undefined => {
    if (!dragHeroCardId || !isHumanTurn) return undefined;
    if (displayedState.turnPhase !== TurnPhase.ACTIVATE) return undefined;
    const pawnLoc = currentPlayer.pawnLocationId;
    const avail   = getAvailableSlotIndices(displayedState, currentPlayer.id, pawnLoc);
    const slotIdx = avail.find(i => getActionAtSlot(displayedState, currentPlayer.id, i)?.type === ActionType.MOVE_HERO);
    if (slotIdx === undefined) return undefined;
    const result: Record<string, { playState: PlayState; cost: number }> = {};
    for (const loc of ap.plugin.locations) {
      if (canMoveHero(displayedState, currentPlayer.id, dragHeroCardId, loc.id, slotIdx).valid) {
        result[loc.id] = { playState: 'valid', cost: 0 };
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  })();

  // ── Raven drag (MOVE phase) ────────────────────────────────────────────────
  const ravenInstId = ((): string | null => {
    if (!isHumanTurn || displayedState.turnPhase !== TurnPhase.MOVE) return null;
    const p = displayedState.players[displayedState.currentPlayerIndex];
    if (p.ravenUsedThisTurn) return null;
    return Object.values(displayedState.allCards).find(
      c => c.ownerId === p.id && c.effectIds.includes(EffectId.RAVEN_ACTIVATE) && c.locationId,
    )?.instId ?? null;
  })();

  const ravenDropHighlights = ((): Record<string, { playState: PlayState; cost: number }> | undefined => {
    if (!dragRavenId || !isHumanTurn) return undefined;
    const p = displayedState.players[displayedState.currentPlayerIndex];
    const result: Record<string, { playState: PlayState; cost: number }> = {};
    for (const loc of ap.plugin.locations) {
      if (!p.locationStates[loc.id]?.isLocked) {
        result[loc.id] = { playState: 'valid', cost: 0 };
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  })();

  function handleRavenDrop(locId: string) {
    if (!dragRavenId) return;
    doActivateRaven(dragRavenId, locId);
    setDragRavenId(null);
  }

  // ── Sheriff drag (MOVE phase, solo Príncipe Juan) ──────────────────────────
  const sherifInstId = ((): string | null => {
    if (!isHumanTurn || displayedState.turnPhase !== TurnPhase.MOVE) return null;
    const p = displayedState.players[displayedState.currentPlayerIndex];
    if (p.sherifUsedThisTurn) return null;
    return Object.values(displayedState.allCards).find(
      c => c.ownerId === p.id && c.effectIds.includes(EffectId.JHON_SHERIF) && c.locationId,
    )?.instId ?? null;
  })();

  const sherifDropHighlights = ((): Record<string, { playState: PlayState; cost: number }> | undefined => {
    if (!dragSherifId || !isHumanTurn) return undefined;
    const p = displayedState.players[displayedState.currentPlayerIndex];
    // La carta permite mover al Sheriff a CUALQUIER ubicación (no solo adyacentes).
    const sherifLocId = displayedState.allCards[dragSherifId]?.locationId;
    const result: Record<string, { playState: PlayState; cost: number }> = {};
    for (const loc of ap.plugin.locations) {
      if (loc.id !== sherifLocId && !p.locationStates[loc.id]?.isLocked) {
        result[loc.id] = { playState: 'valid', cost: 0 };
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  })();

  function handleSherifDrop(locId: string) {
    if (!dragSherifId) return;
    doActivateSherif(dragSherifId, locId);
    setDragSherifId(null);
  }

  function handleHeroCardDrop(locId: string) {
    if (!dragHeroCardId || !isHumanTurn) return;
    const pawnLoc = currentPlayer.pawnLocationId;
    const avail   = getAvailableSlotIndices(displayedState, currentPlayer.id, pawnLoc);
    const slotIdx = avail.find(i => getActionAtSlot(displayedState, currentPlayer.id, i)?.type === ActionType.MOVE_HERO);
    if (slotIdx === undefined) return;
    if (!canMoveHero(displayedState, currentPlayer.id, dragHeroCardId, locId, slotIdx).valid) return;
    ap.store.doMoveHero(dragHeroCardId, locId, slotIdx);
    setDragHeroCardId(null);
  }

  function handleBoardCardDrop(locId: string) {
    if (!dragBoardCardId || !isHumanTurn) return;
    const pawnLoc = currentPlayer.pawnLocationId;
    const avail   = getAvailableSlotIndices(displayedState, currentPlayer.id, pawnLoc);
    const slotIdx = avail.find(i => getActionAtSlot(displayedState, currentPlayer.id, i)?.type === ActionType.MOVE_ITEM_ALLY);
    if (slotIdx === undefined) return;
    if (!canMoveItemAlly(displayedState, currentPlayer.id, dragBoardCardId, locId, slotIdx).valid) return;
    ap.store.doMoveItemAlly(dragBoardCardId, locId, slotIdx);
    setDragBoardCardId(null);
  }

  function handleTrampaDrop(locId: string) {
    if (!dragAllyForTrampaId || !isHumanTurn || !state.trampaActive) return;
    doResolveTrampa(dragAllyForTrampaId, locId);
    setDragAllyForTrampaId(null);
  }

  function handleCardDrop(locId: string) {
    const cardId = dragCardId ?? selectedCardId;
    if (!cardId || !isHumanTurn) return;
    if (!currentPlayer.handInstIds.includes(cardId)) return;
    const pawnLoc  = currentPlayer.pawnLocationId;
    const avail    = getAvailableSlotIndices(displayedState, currentPlayer.id, pawnLoc);
    const slotIdx  = avail.find(i => getActionAtSlot(displayedState, currentPlayer.id, i)?.type === ActionType.PLAY_CARD);
    if (slotIdx === undefined) return;
    if (!canPlayCard(displayedState, currentPlayer.id, cardId, slotIdx, locId).valid) return;

    // Sr. Starkey: "puedes mover un Héroe" — dejar elegir cuál y a dónde (o ignorar del todo)
    // en vez de autoseleccionar (la IA sigue autoseleccionando vía buildPlayCtx/pickStarkeyHeroTarget).
    const needsHeroTarget = displayedState.allCards[cardId]?.effectIds.some(
      id => getEffectDef(id)?.requiresTargetHeroAnywhere,
    );
    if (needsHeroTarget) {
      setPendingStarkeyMove({ cardId, locId });
      setDragCardId(null);
      return;
    }

    // Si la carta debe adjuntarse a un Aliado/Héroe y hay más de un candidato, dejar elegir
    // en vez de autoseleccionar (la IA sigue autoseleccionando vía buildPlayCtx).
    const attachInfo = getAttachCandidates(displayedState, currentPlayer.id, cardId);
    if (attachInfo && attachInfo.candidates.length > 1) {
      setPendingAttachTarget({ cardId, locId, reqTarget: attachInfo.reqTarget, candidates: attachInfo.candidates });
      setDragCardId(null);
      return;
    }

    continuePlayCard(cardId, locId);
  }

  /** Continúa el flujo de jugar una carta tras resolver (si hacía falta) el target de adjunto. */
  function continuePlayCard(cardId: string, locId: string, forcedTargetCardInstId?: string) {
    const pawnLoc = currentPlayer.pawnLocationId;
    const avail   = getAvailableSlotIndices(displayedState, currentPlayer.id, pawnLoc);
    const slotIdx = avail.find(i => getActionAtSlot(displayedState, currentPlayer.id, i)?.type === ActionType.PLAY_CARD);
    if (slotIdx === undefined) return;

    const card = displayedState.allCards[cardId];
    const normalCost = Math.max(0, (card?.baseCost ?? 0) + (card?.costModifier ?? 0));
    const mapaId = card?.cardType === CardType.ITEM
      ? Object.values(displayedState.allCards).find(
          c => c.defId.startsWith('hook_v_mapa') && c.ownerId === currentPlayer.id && !!c.locationId,
        )?.instId
      : undefined;

    // If Mapa available AND player can afford normally → ask
    if (mapaId && currentPlayer.power >= normalCost) {
      setPendingItemDrop({ cardId, locId, mapaId, normalCost, forcedTargetCardInstId });
      setDragCardId(null);
      return;
    }

    const ctx = buildPlayCtx(displayedState, currentPlayer.id, cardId, locId);
    if (forcedTargetCardInstId) ctx.targetCardInstId = forcedTargetCardInstId;
    ap.store.doPlayCard(cardId, slotIdx, locId, ctx);
    setDragCardId(null);
    setSelectedCardId(null);
  }

  function resolvePendingAttachTarget(targetCardInstId: string) {
    if (!pendingAttachTarget) return;
    const { cardId, locId } = pendingAttachTarget;
    setPendingAttachTarget(null);

    // Detectar si es carta de Destino o carta de mano
    const card = displayedState.allCards[cardId];
    if (card?.deck === 'FATE' && state.pendingFate) {
      // Es carta de Destino → usar handleFateDrop con target
      const ctx: { targetCardInstId?: string } = { targetCardInstId };
      doFateResolve(cardId, locId, ctx);
      setFateDragCardId(null);
    } else {
      // Es carta de mano → usar continuePlayCard
      continuePlayCard(cardId, locId, targetCardInstId);
    }
  }

  function cancelPendingAttachTarget() {
    setPendingAttachTarget(null);
    setSelectedCardId(null);
  }

  function resolvePendingStarkeyMove(heroId: string, destLocId: string) {
    if (!pendingStarkeyMove) return;
    const { cardId, locId } = pendingStarkeyMove;
    setPendingStarkeyMove(null);
    const pawnLoc = currentPlayer.pawnLocationId;
    const avail   = getAvailableSlotIndices(displayedState, currentPlayer.id, pawnLoc);
    const slotIdx = avail.find(i => getActionAtSlot(displayedState, currentPlayer.id, i)?.type === ActionType.PLAY_CARD);
    if (slotIdx === undefined) return;
    const ctx = buildPlayCtx(displayedState, currentPlayer.id, cardId, locId);
    ctx.targetCardInstId = heroId;
    ctx.targetLocationId = destLocId;
    ap.store.doPlayCard(cardId, slotIdx, locId, ctx);
    setSelectedCardId(null);
  }

  function skipPendingStarkeyMove() {
    if (!pendingStarkeyMove) return;
    const { cardId, locId } = pendingStarkeyMove;
    setPendingStarkeyMove(null);
    const pawnLoc = currentPlayer.pawnLocationId;
    const avail   = getAvailableSlotIndices(displayedState, currentPlayer.id, pawnLoc);
    const slotIdx = avail.find(i => getActionAtSlot(displayedState, currentPlayer.id, i)?.type === ActionType.PLAY_CARD);
    if (slotIdx === undefined) return;
    const ctx = buildPlayCtx(displayedState, currentPlayer.id, cardId, locId);
    ctx.skipTargetHero = true;
    ap.store.doPlayCard(cardId, slotIdx, locId, ctx);
    setSelectedCardId(null);
  }

  function cancelPendingStarkeyMove() {
    setPendingStarkeyMove(null);
    setSelectedCardId(null);
  }

  function resolvePendingItemDrop(useMapa: boolean) {
    if (!pendingItemDrop) return;
    const { cardId, locId, mapaId, forcedTargetCardInstId } = pendingItemDrop;
    const pawnLoc = currentPlayer.pawnLocationId;
    const avail   = getAvailableSlotIndices(displayedState, currentPlayer.id, pawnLoc);
    const slotIdx = avail.find(i => getActionAtSlot(displayedState, currentPlayer.id, i)?.type === ActionType.PLAY_CARD);
    if (slotIdx === undefined) { setPendingItemDrop(null); return; }
    const ctx = buildPlayCtx(displayedState, currentPlayer.id, cardId, locId);
    if (useMapa) ctx.mapaInstId = mapaId;
    if (forcedTargetCardInstId) ctx.targetCardInstId = forcedTargetCardInstId;
    ap.store.doPlayCard(cardId, slotIdx, locId, ctx);
    setPendingItemDrop(null);
    setSelectedCardId(null);
  }

  function handleFateDrop(locId: string) {
    if (!fateDragCardId || !state.pendingFate) return;
    const card = state.allCards[fateDragCardId];
    if (!card) return;
    const targetPlayer = state.players[state.pendingFate.targetPlayerIndex];
    const ctx: { targetCardInstId?: string } = {};

    const reqTarget = card.effectIds.map(id => getEffectDef(id)?.requiresTargetCard).find(Boolean);
    if (reqTarget === 'HERO' || reqTarget === 'ALLY') {
      // Los OBJETOS (Espada, Burla, Polvo…) se adjuntan físicamente al Héroe/Aliado de la
      // ubicación donde se colocan — su objetivo está limitado a esa ubicación. Las cartas
      // EFFECT (p. ej. Robar a los Ricos) no se quedan en el tablero: su objetivo puede ser
      // cualquier Héroe/Aliado del reino, no solo el de la ubicación donde se "juega" la carta
      // (antes esto se ignoraba por completo y siempre se autoseleccionaba el primero que veía).
      const scopeLocations = card.cardType === CardType.ITEM
        ? [targetPlayer.locationStates[locId]].filter(Boolean)
        : Object.values(targetPlayer.locationStates);
      const candidates = scopeLocations.flatMap(ls =>
        reqTarget === 'HERO'
          ? ls!.heroCardInstIds
          : ls!.villainCardInstIds.filter(id => state.allCards[id]?.cardType === CardType.ALLY),
      );
      // Si hay múltiples candidatos, dejar elegir (igual que cartas de mano)
      if (candidates.length > 1) {
        setPendingAttachTarget({ cardId: fateDragCardId, locId, reqTarget, candidates });
        setFateDragCardId(null);
        return;
      }
      // Si hay un único candidato, seleccionarlo automáticamente
      if (candidates.length === 1) {
        ctx.targetCardInstId = candidates[0];
      }
    }

    // EFFECT con requiresTargetCard CURSE: buscar maldición válida (en ubicación con héroe)
    const needsCurse = card.effectIds.some(id => getEffectDef(id)?.requiresTargetCard === 'CURSE');
    if (needsCurse) {
      const validCurse = Object.values(state.allCards).find(c =>
        c.ownerId === targetPlayer.id &&
        c.cardType === CardType.CURSE &&
        c.locationId &&
        (targetPlayer.locationStates[c.locationId]?.heroCardInstIds.length ?? 0) > 0
      );
      if (!validCurse) return; // No hay maldición válida — no consumir la carta
      ctx.targetCardInstId = validCurse.instId;
    }

    doFateResolve(fateDragCardId, locId, ctx);
    setFateDragCardId(null);
  }

  // Mostrar página de pruebas si está activa
  if (showTests) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <nav className="fixed top-0 inset-x-0 z-100 h-12 bg-surface-container-low/95 backdrop-blur-md border-b border-outline-variant/30 flex items-center justify-between px-4 md:px-6 shadow-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTests(false)}
              className="text-on-surface-variant hover:text-primary transition-colors text-xl"
              title="Volver al juego"
            >
              ←
            </button>
            <span className="font-serif italic text-base text-on-surface leading-none">Villainous</span>
          </div>
        </nav>
        <div className="pt-12">
          <TestPage />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen" key={isReplaying ? 'replay' : 'live'}>

      {/* ── Banda cinematográfica ───────────────────────────── */}
      <nav className="cine-band fixed top-0 inset-x-0 z-100 h-12 flex items-center justify-between gap-2 px-3 sm:px-4 md:px-6">
        <div className="flex items-center gap-3 md:gap-5 min-w-0 shrink-0">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-gold/80" />
            <span className="hidden sm:inline font-serif font-bold text-sm md:text-base leading-none tracking-[0.18em] uppercase text-gold-bright"
              style={{ textShadow: '0 0 14px rgba(230,196,106,0.35)' }}>
              Villainous
            </span>
          </div>
        </div>

        {/* Centro: ronda · villano activo · fases del turno */}
        <div className="min-w-0 flex items-center gap-2 md:gap-3 md:absolute md:left-1/2 md:-translate-x-1/2">
          <span className="hidden md:inline font-serif text-[11px] font-semibold tracking-[0.2em] uppercase text-[#e8dcc4]/70">
            Ronda <span className="font-stats text-gold-bright">{state.roundNumber}</span>
          </span>
          <span className="hidden md:block w-1 h-1 rotate-45 bg-gold/70" />
          <span className="hidden sm:inline max-w-40 truncate font-narrative italic text-sm text-[#f3e2b3]">
            {currentPlayer.name}
          </span>
          {!state.winner && (
            <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-black/40 border border-gold/25 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]">
              {phaseOrder.map(ph => (
                <span key={ph}
                  className={`phase-step px-1.5 sm:px-2 md:px-2.5 py-0.5 rounded-full font-stats text-[8px] sm:text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.08em] sm:tracking-[0.14em] ${
                    state.turnPhase === ph ? 'is-current' : 'text-on-surface-variant/45'
                  }`}>
                  {phaseLabels[ph]}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {floraVictim && (
            <button
              onClick={() => setFloraOpen(true)}
              title={`Ver cartas de ${floraVictim.name}`}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-error/50 bg-error/10 text-error text-[9px] uppercase tracking-wider hover:bg-error/20 transition-all animate-pulse"
            >
              ✦ Cartas de {floraVictim.name}
            </button>
          )}
          <span className="hidden sm:inline md:hidden font-stats text-xs text-gold/80">R{state.roundNumber}</span>
          <button
            onClick={() => setGuide({ playerId: (state.players.find(p => !p.isAI) ?? state.players[0]).id, tab: 'rules' })}
            title="Reglas del juego"
            aria-label="Reglas del juego"
            className="text-on-surface-variant/80 hover:text-gold-bright transition-colors duration-200"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setHistoryOpen(true)}
            title="Ver histórico"
            className="text-on-surface-variant/80 hover:text-gold-bright transition-colors duration-200"
          >
            <ScrollText className="w-4 h-4" />
          </button>
          {/* Botones de depuración: solo visibles en desarrollo (npm run dev).
              import.meta.env.DEV es false en el build de producción, y Vite elimina
              este bloque del bundle final (tree-shaking). */}
          {import.meta.env.DEV && (
            <>
              <button
                onClick={() => setShowHookDeck(true)}
                title="Cartas de Garfio"
                className="text-on-surface-variant/80 hover:text-gold-bright transition-colors duration-200"
              >
                <BookOpen className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowTests(true)}
                title="Pruebas de modales"
                className="text-on-surface-variant/80 hover:text-gold-bright transition-colors duration-200"
              >
                <Beaker className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => (state.winner ? resetGame() : setShowLeaveConfirm(true))}
            title="Nueva partida"
            className="text-on-surface-variant/80 hover:text-gold-bright transition-colors duration-200"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* ── AI replay banner ────────────────────────────────── */}
      {isReplaying && (
        <div className="fixed top-12 inset-x-0 z-90 flex items-center justify-center gap-3 px-6 py-2.5 bg-[#120e1a]/80 backdrop-blur-xl border-b border-gold/25 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)]">
          <span className="flex gap-1">
            {[0,1,2].map(i => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-tertiary animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
          <span className="font-stats text-[11px] uppercase tracking-widest text-tertiary">
            {currentPlayer.name}
          </span>
          <span className="text-on-surface-variant/60 text-[11px] font-sans truncate max-w-xs">
            {replayLabel}
          </span>
        </div>
      )}

      {/* ── Winner banner ───────────────────────────────────── */}
      {/* Durante el replay de la IA no se muestra: primero se ve su turno ganador
          paso a paso; el modal (con el resumen de la jugada final) llega al terminar.
          Si "Efectúa el tiro" acaba de ganar, primero se ve ShotRevealModal con las 5 cartas. */}
      {displayedState.winner && !isReplaying && !displayedState.pendingShotReveal && (
        <VictoryModal state={displayedState} onPlayAgain={resetGame} />
      )}

      {/* ── Confirmación de abandonar partida ──────────────────── */}
      {showLeaveConfirm && (
        <ConfirmLeaveModal
          onConfirm={() => { setShowLeaveConfirm(false); resetGame(); }}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}

      {/* ── Turn indicator modal (2 players only) ────────────── */}
      <TurnIndicatorModal
        player={displayedState.players[displayedState.currentPlayerIndex]}
        isOpen={showTurnIndicator}
        onClose={handleCloseTurnIndicator}
      />

      {/* ── Main scrollable content ─────────────────────────── */}
      <main style={{ paddingBottom: Math.max(bottomUiHeight + 24, 96) }} className={`w-full px-4 md:px-8 flex flex-col gap-12 md:gap-16 max-w-375 mx-auto ${isReplaying ? 'pt-24' : displayedState.winner ? 'pt-28' : 'pt-16'}`}>
        {displayedState.players.map((player, idx) => {
          const isActive  = isHumanTurn && displayedState.currentPlayerIndex === idx;
          const isFateTgt = state.pendingFate?.targetPlayerIndex === idx;
          const isMoving   = isActive && state.turnPhase === TurnPhase.MOVE;
          const isActing  = isActive && state.turnPhase === TurnPhase.ACTIVATE;
          const movableLocIds = isMoving && !player.skipNextMove
            ? ap.plugin.locations
                .filter(l => canMovePawn(displayedState, player.id, l.id).valid)
                .map(l => l.id)
            : undefined;
          return (
            <PlayerBoard
              key={player.id}
              state={displayedState}
              player={player}
              isActive={isActive}
              onAvatarClick={() => setGuide({ playerId: player.id, tab: 'guide' })}
              onCardClick={(id) => {
                const card = displayedState.allCards[id];
                if (card) setFocusCard({ card, from: 'board' });
              }}
              playHighlights={
                dragRavenId       ? (isActive  ? ravenDropHighlights  : undefined) :
                dragSherifId      ? (isActive  ? sherifDropHighlights : undefined) :
                activeFateCardId  ? (isFateTgt ? fateHighlights       : undefined) :
                dragBoardCardId   ? (isHumanTurn ? moveBoardHighlights  : undefined) :
                dragHeroCardId    ? (isHumanTurn ? moveHeroHighlights   : undefined) :
                                    (isActive  ? playHighlights       : undefined)
              }
              onCardDrop={
                dragRavenId                    ? (isActive  ? handleRavenDrop     : undefined) :
                dragSherifId                   ? (isActive  ? handleSherifDrop    : undefined) :
                dragAllyForTrampaId            ? (isHumanTurn ? handleTrampaDrop : undefined) :
                dragBoardCardId                ? (isHumanTurn ? handleBoardCardDrop : undefined) :
                dragHeroCardId                 ? (isHumanTurn ? handleHeroCardDrop  : undefined) :
                (state.pendingFate && isFateTgt) ? handleFateDrop                             :
                (isActive && state.turnPhase === TurnPhase.ACTIVATE) ? handleCardDrop : undefined
              }
              onVillainCardDragStart={
                (isHumanTurn && state.trampaActive && state.turnPhase === TurnPhase.ACTIVATE)
                  ? (cardId) => setDragAllyForTrampaId(cardId)
                  : (isHumanTurn && state.turnPhase === TurnPhase.ACTIVATE)
                  ? (cardId) => setDragBoardCardId(cardId)
                  : undefined
              }
              onVillainCardDragEnd={() => {
                setDragBoardCardId(null);
                setDragAllyForTrampaId(null);
              }}
              onHeroCardDragStart={
                isHumanTurn && state.turnPhase === TurnPhase.ACTIVATE
                  ? (cardId) => setDragHeroCardId(cardId)
                  : undefined
              }
              onHeroCardDragEnd={() => setDragHeroCardId(null)}
              ravenInstId={isActive && state.turnPhase === TurnPhase.MOVE ? ravenInstId ?? undefined : undefined}
              onRavenDragStart={isActive && state.turnPhase === TurnPhase.MOVE && !!ravenInstId ? (cardId) => setDragRavenId(cardId) : undefined}
              onRavenDragEnd={() => setDragRavenId(null)}
              sherifInstId={isActive && state.turnPhase === TurnPhase.MOVE ? sherifInstId ?? undefined : undefined}
              onSherifDragStart={isActive && state.turnPhase === TurnPhase.MOVE && !!sherifInstId ? (cardId) => setDragSherifId(cardId) : undefined}
              onSherifDragEnd={() => setDragSherifId(null)}
              selectedCardId={selectedCardId}
              onActionSlotClick={isActing  ? ap.handleSlotClick  : undefined}
              onLocationClick={
                isMoving ? (locId) => ap.store.doMovePawn(locId) :
                (state.trampaActive && isHumanTurn && dragAllyForTrampaId) ? (locId) => handleTrampaDrop(locId) :
                (state.pendingFate && isFateTgt) ? (locId) => handleFateDrop(locId) :
                (isActive && state.turnPhase === TurnPhase.ACTIVATE && selectedCardId)
                  ? (locId) => handleCardDrop(locId)
                  : undefined
              }
              movableLocIds={movableLocIds}
            />
          );
        })}
      </main>

      {/* ── Mano en abanico + controles del turno flotantes (sin barra inferior) ── */}
      {isHumanTurn && (
        <>
          <div ref={handFanRef} className="hand-fan-anchor">
            <HandFan
              state={displayedState}
              cards={handCards}
              selectedCardId={selectedCardId}
              dragCardId={dragCardId}
              playableIds={playableIds}
              revealed={handRevealed}
              onInspect={card => setFocusCard({ card, from: 'hand' })}
              dragEnabled={!IS_COARSE_POINTER}
              onDragStart={cardId => { setDragCardId(cardId); setSelectedCardId(cardId); setPeek(null); }}
              onDragEnd={() => setDragCardId(null)}
              discardMode={ap.pendingAction === ActionType.DISCARD}
              discardIds={discardIds}
              onToggleDiscard={cardId => setDiscardIds(prev =>
                prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId])}
            />
          </div>
          <ActionPanel
            ap={ap}
            state={displayedState}
            playerId={currentPlayer.id}
            selectedCardId={selectedCardId}
            onCancelSelection={() => setSelectedCardId(null)}
            discard={{
              count: discardIds.length,
              canConfirm: discardIds.length > 0 && ap.pendingSlot !== null,
              onCancel: () => { ap.clearPending(); setDiscardIds([]); },
              onConfirm: () => {
                if (ap.pendingSlot === null || discardIds.length === 0) return;
                ap.store.doDiscardFromHand(discardIds, ap.pendingSlot);
                ap.clearPending();
                setDiscardIds([]);
              },
            }}
          />
        </>
      )}

      {/* ── AI indicator ────────────────────────────────────── */}
      {!state.winner && currentPlayer.isAI && (
        <div className="fixed bottom-0 inset-x-0 z-40 flex justify-center">
          <div className="mb-3 rounded-full bg-[#120e1a]/85 backdrop-blur-xl border border-gold/35 px-6 py-2 text-gold-bright font-narrative italic text-sm tracking-wide shadow-[0_0_24px_rgba(230,196,106,0.15),0_10px_30px_rgba(0,0,0,0.7)]">
            {currentPlayer.name} trama su jugada…
          </div>
        </div>
      )}

      {/* ── Modo Enfoque: vista lateral por hover prolongado ─── */}
      {peek && !focusCard && !dragCardId && (() => {
        const pc = displayedState.allCards[peek.id];
        if (!pc) return null;
        return <CardFocus card={pc} state={displayedState} mode="peek" side={peek.side} />;
      })()}

      {/* ── Modo Enfoque: carta abierta (clic en mano o tablero) ── */}
      {focusCard && (() => {
        // Siempre la versión actual de la carta (puede haber cambiado desde que se abrió).
        const fc = displayedState.allCards[focusCard.card.instId] ?? focusCard.card;
        const close = () => setFocusCard(null);
        const inHand = focusCard.from === 'hand' && currentPlayer.handInstIds.includes(fc.instId);

        if (inHand) {
          // "Jugar" reutiliza el flujo de siempre: deja la carta seleccionada, el tablero ilumina
          // las ubicaciones válidas y un clic/toque en una de ellas la juega.
          const hasPlaySlot = getAvailableSlotIndices(displayedState, currentPlayer.id, currentPlayer.pawnLocationId)
            .some(i => getActionAtSlot(displayedState, currentPlayer.id, i)?.type === ActionType.PLAY_CARD);
          const playBlocked =
            !isHumanTurn ? 'No es tu turno'
            : displayedState.turnPhase !== TurnPhase.ACTIVATE ? 'Solo puedes jugar cartas en la fase de Acciones'
            : !hasPlaySlot ? 'No hay ninguna acción Jugar Carta disponible en tu ubicación'
            : undefined;
          return (
            <CardFocus
              card={fc} state={displayedState} mode="modal" onClose={close}
              actions={<>
                <FocusSecondaryButton onClick={close}>Volver</FocusSecondaryButton>
                <FocusPrimaryButton
                  disabled={!!playBlocked}
                  title={playBlocked}
                  onClick={() => { setSelectedCardId(fc.instId); close(); }}
                >
                  Jugar
                </FocusPrimaryButton>
              </>}
            />
          );
        }

        // Objetos "pay to discard" (p. ej. Buen Disfraz): el dueño puede pagar su coste para
        // descartarlo en cualquier momento de su propio turno, sin gastar casilla de acción.
        const payCost = fc.effectIds.map(id => getEffectDef(id)?.payToDiscardCost).find(Boolean);
        const canPay  = payCost ? canPayToDiscardItem(state, fc.ownerId, fc.instId) : null;
        return (
          <CardFocus
            card={fc} state={displayedState} mode="modal" onClose={close}
            actions={<>
              {payCost !== undefined && (
                <FocusSecondaryButton
                  disabled={!canPay?.valid}
                  title={canPay?.valid ? undefined : canPay?.reason}
                  onClick={() => { ap.store.doPayToDiscardItem(fc.instId); close(); }}
                >
                  Pagar {payCost} Poder y descartar
                </FocusSecondaryButton>
              )}
              <FocusPrimaryButton onClick={close}>Cerrar</FocusPrimaryButton>
            </>}
          />
        );
      })()}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {/* ── Elegir a qué Aliado/Héroe se adjunta un Objeto (cuando hay 2+ candidatos) ── */}
      {pendingAttachTarget && (
        <AttachTargetModal
          state={displayedState}
          cardName={displayedState.allCards[pendingAttachTarget.cardId]?.name ?? ''}
          reqTarget={pendingAttachTarget.reqTarget}
          candidates={pendingAttachTarget.candidates}
          onSelect={resolvePendingAttachTarget}
          onCancel={cancelPendingAttachTarget}
        />
      )}

      {pendingStarkeyMove && (
        <StarkeyMoveModal
          state={displayedState}
          playerId={currentPlayer.id}
          cardName={displayedState.allCards[pendingStarkeyMove.cardId]?.name ?? ''}
          onConfirm={resolvePendingStarkeyMove}
          onSkip={skipPendingStarkeyMove}
          onCancel={cancelPendingStarkeyMove}
        />
      )}

      {/* ── Mapa de Nunca Jamás choice ─────────────────────────── */}
      {pendingItemDrop && (
        <ModalStage
          passThrough
          zClass="z-110"
          eyebrow="Mapa de Nunca Jamás"
          title="¿Usar el Mapa?"
          subtitle="Tienes el Mapa en tu Reino: puedes descartarlo para jugar este Objeto gratis."
          widthClass="max-w-lg"
          actions={<>
            <button onClick={() => resolvePendingItemDrop(false)} className="btn btn--secondary">
              Pagar {pendingItemDrop.normalCost} ⚡
            </button>
            <button onClick={() => resolvePendingItemDrop(true)} className="btn btn--primary">
              Usar Mapa · gratis
            </button>
          </>}
        />
      )}

      {isHumanTurn && <VanquishModal ap={ap} state={displayedState} playerId={currentPlayer.id} />}
      {/* Trampa (fase 2): Vencer gratuito tras mover el Aliado */}
      {isHumanTurn && state.trampaVanquish === currentPlayer.id && (
        <VanquishModal ap={ap} state={displayedState} playerId={currentPlayer.id} free />
      )}
      {state.pendingAuroraHero && <AuroraModal state={state} />}
      {state.pendingJaqueca    && <JaquecaModal state={state} />}
      {state.pendingCondition  && <ConditionModal state={state} />}
      {state.pendingFate && (
        <FateModal
          state={state}
          onFateDragStart={setFateDragCardId}
          onFateDragEnd={() => setFateDragCardId(null)}
          onFateSelect={setFateDragCardId}
        />
      )}
      {state.pendingCuervo    && <CuervoModal state={state} />}
      {state.pendingDemosles  && <DemoslesModal state={state} />}
      {state.pendingWicketPick && <WicketPickModal state={state} />}
      {state.pendingShrinkPick && <ShrinkPickModal state={state} />}
      {state.pendingEnlargeTarget && <EnlargeTargetModal state={state} />}
      {state.pendingShrinkSlotChoice && <ShrinkSlotModal state={state} />}
      {state.pendingShotReveal && <ShotRevealModal state={state} />}
      {historyOpen && <HistoryModal state={displayedState} onClose={() => setHistoryOpen(false)} />}
      {guide && (
        <VillainGuideModal
          state={displayedState}
          playerId={guide.playerId}
          initialTab={guide.tab}
          onClose={() => setGuide(null)}
        />
      )}
      {showHookDeck && <HookDeckModal state={displayedState} onClose={() => setShowHookDeck(false)} />}
      {floraOpen && floraVictim && (
        <FloraRevealModal state={displayedState} victim={floraVictim} onClose={() => setFloraOpen(false)} />
      )}
    </div>
  );
}


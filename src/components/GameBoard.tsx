import { useState, useEffect, useRef } from 'react';
import { TurnPhase, CardType, ActionType } from '../core/types';
import type { CardInst, GameState } from '../core/types';
import { CardDefId, EffectId } from '../core/villains/effectIds';
import { getEffectDef, getPlugin } from '../core/villains/registry';
import { PlayerBoard } from './PlayerBoard';
import { ActionPanel } from './ActionPanel';
import { FateModal } from './FateModal';
import { CuervoModal } from './CuervoModal';
import { DemoslesModal } from './DemoslesModal';
import { ConditionModal } from './ConditionModal';
import { HistoryModal } from './HistoryModal';
import { HookDeckModal } from './HookDeckModal';
import { AuroraModal } from './AuroraModal';
import { JaquecaModal } from './JaquecaModal';
import { VanquishModal } from './VanquishModal';
import { FloraRevealModal } from './FloraRevealModal';
import { VictoryModal } from './VictoryModal';
import { AttachTargetModal } from './AttachTargetModal';
import { CardComponent } from './CardComponent';
import { TestPage } from './TestPage';
import { useGameStore } from '../state/gameStore';
import { useActionPanelState } from './useActionPanelState';
import { canMovePawn, canPlayCard, canMoveItemAlly, canMoveHero } from '../core/engine/RuleEngine';
import { computeKingdomCostMod } from '../core/engine/stateHelpers';
import { getAvailableSlotIndices, getActionAtSlot } from '../core/engine/slotHelpers';
import { buildPlayCtx, getAttachCandidates } from '../core/ai/contextBuilder';
import { LayoutGrid, RotateCcw, X, ScrollText, Beaker, BookOpen } from 'lucide-react';
import { useSwipe } from '../hooks/useSwipe';

interface Props { state: GameState }

export function GameBoard({ state }: Props) {
  const resetGame       = useGameStore(s => s.resetGame);
  const aiReplayQueue   = useGameStore(s => s.aiReplayQueue);
  const doFateResolve   = useGameStore(s => s.doFateResolve);
  const doActivateRaven  = useGameStore(s => s.doActivateRaven);
  const doActivateSherif = useGameStore(s => s.doActivateSherif);

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [detailCard, setDetailCard]         = useState<CardInst | null>(null);
  const [handOpen, setHandOpen]             = useState(false);
  const [historyOpen, setHistoryOpen]       = useState(false);
  const [floraOpen, setFloraOpen]           = useState(false);
  const [hoveredCardId, setHoveredCardId]   = useState<string | null>(null);
  const [discardIds, setDiscardIds]         = useState<string[]>([]);
  const [dragCardId, setDragCardId]         = useState<string | null>(null);
  const [fateDragCardId, setFateDragCardId] = useState<string | null>(null);
  const [dragBoardCardId, setDragBoardCardId] = useState<string | null>(null);
  const [dragHeroCardId, setDragHeroCardId]   = useState<string | null>(null);
  const [dragRavenId, setDragRavenId]         = useState<string | null>(null);
  const [dragSherifId, setDragSherifId]       = useState<string | null>(null);
  const [pendingItemDrop, setPendingItemDrop] = useState<{ cardId: string; locId: string; mapaId: string; normalCost: number; forcedTargetCardInstId?: string } | null>(null);
  const [pendingAttachTarget, setPendingAttachTarget] = useState<{
    cardId: string; locId: string; reqTarget: 'ALLY' | 'HERO'; candidates: string[];
  } | null>(null);
  const [showTests, setShowTests]           = useState(false);
  const [showHookDeck, setShowHookDeck]     = useState(false);

  // Swipe gesture for closing hand drawer
  const handDrawerSwipe = useSwipe({
    onSwipeRight: () => {
      if (handOpen) {
        setHandOpen(false);
        setHoveredCardId(null);
      }
    },
  });

  // ── AI replay ────────────────────────────────────────────────────────────
  const [replayIndex, setReplayIndex]       = useState(-1);
  const replayRef = useRef(aiReplayQueue);

  // Reinicia el índice de replay cuando llega una nueva cola de jugadas de la IA. Se ajusta
  // durante el render (en vez de en un useEffect) para evitar un commit intermedio con el
  // índice viejo. Los refs no se tocan aquí — solo está permitido fuera del render (abajo).
  const [prevAiReplayQueue, setPrevAiReplayQueue] = useState(aiReplayQueue);
  if (prevAiReplayQueue !== aiReplayQueue) {
    setPrevAiReplayQueue(aiReplayQueue);
    setReplayIndex(aiReplayQueue.length === 0 ? -1 : 0);
  }

  useEffect(() => {
    replayRef.current = aiReplayQueue;
  }, [aiReplayQueue]);

  useEffect(() => {
    if (replayIndex < 0 || replayIndex >= replayRef.current.length) return;
    const id = setTimeout(() => setReplayIndex(i => i + 1), 750);
    return () => clearTimeout(id);
  }, [replayIndex]);

  // Auto-abrir cajón y limpiar selección al activar/desactivar modo descarte
  const isReplaying    = replayIndex >= 0 && replayIndex < aiReplayQueue.length;
  const displayedState = isReplaying ? aiReplayQueue[replayIndex] : state;

  // Descripción de la acción actual (último entry nuevo del log)
  const replayLabel = isReplaying
    ? aiReplayQueue[replayIndex].log[aiReplayQueue[replayIndex].log.length - 1] ?? ''
    : '';

  const currentPlayer = displayedState.players[displayedState.currentPlayerIndex];

  // Single shared action state — used by both tokens (LocationTile) and ActionPanel
  const ap = useActionPanelState(displayedState, currentPlayer.id);

  // Auto-abrir cajón al activar modo descarte o jugar carta. Ajustado durante el render
  // (mismo motivo que el replay arriba) en vez de en un useEffect.
  const [prevPendingAction, setPrevPendingAction] = useState(ap.pendingAction);
  if (prevPendingAction !== ap.pendingAction) {
    setPrevPendingAction(ap.pendingAction);
    if (ap.pendingAction === ActionType.DISCARD || ap.pendingAction === ActionType.PLAY_CARD) {
      setHandOpen(true);
      if (ap.pendingAction === ActionType.DISCARD) setDiscardIds([]);
    } else {
      setDiscardIds([]);
    }
  }

  const phaseLabels: Record<TurnPhase, string> = {
    [TurnPhase.MOVE]:     'MOVER',
    [TurnPhase.ACTIVATE]: 'ACCIONES',
    [TurnPhase.DRAW]:     'ROBAR',
  };

  const phaseColors: Record<TurnPhase, string> = {
    [TurnPhase.MOVE]:     'text-tertiary border-tertiary/50 bg-tertiary/10',
    [TurnPhase.ACTIVATE]: 'text-secondary-container border-secondary-container/50 bg-secondary-container/10',
    [TurnPhase.DRAW]:     'text-primary border-primary/50 bg-primary/10',
  };

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
    if (!activeFateCardId || !state.pendingFate) return undefined;
    const card = state.allCards[activeFateCardId];
    if (!card || card.cardType === CardType.EFFECT) return undefined;
    const targetPlayer = state.players[state.pendingFate.targetPlayerIndex];
    const { locations }  = getPlugin(targetPlayer.villainId);

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

  function handleCardDrop(locId: string) {
    const cardId = dragCardId ?? selectedCardId;
    if (!cardId || !isHumanTurn) return;
    if (!currentPlayer.handInstIds.includes(cardId)) return;
    const pawnLoc  = currentPlayer.pawnLocationId;
    const avail    = getAvailableSlotIndices(displayedState, currentPlayer.id, pawnLoc);
    const slotIdx  = avail.find(i => getActionAtSlot(displayedState, currentPlayer.id, i)?.type === ActionType.PLAY_CARD);
    if (slotIdx === undefined) return;
    if (!canPlayCard(displayedState, currentPlayer.id, cardId, slotIdx, locId).valid) return;

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
    continuePlayCard(cardId, locId, targetCardInstId);
  }

  function cancelPendingAttachTarget() {
    setPendingAttachTarget(null);
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

    if (card.cardType === CardType.ITEM) {
      const heroAtLoc = targetPlayer.locationStates[locId]?.heroCardInstIds[0];
      if (heroAtLoc) ctx.targetCardInstId = heroAtLoc;
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
    <div className="flex flex-col min-h-screen bg-background" key={isReplaying ? 'replay' : 'live'}>

      {/* ── Fixed Nav ───────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-100 h-12 bg-surface-container-low/95 backdrop-blur-md border-b border-outline-variant/30 flex items-center justify-between px-4 md:px-6 shadow-md">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-primary-fixed-dim" />
            <span className="font-serif italic text-base text-on-surface leading-none tracking-tight">
              Villainous
            </span>
          </div>
          <div className="hidden sm:block h-4 w-px bg-outline-variant/40" />
          <span className="hidden sm:inline font-stats text-[10px] text-on-surface-variant uppercase tracking-[0.15em]">
            Turno activo: {currentPlayer.name}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {floraVictim && (
            <button
              onClick={() => setFloraOpen(true)}
              title={`Ver cartas de ${floraVictim.name}`}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-error/50 bg-error/10 text-error font-stats text-[9px] uppercase tracking-wider hover:bg-error/20 transition-all animate-pulse"
            >
              ✦ Cartas de {floraVictim.name}
            </button>
          )}
          {!state.winner && (
            <span className={`font-stats text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${phaseColors[state.turnPhase]}`}>
              {phaseLabels[state.turnPhase]}
            </span>
          )}
          <span className="font-stats text-xs text-on-surface-variant">R{state.roundNumber}</span>
          <button
            onClick={() => setHistoryOpen(true)}
            title="Ver histórico"
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <ScrollText className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowHookDeck(true)}
            title="Cartas de Garfio"
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <BookOpen className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowTests(true)}
            title="Pruebas de modales"
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <Beaker className="w-4 h-4" />
          </button>
          <button onClick={resetGame} title="Nueva partida" className="text-on-surface-variant hover:text-primary transition-colors">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* ── AI replay banner ────────────────────────────────── */}
      {isReplaying && (
        <div className="fixed top-12 inset-x-0 z-90 flex items-center justify-center gap-3 px-6 py-2.5 bg-surface-container-low/95 backdrop-blur-md border-b border-tertiary/30">
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
      {displayedState.winner && (
        <VictoryModal state={displayedState} onPlayAgain={resetGame} />
      )}

      {/* ── Main scrollable content ─────────────────────────── */}
      <main className={`w-full px-4 md:px-8 pb-48 flex flex-col gap-12 md:gap-16 max-w-375 mx-auto ${isReplaying ? 'pt-24' : displayedState.winner ? 'pt-28' : 'pt-16'}`}>
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
              onCardClick={(id) => {
                const card = displayedState.allCards[id];
                if (card) setDetailCard(card);
              }}
              playHighlights={
                dragRavenId       ? (isActive  ? ravenDropHighlights  : undefined) :
                dragSherifId      ? (isActive  ? sherifDropHighlights : undefined) :
                activeFateCardId  ? (isFateTgt ? fateHighlights       : undefined) :
                dragBoardCardId   ? (isActive  ? moveBoardHighlights  : undefined) :
                dragHeroCardId    ? (isActive  ? moveHeroHighlights   : undefined) :
                                    (isActive  ? playHighlights       : undefined)
              }
              onCardDrop={
                dragRavenId       ? (isActive  ? handleRavenDrop        : undefined) :
                dragSherifId      ? (isActive  ? handleSherifDrop       : undefined) :
                activeFateCardId  ? (isFateTgt ? handleFateDrop         : undefined) :
                dragBoardCardId   ? (isActive  ? handleBoardCardDrop    : undefined) :
                dragHeroCardId    ? (isActive  ? handleHeroCardDrop     : undefined) :
                (isActive && state.turnPhase === TurnPhase.ACTIVATE ? handleCardDrop : undefined)
              }
              onVillainCardDragStart={
                isActive && state.turnPhase === TurnPhase.ACTIVATE
                  ? (cardId) => setDragBoardCardId(cardId)
                  : undefined
              }
              onVillainCardDragEnd={() => setDragBoardCardId(null)}
              onHeroCardDragStart={
                isActive && state.turnPhase === TurnPhase.ACTIVATE
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
                (activeFateCardId && isFateTgt) ? (locId) => handleFateDrop(locId) :
                (isActive && state.turnPhase === TurnPhase.ACTIVATE && selectedCardId)
                  ? (locId) => handleCardDrop(locId)
                  : undefined
              }
              movableLocIds={movableLocIds}
            />
          );
        })}
      </main>

      {/* ── Action panel (human player only) ───────────────── */}
      {isHumanTurn && (
        <div className="fixed bottom-0 inset-x-0 z-40 max-w-375 mx-auto px-4 md:px-8">
          <ActionPanel ap={ap} state={displayedState} playerId={currentPlayer.id} selectedCardId={selectedCardId} detailCardOpen={!!detailCard} handCount={handCards.length} handRevealed={handRevealed} onToggleHand={() => setHandOpen(o => !o)} />
        </div>
      )}

      {/* ── AI indicator ────────────────────────────────────── */}
      {!state.winner && currentPlayer.isAI && (
        <div className="fixed bottom-0 inset-x-0 z-40 flex justify-center">
          <div className="bg-surface-container-low/90 backdrop-blur-md border-t border-tertiary/40 px-6 py-2 text-tertiary font-stats text-xs italic tracking-widest uppercase">
            La IA ({currentPlayer.name}) está jugando…
          </div>
        </div>
      )}

      {/* ── Hand drawer (human player only) ─────────────────── */}
      {isHumanTurn && (
        <>
          {/* Pestaña disparadora — DESKTOP (lateral derecha) — siempre visible */}
          <button
            onClick={() => setHandOpen(o => !o)}
            className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 z-110 flex-col items-center justify-center gap-2 bg-surface-container-highest/95 backdrop-blur-md border border-r-0 border-outline-variant/40 rounded-l-xl px-2 py-4 hover:bg-surface-container/95 transition-colors shadow-xl"
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center font-stats text-[10px] font-bold ${handRevealed ? 'bg-error/20 text-error' : handCards.length === 0 ? 'bg-outline-variant/20 text-on-surface-variant/40' : 'bg-primary/15 text-primary'}`}>
              {handCards.length}
            </span>
            <span
              className="font-stats text-[9px] uppercase tracking-[0.2em] text-on-surface-variant"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              MANO{handRevealed && <span className="text-error"> !</span>}
            </span>
          </button>

          {/* Backdrop */}
          {handOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]"
              onClick={() => { setHandOpen(false); setHoveredCardId(null); }}
            />
          )}


          {/* Preview de carta al hover — aparece a la izquierda del cajón */}
          {handOpen && hoveredCardId && (() => {
            const hc = state.allCards[hoveredCardId];
            if (!hc) return null;
            return (
              <div className="hidden lg:block fixed top-1/2 -translate-y-1/2 z-50 pointer-events-none" style={{ right: 'calc(16rem + 90px)' }}>
                <div className="villainous-card-preview-wrap">
                  <div className="villainous-card-preview">
                    <CardComponent card={hc} state={state} />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Cajón deslizante */}
          <div
            {...handDrawerSwipe}
            className={`fixed bottom-0 lg:top-12 lg:bottom-12 lg:right-0 left-0 lg:left-auto right-0 z-50 w-full lg:w-64 max-h-[60vh] lg:max-h-none bg-surface-container-highest/98 backdrop-blur-xl border-t lg:border-t-0 lg:border-l border-outline-variant/40 shadow-2xl flex flex-col transition-transform duration-300 ${
              handOpen ? 'translate-y-0 lg:translate-x-0' : 'translate-y-full lg:translate-y-0 lg:translate-x-full'
            }`}
          >
            {/* Cabecera */}
            <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${ap.pendingAction === ActionType.DISCARD ? 'border-error/30 bg-error/5' : 'border-outline-variant/20'}`}>
              <div>
                <h3 className={`font-serif text-sm ${ap.pendingAction === ActionType.DISCARD ? 'text-error' : 'text-on-surface'}`}>
                  {ap.pendingAction === ActionType.DISCARD ? 'Selecciona cartas a descartar' : 'Tu mano'}
                </h3>
                <p className="font-stats text-[9px] uppercase tracking-widest text-on-surface-variant/55 mt-0.5">
                  {ap.pendingAction === ActionType.DISCARD
                    ? `${discardIds.length > 0 ? `${discardIds.length} seleccionada(s)` : 'ninguna seleccionada'}`
                    : `${handCards.length} carta${handCards.length !== 1 ? 's' : ''}${handRevealed ? ' · Flora' : ''}`}
                </p>
              </div>
              <button onClick={() => { setHandOpen(false); setHoveredCardId(null); ap.clearPending(); }} className="text-on-surface-variant hover:text-on-surface transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── MÓVIL/TABLET: fila de cartas reales, centradas ── */}
            <div className="lg:hidden flex-1 overflow-x-auto overflow-y-hidden">
              {handCards.length === 0 && (
                <p className="text-[11px] text-on-surface-variant/40 italic px-6 pt-4">Mano vacía — roba en la fase siguiente</p>
              )}
              <div className="flex items-center gap-7 w-max max-w-full mx-auto px-6 py-4 h-full">
                {handCards.map(card => {
                  const isDiscardMode   = ap.pendingAction === ActionType.DISCARD;
                  const isMarkedDiscard = discardIds.includes(card.instId);
                  const isSelected = !isDiscardMode && selectedCardId === card.instId;

                  return (
                    <div
                      key={card.instId}
                      className={`relative shrink-0 transition-transform ${isMarkedDiscard ? 'opacity-50' : ''}`}
                      style={{ transform: isSelected ? 'scale(1.45) translateY(-6px)' : 'scale(1.35)', transformOrigin: 'center', zIndex: isSelected ? 20 : 0 }}
                    >
                      <CardComponent
                        card={card}
                        state={state}
                        selected={isSelected || isMarkedDiscard}
                        onClick={() => {
                          if (isDiscardMode) {
                            setDiscardIds(prev =>
                              prev.includes(card.instId) ? prev.filter(id => id !== card.instId) : [...prev, card.instId]
                            );
                          } else {
                            setSelectedCardId(card.instId);
                            setTimeout(() => setHandOpen(false), 120);
                          }
                        }}
                      />

                      {/* Marca de descarte */}
                      {isDiscardMode && (
                        <div className={`absolute top-1 left-1 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                          isMarkedDiscard ? 'border-error bg-error text-white' : 'border-white/60 bg-black/50 text-white/70'
                        }`}>
                          {isMarkedDiscard ? '✕' : ''}
                        </div>
                      )}

                      {/* Botón detalle */}
                      {!isDiscardMode && (
                        <button
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface-container-highest border border-white/25 text-white/70 text-[10px] font-bold flex items-center justify-center shadow-md active:scale-90 transition-transform"
                          onClick={e => { e.stopPropagation(); setDetailCard(card); }}
                        >i</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── DESKTOP: lista vertical compacta ── */}
            <div className="hidden lg:flex flex-1 overflow-y-auto py-1 flex-col">
              {handCards.length === 0 && (
                <p className="text-[11px] text-on-surface-variant/40 italic px-4 pt-3">Mano vacía</p>
              )}
              {handCards.map(card => {
                const isDiscardMode   = ap.pendingAction === ActionType.DISCARD;
                const isMarkedDiscard = discardIds.includes(card.instId);
                const cost       = Math.max(0, card.baseCost + card.costModifier);
                const isSelected = !isDiscardMode && selectedCardId === card.instId;
                const isHovered  = hoveredCardId === card.instId;
                const isCurse    = card.cardType === CardType.CURSE;

                return (
                  <div
                    key={card.instId}
                    draggable={!isDiscardMode}
                    onDragStart={!isDiscardMode ? (e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      setDragCardId(card.instId);
                      setSelectedCardId(card.instId);
                      setTimeout(() => setHandOpen(false), 0);
                    } : undefined}
                    onDragEnd={!isDiscardMode ? () => setDragCardId(null) : undefined}
                    onMouseEnter={() => !isDiscardMode && setHoveredCardId(card.instId)}
                    onMouseLeave={() => setHoveredCardId(null)}
                    onClick={() => {
                      if (isDiscardMode) {
                        setDiscardIds(prev =>
                          prev.includes(card.instId) ? prev.filter(id => id !== card.instId) : [...prev, card.instId]
                        );
                      } else {
                        setSelectedCardId(card.instId);
                        setTimeout(() => setHandOpen(false), 100);
                      }
                    }}
                    className={`relative flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-all border-b border-outline-variant/10 last:border-b-0 ${
                      isDiscardMode
                        ? isMarkedDiscard ? 'bg-error/10 opacity-60' : 'hover:bg-error/5'
                        : dragCardId === card.instId ? 'opacity-40 cursor-grab' : 'cursor-grab active:cursor-grabbing'
                    }`}
                    style={!isDiscardMode ? {
                      background: isHovered
                        ? `${CARD_GRADIENTS[card.cardType]?.split(' ')[0].replace('linear-gradient(160deg,', '').trim().replace(',', '')}22`
                        : isSelected ? 'rgba(233,195,73,0.06)' : 'transparent',
                      borderLeft: isSelected ? '2px solid #e9c349' : isHovered ? `2px solid ${isCurse ? '#a855f7' : 'rgba(211,188,249,0.5)'}` : '2px solid transparent',
                    } : {
                      borderLeft: isMarkedDiscard ? '2px solid #ef4444' : '2px solid transparent',
                    }}
                  >
                    {/* Checkbox de descarte o coste */}
                    {isDiscardMode ? (
                      <div className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all ${
                        isMarkedDiscard ? 'border-error bg-error text-white' : 'border-outline-variant/40 text-on-surface-variant/30'
                      }`}>
                        {isMarkedDiscard ? '✕' : '○'}
                      </div>
                    ) : (
                      <div
                        className="w-6 h-6 shrink-0 rounded-full border flex items-center justify-center font-stats text-[10px] font-bold"
                        style={{
                          borderColor: isCurse ? '#a855f7' : '#6b7280',
                          color:       isCurse ? '#e9d5ff' : '#d1d5db',
                          background:  'rgba(0,0,0,0.4)',
                        }}
                      >
                        {cost}
                      </div>
                    )}

                    {/* Nombre + tipo */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12px] font-semibold leading-tight truncate ${
                        isDiscardMode ? (isMarkedDiscard ? 'text-error/80 line-through' : 'text-on-surface/90') : isSelected ? 'text-[#e9c349]' : 'text-on-surface/90'
                      }`}>
                        {card.name}
                      </div>
                      <div className="font-stats text-[8px] uppercase tracking-widest text-on-surface-variant/45 mt-0.5">
                        {TYPE_LABELS_ES[card.cardType] ?? card.cardType}
                        {card.baseStrength !== undefined && (
                          <span className="ml-1.5 text-yellow-400/60">⚔{card.baseStrength}</span>
                        )}
                      </div>
                    </div>

                    {/* Botón detalle */}
                    {!isDiscardMode && (
                      <button
                        className="shrink-0 w-4 h-4 rounded-full bg-white/5 border border-white/15 text-white/50 text-[8px] font-bold flex items-center justify-center hover:bg-white/10 transition-colors"
                        onClick={e => { e.stopPropagation(); setDetailCard(card); }}
                      >i</button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pie del cajón en modo descarte */}
            {ap.pendingAction === ActionType.DISCARD && (
              <div className="border-t border-error/20 px-4 py-3 flex items-center gap-3 shrink-0">
                <button
                  onClick={() => { ap.clearPending(); setDiscardIds([]); setHandOpen(false); }}
                  className="text-on-surface-variant/50 hover:text-on-surface font-stats text-[10px] uppercase tracking-wider transition-colors"
                >
                  Cancelar
                </button>
                <button
                  disabled={discardIds.length === 0 || ap.pendingSlot === null}
                  onClick={() => {
                    if (ap.pendingSlot === null || discardIds.length === 0) return;
                    ap.store.doDiscardFromHand(discardIds, ap.pendingSlot);
                    ap.clearPending();
                    setDiscardIds([]);
                    setHandOpen(false);
                  }}
                  className="ml-auto px-4 py-1.5 rounded-xl border border-error/50 bg-error/10 text-error font-stats text-[10px] uppercase tracking-wider hover:bg-error/20 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                >
                  Descartar {discardIds.length > 0 ? discardIds.length : ''}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Card preview (click en tablero) ─────────────────── */}
      {detailCard && (() => {
        const dc = detailCard;
        return (
          <>
            <div className="fixed inset-0 z-70 bg-black/40" onClick={() => setDetailCard(null)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-71 pointer-events-none flex flex-col items-center gap-3">
              <div className="villainous-card-preview-lg-wrap">
                <div className="villainous-card-preview-lg">
                  <CardComponent card={dc} state={state} />
                </div>
              </div>
            </div>
          </>
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

      {/* ── Mapa de Nunca Jamás choice ─────────────────────────── */}
      {pendingItemDrop && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-110 backdrop-blur-sm">
          <div className="bg-surface-container-highest border border-tertiary/30 rounded-2xl shadow-2xl flex flex-col gap-4 p-5 w-full max-w-xs mx-4">
            <div>
              <h2 className="font-serif text-base text-on-surface">Mapa de Nunca Jamás</h2>
              <p className="text-[11px] text-on-surface-variant/70 mt-1 leading-snug">
                Tienes el Mapa en el reino. ¿Descartarlo para jugar este objeto gratis?
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => resolvePendingItemDrop(true)}
                className="px-4 py-2.5 rounded-xl border border-tertiary/50 bg-tertiary/10 text-tertiary font-stats text-xs uppercase tracking-wider hover:bg-tertiary/20 transition-colors"
              >
                Usar Mapa — gratis
              </button>
              <button
                onClick={() => resolvePendingItemDrop(false)}
                className="px-4 py-2.5 rounded-xl border border-outline-variant/40 text-on-surface-variant font-stats text-xs uppercase tracking-wider hover:border-outline hover:text-on-surface transition-colors"
              >
                Pagar normalmente — {pendingItemDrop.normalCost} ⚡
              </button>
            </div>
          </div>
        </div>
      )}

      {isHumanTurn && <VanquishModal ap={ap} state={displayedState} playerId={currentPlayer.id} />}
      {state.pendingAuroraHero && <AuroraModal state={state} />}
      {state.pendingJaqueca    && <JaquecaModal state={state} />}
      {state.pendingCondition  && <ConditionModal state={state} />}
      {state.pendingFate && (
        <FateModal
          state={state}
          onFateDragStart={setFateDragCardId}
          onFateDragEnd={() => setFateDragCardId(null)}
          onCardDetail={setDetailCard}
          onFateSelect={setFateDragCardId}
        />
      )}
      {state.pendingCuervo    && <CuervoModal state={state} />}
      {state.pendingDemosles  && <DemoslesModal state={state} />}
      {historyOpen && <HistoryModal state={displayedState} onClose={() => setHistoryOpen(false)} />}
      {showHookDeck && <HookDeckModal state={displayedState} onClose={() => setShowHookDeck(false)} />}
      {floraOpen && floraVictim && (
        <FloraRevealModal state={displayedState} victim={floraVictim} onClose={() => setFloraOpen(false)} />
      )}
    </div>
  );
}

const CARD_GRADIENTS: Record<string, string> = {
  ALLY:      'linear-gradient(160deg, #1a3320 0%, #0f1a12 100%)',
  ITEM:      'linear-gradient(160deg, #1a2b3a 0%, #0f1520 100%)',
  EFFECT:    'linear-gradient(160deg, #2a1a35 0%, #15101f 100%)',
  CURSE:     'linear-gradient(160deg, #1a1025 0%, #0e0c18 100%)',
  HERO:      'linear-gradient(160deg, #3a2010 0%, #1f1008 100%)',
  CONDITION: 'linear-gradient(160deg, #2a2a10 0%, #181808 100%)',
};

const TYPE_LABELS_ES: Record<string, string> = {
  ALLY:      'Aliado',
  ITEM:      'Objeto',
  EFFECT:    'Efecto',
  CURSE:     'Maldición',
  HERO:      'Héroe',
  CONDITION: 'Condición',
};

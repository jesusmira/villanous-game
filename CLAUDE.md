# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server at http://localhost:5173
npm run build     # tsc -b && vite build (type-check + bundle)
npm run lint      # eslint .
npm run preview   # Preview the production build
```

There is no test suite. `npm run build` is the primary correctness check — it runs full TypeScript type-checking before bundling.

## TypeScript Constraints

`tsconfig.app.json` enables several strict flags that affect how code must be written:

**`verbatimModuleSyntax: true`** — type-only imports must use `import type`. Always split imports:
```typescript
import { CardType, TurnPhase } from '../types';        // runtime values (const objects)
import type { GameState, CardInst, PlayerId } from '../types';  // interfaces / type aliases
```

**`erasableSyntaxOnly: true`** — TypeScript `enum` is forbidden. Use the const-object + type-alias pattern instead:
```typescript
export const TurnPhase = { MOVE: 'MOVE', ACTIVATE: 'ACTIVATE', DRAW: 'DRAW' } as const;
export type TurnPhase = (typeof TurnPhase)[keyof typeof TurnPhase];
```

**`noUnusedLocals` / `noUnusedParameters: true`** — prefix intentionally unused parameters with `_` (e.g. `_ctx`, `_state`).

## Architecture

### Core / UI separation

`src/core/` has **zero React imports**. Everything in it is pure TypeScript — deterministic functions from `GameState → GameState`. React lives only in `src/components/` and `src/state/`.

### Data flow

```
GameSetup (UI) → useGameStore.initGame
                       ↓
               GameEngine (pure)  ←→  RuleEngine (validation)
                       ↓                      ↑
               EffectEngine (runs EffectDef.execute)
                       ↓
               VillainPlugin registry (card/effect definitions)
                       ↓
               useGameStore (Zustand) → React components
```

### State model

`GameState` is fully immutable — every engine function returns a new state object. The central store (`src/state/gameStore.ts`) calls `maybeRunAI()` after turn-ending actions (`initGame`, `doDrawCards`) so the AI runs synchronously before the next render.

`allCards: Record<CardInstId, CardInst>` is a flat map of every card instance in the game. Card instances carry **denormalized** data (name, baseCost, cardType, effectIds) so the engine never needs to look up `CardDef` during play. `locationStates` inside `PlayerState` hold only `CardInstId[]` arrays — always resolve through `state.allCards[id]` to get the actual card.

### Villain plugin system

Each villain lives in `src/core/villains/<id>/index.ts` and exports a `VillainPlugin` object. It self-registers into `src/core/villains/registry.ts` which builds lookup maps at module load time.

A `VillainPlugin` contains:
- `locations: LocationDef[]` — board layout with action slots and adjacency
- `villainCardDefs` / `fateCardDefs: CardDef[]` — static card definitions
- `effects: EffectDef[]` — effect handlers (Strategy pattern); each has a `trigger` and an `execute: (state, ctx) => GameState`
- `checkWinCondition: (state, playerId) => boolean` — evaluated after every state mutation

To add a new villain: create `src/core/villains/<id>/index.ts`, export a `VillainPlugin`, import and register it in `registry.ts`, and add its id to the `VillainId` union in `types.ts`.

### Effect system

`EffectDef.trigger` controls when an effect fires:
- `ON_PLAY` — fired by `EffectEngine.runEffects()` when a card is played or a fate card resolves
- `ACTIVATED` — fired when the player uses the ACTIVATE_CARD action slot
- `CONTINUOUS` — not fired; instead `EffectDef.computeStrengthBonus` is called by `getEffectiveStrength()` in stateHelpers

### Turn phases

`MOVE → ACTIVATE → DRAW`. The pawn moves in MOVE; `usedActionSlotIndices` tracks which action slots have been consumed in ACTIVATE; `endActivatePhase` transitions to DRAW; `drawCards` calls `endTurn` which advances `currentPlayerIndex` and resets to MOVE.

Hero cards at a location cover action slots from the left — the number of heroes equals the number of blocked slots (index 0, 1, ...).

### AI

`src/core/ai/AIPlayer.ts` exports `runAITurn(state): GameState` which handles all three phases in one synchronous call. It uses a scoring heuristic (`scoreLocation`, `scoreCard`) with villain-specific bonuses (Maleficent prioritizes curse placement; Hook prioritizes Ambush → unlock Hangman → move Peter Pan → Vanquish at Jolly Roger).

/// <reference lib="webworker" />
// El worker es solo el transporte: toda la lógica vive en runAIStep (reutilizable
// también por el simulador headless scripts/simulate.ts).
import { runAIStep } from './runAIStep';
import type { GameState } from '../types';
import type { AIStepResult } from './runAIStep';
import type { OpponentProfile } from './opponentModel';

export type AIWorkerResponse = AIStepResult;
export interface AIWorkerRequest {
  state: GameState;
  /** Perfil del jugador humano (Fase 2), construido desde el historial de partidas. */
  profile?: OpponentProfile;
}

self.onmessage = (e: MessageEvent<AIWorkerRequest>) => {
  const response: AIWorkerResponse = runAIStep(e.data.state, e.data.profile);
  self.postMessage(response);
};

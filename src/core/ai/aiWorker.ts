/// <reference lib="webworker" />
// El worker es solo el transporte: toda la lógica vive en runAIStep (reutilizable
// también por el simulador headless scripts/simulate.ts).
import { runAIStep } from './runAIStep';
import type { GameState } from '../types';
import type { AIStepResult } from './runAIStep';

export type AIWorkerResponse = AIStepResult;

self.onmessage = (e: MessageEvent<GameState>) => {
  const response: AIWorkerResponse = runAIStep(e.data);
  self.postMessage(response);
};

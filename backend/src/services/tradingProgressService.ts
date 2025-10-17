import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

import type { TradingAgentsDecision } from '../taEngine/types.js';
import type { TradingAnalystId } from '../constants/tradingAgents.js';

export type ProgressStage =
  | 'queued'
  | 'analysts'
  | 'investment_debate'
  | 'research_manager'
  | 'trader'
  | 'risk_debate'
  | 'risk_manager'
  | 'finalizing';

export interface ProgressEvent {
  runId: string;
  stage: ProgressStage;
  label: string;
  percent?: number;
  message?: string;
  iteration?: number;
  timestamp: number;
  modelId?: string;
  analysts?: TradingAnalystId[];
}

interface ProgressState {
  events: ProgressEvent[];
  clients: Set<Response>;
  completed?: boolean;
  result?: TradingAgentsDecision;
  error?: string;
}

const progressRuns = new Map<string, ProgressState>();

const sendSse = (res: Response, event: string, data: unknown) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const getOrCreateState = (runId: string): ProgressState => {
  let state = progressRuns.get(runId);
  if (!state) {
    state = {
      events: [],
      clients: new Set<Response>(),
    };
    progressRuns.set(runId, state);
  }
  return state;
};

export const generateRunId = (): string => randomUUID();

export const initializeProgress = (runId: string): void => {
  const state = getOrCreateState(runId);
  state.events = [];
  state.completed = false;
  delete state.error;
  delete state.result;
};

export const publishProgressEvent = (runId: string, event: Omit<ProgressEvent, 'timestamp'>): void => {
  const state = getOrCreateState(runId);
  const payload: ProgressEvent = { ...event, timestamp: Date.now() };
  state.events.push(payload);
  for (const client of state.clients) {
    sendSse(client, 'progress', payload);
  }
};

export const publishCompletion = (runId: string, result: TradingAgentsDecision): void => {
  const state = getOrCreateState(runId);
  state.completed = true;
  state.result = result;
  for (const client of state.clients) {
    sendSse(client, 'complete', { runId, result });
  }
  cleanupIfPossible(runId);
};

export const publishError = (runId: string, message: string): void => {
  const state = getOrCreateState(runId);
  state.completed = true;
  state.error = message;
  for (const client of state.clients) {
    sendSse(client, 'error', { runId, message });
  }
  cleanupIfPossible(runId);
};

const cleanupIfPossible = (runId: string): void => {
  const state = progressRuns.get(runId);
  if (!state) return;
  if (state.clients.size === 0) {
    progressRuns.delete(runId);
  } else {
    // allow clients to finish streaming; they will trigger cleanup on close
    setTimeout(() => {
      const existing = progressRuns.get(runId);
      if (existing && existing.completed && existing.clients.size === 0) {
        progressRuns.delete(runId);
      }
    }, 1000 * 60); // 1 minute grace period
  }
};

export const attachProgressStream = (runId: string, res: Response): void => {
  const state = getOrCreateState(runId);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();
  res.write(': connected\n\n');

  state.clients.add(res);

  const sendHistory = () => {
    for (const event of state.events) {
      sendSse(res, 'progress', event);
    }
    if (state.completed) {
      if (state.result) {
        sendSse(res, 'complete', { runId, result: state.result });
      } else if (state.error) {
        sendSse(res, 'error', { runId, message: state.error });
      }
      res.write('event: close\ndata: {}\n\n');
      res.end();
    }
  };

  sendHistory();

  const keepAlive = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepAlive);
      return;
    }
    res.write(': keepalive\n\n');
  }, 15_000);

  res.on('close', () => {
    clearInterval(keepAlive);
    state.clients.delete(res);
    if (state.clients.size === 0 && state.completed) {
      progressRuns.delete(runId);
    }
  });
};

import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { env } from '../config/env.js';
import type { TradingAgentsDecision, TradingAgentsPayload } from '../taEngine/types.js';
import type { TradingAnalystId } from '../constants/tradingAgents.js';
import { publishProgressEvent, type ProgressStage } from './tradingProgressService.js';

type MockRunOptions = {
  runId?: string;
  modelId: string;
  analysts: TradingAnalystId[];
};

type Mode = 'mock' | 'live';

const MOCK_MODE: Mode = 'mock';

const STAGE_SEQUENCE: Array<{ stage: Exclude<ProgressStage, 'queued'>; label: string; percent: number }> = [
  { stage: 'analysts', label: 'Running analyst stage', percent: 15 },
  { stage: 'investment_debate', label: 'Investment debate', percent: 40 },
  { stage: 'research_manager', label: 'Research manager synthesis', percent: 60 },
  { stage: 'trader', label: 'Trader finalizing execution plan', percent: 75 },
  { stage: 'risk_debate', label: 'Risk debate sanity checks', percent: 85 },
  { stage: 'risk_manager', label: 'Risk manager approvals', percent: 92 },
  { stage: 'finalizing', label: 'Persisting mock outputs', percent: 100 },
];

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const MIN_STAGE_DELAY_MS = 200;

const computeStageDelays = (totalDurationMs: number): number[] => {
  const stageCount = STAGE_SEQUENCE.length;
  const safeTotal = Math.max(totalDurationMs, stageCount * MIN_STAGE_DELAY_MS);
  const baseDelay = Math.floor(safeTotal / stageCount);
  let remainder = safeTotal - baseDelay * stageCount;
  return STAGE_SEQUENCE.map(() => {
    let delay = baseDelay;
    if (remainder > 0) {
      delay += 1;
      remainder -= 1;
    }
    return delay;
  });
};

let cachedFixture: TradingAgentsDecision | null | undefined;

const loadFixtureDecision = async (): Promise<TradingAgentsDecision | null> => {
  if (!env.tradingAgentsMockFixture) {
    return null;
  }
  if (cachedFixture !== undefined) {
    return cachedFixture;
  }

  try {
    const fixturePath = env.tradingAgentsMockFixture;
    const absolutePath = isAbsolute(fixturePath)
      ? fixturePath
      : resolve(process.cwd(), fixturePath);
    const raw = await readFile(absolutePath, 'utf8');
    const parsed = JSON.parse(raw) as TradingAgentsDecision;
    cachedFixture = parsed;
  } catch (error) {
    console.warn(
      `[tradingAgentsMockService] Failed to load mock fixture from ${env.tradingAgentsMockFixture}:`,
      error,
    );
    cachedFixture = null;
  }

  return cachedFixture;
};

const generateDefaultDecision = (
  payload: TradingAgentsPayload,
  options: MockRunOptions,
): TradingAgentsDecision => ({
  symbol: payload.symbol,
  tradeDate: payload.tradeDate,
  decision: 'BUY',
  finalTradeDecision: 'BUY',
  executionMs: null,
  traderPlan: [
    `### Execution Plan for ${payload.symbol}`,
    '- Entry: Stage into the position near the 10-day VWAP with a half-size starter.',
    '- Stop: Cut the trade if price closes below the 50-day SMA or breaches -3.5% from entry.',
    '- Targets: Scale out at +5% and trail a stop at +8% using a daily close trigger.',
    '- Positioning: Keep risk per trade under 75 bps of book to stay within mandate.',
  ].join('\n'),
  investmentPlan: [
    `### Research Manager Summary (${payload.symbol})`,
    'The mock workflow integrates analyst briefs across fundamentals, market structure, and sentiment.',
    'Key factors include accelerating revenue growth, supportive macro datapoints, and constructive positioning.',
    'This simulated run is safe to use for UI verification without incurring OpenAI costs.',
  ].join('\n\n'),
  investmentJudge: 'Investment committee (mock) approves proceeding with scaled entry.',
  riskJudge: [
    '### Risk Manager Commentary',
    'Scenario analysis favors a controlled upside skew. Ensure position sizing reflects mock capital constraints.',
  ].join('\n'),
  marketReport: 'Mock market report placeholder -- substitute with live data when mock mode is disabled.',
  sentimentReport: 'Mock sentiment baselines indicate neutral-to-positive chatter.',
  newsReport: 'No material breaking news in mock mode. Use live mode for real catalysts.',
  fundamentalsReport: 'Mock fundamentals snapshot referencing last reported quarter.',
  modelId: options.modelId,
  analysts: options.analysts,
});

export const runMockTradingAgentsDecision = async (
  payload: TradingAgentsPayload,
  options: MockRunOptions,
): Promise<TradingAgentsDecision> => {
  const start = Date.now();
  const totalDurationTarget = Math.max(
    env.tradingAgentsMockDurationMs ?? 20_000,
    STAGE_SEQUENCE.length * MIN_STAGE_DELAY_MS,
  );
  const stageDelays = computeStageDelays(totalDurationTarget);
  if (options.runId) {
    for (const [index, stage] of STAGE_SEQUENCE.entries()) {
      await sleep(stageDelays[index] ?? MIN_STAGE_DELAY_MS);
      publishProgressEvent(options.runId, {
        runId: options.runId,
        stage: stage.stage,
        label: stage.label,
        percent: stage.percent,
        ...(stage.stage === 'analysts'
          ? { modelId: options.modelId, analysts: options.analysts }
          : {}),
        mode: MOCK_MODE,
      });
    }
  } else {
    await sleep(totalDurationTarget);
  }

  const fixture = await loadFixtureDecision();
  const base = fixture
    ? (JSON.parse(JSON.stringify(fixture)) as TradingAgentsDecision)
    : generateDefaultDecision(payload, options);

  const decision: TradingAgentsDecision = {
    ...base,
    symbol: payload.symbol,
    tradeDate: payload.tradeDate,
    modelId: options.modelId,
    analysts: options.analysts,
  };

  if (!decision.decision && decision.finalTradeDecision) {
    decision.decision = decision.finalTradeDecision;
  } else if (!decision.decision) {
    decision.decision = 'HOLD';
  }
  if (!decision.finalTradeDecision) {
    decision.finalTradeDecision = decision.decision ?? 'HOLD';
  }
  const elapsed = Date.now() - start;
  decision.executionMs =
    typeof decision.executionMs === 'number' && Number.isFinite(decision.executionMs)
      ? Math.max(decision.executionMs, elapsed)
      : elapsed;

  return decision;
};

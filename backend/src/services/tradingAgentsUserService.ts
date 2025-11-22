import { and, desc, eq } from 'drizzle-orm';

import { DEFAULT_TRADING_ANALYSTS, type TradingAnalystId } from '../constants/tradingAgents.js';
import { TOOL_IDS, type ToolId } from '../taEngine/langchain/toolRegistry.js';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import {
  agentContextPolicies,
  agentRuns,
  agentRunSnapshots,
  agentToolPolicies,
  agents,
  promptProfiles,
} from '../db/schema.js';
import type {
  AgentRunDetail,
  AgentRunSummary,
  ContextPolicySummary,
  ExecuteAgentRunInput,
  ExecuteAgentRunResult,
  ToolPolicySummary,
  TradingAgentDetail,
  TradingAgentPublicSummary,
} from '../types/tradingAgentsUser.js';
import { requestTradingAgentsDecisionInternal, createBaseAgentsContext } from './tradingAgentsEngineService.js';
import { buildContextBlockForAgent, mapAgentRunRow } from './agentContextService.js';
import { assembleAgentPrompt } from './agentPromptBuilder.js';
import { getAgentConfiguration } from './adminDashboardService.js';
import type { AgentToolPolicyConfig } from '../types/adminDashboard.js';
import type { TradingAgentsDecision } from '../taEngine/types.js';

export class TradingAgentsUserError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'TradingAgentsUserError';
    this.status = status;
  }
}

type DbClient = NonNullable<typeof db>;

const requireDatabase = (): DbClient => {
  if (!db) {
    throw new TradingAgentsUserError('Database is not configured', 503);
  }
  return db;
};

const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.\-]{0,12}$/;

const normalizeTickers = (tickers: string[]): string[] => {
  const normalized: string[] = [];
  for (const ticker of tickers) {
    const value = ticker.trim().toUpperCase();
    if (!value) continue;
    if (!TICKER_PATTERN.test(value)) {
      throw new TradingAgentsUserError(
        `Ticker "${ticker}" is not supported. Use uppercase letters, numbers, dashes, or dots.`,
        400,
      );
    }
    if (!normalized.includes(value)) {
      normalized.push(value);
    }
  }
  if (!normalized.length) {
    throw new TradingAgentsUserError('At least one valid ticker is required', 400);
  }
  return normalized;
};

const mapToolPolicy = (
  policy?: typeof agentToolPolicies.$inferSelect | null,
): ToolPolicySummary | null => {
  if (!policy) return null;
  return {
    priceData: Boolean(policy.canUsePriceData),
    indicators: Boolean(policy.canUseIndicators),
    news: Boolean(policy.canUseNews),
    fundamentals: Boolean(policy.canUseFundamentals),
    macro: Boolean(policy.canUseMacro),
    maxToolsPerRun: Number(policy.maxToolsPerRun ?? 0),
    allowCrossTicker: Boolean(policy.allowCrossTicker),
  };
};

const mapContextPolicy = (
  policy?: typeof agentContextPolicies.$inferSelect | null,
): ContextPolicySummary | null => {
  if (!policy) return null;
  return {
    includePreviousAnalyses: Boolean(policy.includePreviousAnalyses),
    includeUserNotes: Boolean(policy.includeUserNotes),
    includeGlobalSummary: Boolean(policy.includeGlobalSummary),
    maxAnalyses: Number(policy.maxAnalyses ?? 0),
    maxContextTokens: Number(policy.maxContextTokens ?? 0),
  };
};

const dataSourcesFromToolPolicy = (policy?: ToolPolicySummary | null): string[] => {
  if (!policy) return [];
  const sources: string[] = [];
  if (policy.priceData) sources.push('price');
  if (policy.indicators) sources.push('indicators');
  if (policy.news) sources.push('news');
  if (policy.fundamentals) sources.push('fundamentals');
  if (policy.macro) sources.push('macro');
  return sources;
};

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
};

const mapRunRow = mapAgentRunRow;

const FOCUS_TO_ANALYST: Record<string, TradingAnalystId> = {
  technical: 'market',
  fundamental: 'fundamental',
  macro: 'news',
  mixed: 'market',
};

const mapToolPolicyToToolIds = (policy?: AgentToolPolicyConfig | null): ToolId[] => {
  if (!policy) return [];
  const ids = new Set<ToolId>();
  if (policy.canUsePriceData) {
    ids.add(TOOL_IDS.YFIN_DATA);
    ids.add(TOOL_IDS.YFIN_DATA_ONLINE);
  }
  if (policy.canUseIndicators) {
    ids.add(TOOL_IDS.STOCKSTATS_INDICATORS);
    ids.add(TOOL_IDS.STOCKSTATS_INDICATORS_ONLINE);
  }
  if (policy.canUseNews) {
    ids.add(TOOL_IDS.GOOGLE_NEWS);
    ids.add(TOOL_IDS.FINNHUB_MARKET_NEWS);
    ids.add(TOOL_IDS.REDDIT_NEWS);
    ids.add(TOOL_IDS.STOCK_NEWS_OPENAI);
  }
  if (policy.canUseFundamentals) {
    ids.add(TOOL_IDS.FINNHUB_BALANCE_SHEET);
    ids.add(TOOL_IDS.FINNHUB_CASHFLOW);
    ids.add(TOOL_IDS.FINNHUB_INCOME_STATEMENT);
    ids.add(TOOL_IDS.FINNHUB_INSIDER_TRANSACTIONS);
    ids.add(TOOL_IDS.FINNHUB_INSIDER_SENTIMENT);
  }
  if (policy.canUseMacro) {
    ids.add(TOOL_IDS.FINNHUB_MARKET_NEWS);
    ids.add(TOOL_IDS.GOOGLE_NEWS);
  }
  if (policy.canUsePriceData || policy.canUseIndicators) {
    ids.add(TOOL_IDS.YFIN_DATA);
  }
  return Array.from(ids);
};

const mapAgentSummary = (
  row: typeof agents.$inferSelect,
  toolPolicy?: ToolPolicySummary | null,
): TradingAgentPublicSummary => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  focus: row.defaultFocus,
  horizon: row.defaultHorizon,
  tone: row.defaultTone,
  riskBias: row.defaultRiskBias,
  defaultModel: row.defaultModel,
  status: row.status,
  updatedAt: toIsoString(row.updatedAt),
  dataSources: dataSourcesFromToolPolicy(toolPolicy),
});

const loadAgentRow = async (agentId: string): Promise<typeof agents.$inferSelect | null> => {
  const database = requireDatabase();
  const [row] = await database.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  return row ?? null;
};

const ensureAgentActive = async (agentId: string): Promise<typeof agents.$inferSelect> => {
  const row = await loadAgentRow(agentId);
  if (!row) {
    throw new TradingAgentsUserError('Agent not found', 404);
  }
  if (row.status !== 'active') {
    throw new TradingAgentsUserError('Agent is not available', 400);
  }
  return row;
};

const normalizeModelId = (candidate: string | undefined): string => {
  if (!candidate) return env.defaultTradingModel;
  const trimmed = candidate.trim();
  if (!trimmed) return env.defaultTradingModel;
  if (!env.tradingAllowedModels.includes(trimmed)) {
    throw new TradingAgentsUserError(
      `Model ${trimmed} is not supported. Allowed: ${env.tradingAllowedModels.join(', ')}`,
      400,
    );
  }
  return trimmed;
};

const buildPromptPreview = (
  prompt?: typeof promptProfiles.$inferSelect | null,
): TradingAgentDetail['promptProfile'] => {
  if (!prompt) return null;
  return {
    id: prompt.id,
    name: prompt.name,
    version: prompt.version ?? 1,
    outputSchemaExample: prompt.outputSchemaExample ?? null,
  };
};

export const listPublicTradingAgents = async (): Promise<TradingAgentPublicSummary[]> => {
  const database = requireDatabase();
  const rows = await database
    .select({
      agent: agents,
      toolPolicy: agentToolPolicies,
    })
    .from(agents)
    .leftJoin(agentToolPolicies, eq(agentToolPolicies.agentId, agents.id))
    .where(eq(agents.status, 'active'))
    .orderBy(agents.name);

  return rows.map(({ agent, toolPolicy }) => mapAgentSummary(agent, mapToolPolicy(toolPolicy)));
};

export const getTradingAgentDetail = async (
  agentId: string,
  userId: string,
): Promise<TradingAgentDetail> => {
  const database = requireDatabase();
  const [row] = await database
    .select({
      agent: agents,
      toolPolicy: agentToolPolicies,
      contextPolicy: agentContextPolicies,
      prompt: promptProfiles,
    })
    .from(agents)
    .leftJoin(agentToolPolicies, eq(agentToolPolicies.agentId, agents.id))
    .leftJoin(agentContextPolicies, eq(agentContextPolicies.agentId, agents.id))
    .leftJoin(promptProfiles, eq(promptProfiles.id, agents.promptProfileId))
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!row) {
    throw new TradingAgentsUserError('Agent not found', 404);
  }
  if (row.agent.status !== 'active') {
    throw new TradingAgentsUserError('Agent is not available', 400);
  }

  const toolPolicy = mapToolPolicy(row.toolPolicy);
  const contextPolicy = mapContextPolicy(row.contextPolicy);
  const summary = mapAgentSummary(row.agent, toolPolicy);

  const recentRuns = await database
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.agentId, agentId), eq(agentRuns.userId, userId)))
    .orderBy(desc(agentRuns.createdAt))
    .limit(5);

  return {
    ...summary,
    promptProfile: buildPromptPreview(row.prompt),
    toolPolicy,
    contextPolicy,
    recentRuns: recentRuns.map(mapRunRow),
  };
};

export const listAgentRunsForUser = async (
  agentId: string,
  userId: string,
  options: { limit?: number; ticker?: string } = {},
): Promise<AgentRunSummary[]> => {
  const database = requireDatabase();
  await ensureAgentActive(agentId);
  const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 20;

  const rows = await database
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.agentId, agentId), eq(agentRuns.userId, userId)))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit);

  if (options.ticker) {
    const ticker = options.ticker.trim().toUpperCase();
    return rows
      .filter((row) => Array.isArray(row.tickers) && row.tickers.includes(ticker))
      .map(mapRunRow);
  }

  return rows.map(mapRunRow);
};

export const getAgentRunDetail = async (
  agentId: string,
  runId: string,
  userId: string,
): Promise<AgentRunDetail> => {
  const database = requireDatabase();
  await ensureAgentActive(agentId);
  const [row] = await database
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.agentId, agentId), eq(agentRuns.userId, userId)))
    .limit(1);
  if (!row) {
    throw new TradingAgentsUserError('Run not found', 404);
  }
  return mapRunRow(row);
};

const summarizeDecision = (decision: TradingAgentsDecision): string | null => {
  return decision.finalTradeDecision ?? decision.decision ?? null;
};

interface SnapshotPayload {
  systemPrompt?: string | null;
  assembledPrompt?: string | null;
  contextBlock?: string | null;
  toolsUsed?: unknown;
  rawOutputText?: string | null;
  parsedOutputJson?: unknown;
  errorMessage?: string | null;
}

const normalizeParsedJson = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
};

const upsertRunSnapshot = async (runId: string, payload: SnapshotPayload): Promise<void> => {
  const database = requireDatabase();
  const normalizedParsed = normalizeParsedJson(payload.parsedOutputJson ?? null);
  const normalizedTools = Array.isArray(payload.toolsUsed)
    ? (payload.toolsUsed as Record<string, unknown>[])
    : null;
  const snapshotRow: typeof agentRunSnapshots.$inferInsert = {
    runId,
    systemPrompt: payload.systemPrompt ?? null,
    assembledPrompt: payload.assembledPrompt ?? null,
    contextBlock: payload.contextBlock ?? null,
    toolsUsed: normalizedTools,
    rawOutputText: payload.rawOutputText ?? null,
    parsedOutputJson: normalizedParsed,
    errorMessage: payload.errorMessage ?? null,
  };

  await database
    .insert(agentRunSnapshots)
    .values(snapshotRow)
    .onConflictDoUpdate({
      target: agentRunSnapshots.runId,
      set: {
        systemPrompt: snapshotRow.systemPrompt,
        assembledPrompt: snapshotRow.assembledPrompt,
        contextBlock: snapshotRow.contextBlock,
        toolsUsed: snapshotRow.toolsUsed,
        rawOutputText: snapshotRow.rawOutputText,
        parsedOutputJson: snapshotRow.parsedOutputJson,
        errorMessage: snapshotRow.errorMessage,
      },
    });
};

export const executeAgentRun = async (
  input: ExecuteAgentRunInput,
): Promise<ExecuteAgentRunResult> => {
  const database = requireDatabase();
  const agent = await ensureAgentActive(input.agentId);
  const agentConfig = await getAgentConfiguration(agent.id);
  if (!agentConfig) {
    throw new TradingAgentsUserError('Agent configuration not found', 404);
  }
  if (!agentConfig.promptProfile) {
    throw new TradingAgentsUserError('Agent does not have an active prompt profile', 400);
  }
  const tickers = normalizeTickers(input.tickers);
  const primarySymbol = tickers[0];
  if (!primarySymbol) {
    throw new TradingAgentsUserError('Primary ticker is missing', 400);
  }
  const modelId = normalizeModelId(input.modelId) || agent.defaultModel;
  const personaId = FOCUS_TO_ANALYST[agentConfig.defaultFocus] ?? 'market';
  const analysts: TradingAnalystId[] = [personaId];
  const payloadQuestion = input.question?.trim() || null;
  const contextResult = await buildContextBlockForAgent(agent.id, input.userId, agentConfig.contextPolicy ?? null);
  const assembledPrompt = assembleAgentPrompt({
    agent: agentConfig,
    promptProfile: agentConfig.promptProfile,
    tickers,
    ...(payloadQuestion ? { question: payloadQuestion } : {}),
    ...(contextResult.contextBlock ? { contextBlock: contextResult.contextBlock } : {}),
  });
  const toolIds = mapToolPolicyToToolIds(agentConfig.toolPolicy);
  const personaOverrides = {
    [personaId]: {
      systemPrompt: assembledPrompt.systemPrompt,
      ...(toolIds.length > 0 ? { toolIds } : {}),
    },
  };
  const agentsContext = createBaseAgentsContext();
  if (contextResult.contextBlock) {
    agentsContext.fundamentals_summary = contextResult.contextBlock;
  }

  const [runRow] = await database
    .insert(agentRuns)
    .values({
      agentId: agent.id,
      userId: input.userId,
      tickers,
      question: payloadQuestion,
      status: 'running',
    })
    .returning();

  if (!runRow) {
    throw new TradingAgentsUserError('Failed to create agent run', 500);
  }

  try {
    const decision = await requestTradingAgentsDecisionInternal(primarySymbol, {
      modelId,
      analysts,
      personaOverrides,
      agentsContext,
      ...(input.useMockData !== undefined ? { useMockData: input.useMockData } : {}),
    });

    const summary = summarizeDecision(decision);

    const [updated] = await database
      .update(agentRuns)
      .set({
        status: 'success',
        decisionSummary: summary,
        confidence: null,
        tokensPrompt: assembledPrompt.tokenEstimate,
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, runRow.id))
      .returning();

    await upsertRunSnapshot(runRow.id, {
      systemPrompt: assembledPrompt.systemPrompt,
      assembledPrompt: assembledPrompt.assembledPrompt,
      ...(assembledPrompt.contextBlock ? { contextBlock: assembledPrompt.contextBlock } : {}),
      rawOutputText: JSON.stringify(decision),
      parsedOutputJson: decision,
      errorMessage: null,
    });

    const run = mapRunRow(updated ?? runRow);
    return {
      run,
      decisionSummary: summary,
    };
  } catch (error) {
    await database
      .update(agentRuns)
      .set({
        status: 'error',
        decisionSummary: null,
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, runRow.id));
    await upsertRunSnapshot(runRow.id, {
      systemPrompt: assembledPrompt.systemPrompt,
      assembledPrompt: assembledPrompt.assembledPrompt,
      ...(assembledPrompt.contextBlock ? { contextBlock: assembledPrompt.contextBlock } : {}),
      errorMessage: error instanceof Error ? error.message : 'Agent run failed',
    });
    throw error;
  }
};

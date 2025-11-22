import { and, desc, eq } from 'drizzle-orm';
import { DEFAULT_TRADING_ANALYSTS } from '../constants/tradingAgents.js';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { agentContextPolicies, agentRuns, agentToolPolicies, agents, promptProfiles, } from '../db/schema.js';
import { requestTradingAgentsDecisionInternal } from './tradingAgentsEngineService.js';
export class TradingAgentsUserError extends Error {
    status;
    constructor(message, status = 400) {
        super(message);
        this.name = 'TradingAgentsUserError';
        this.status = status;
    }
}
const requireDatabase = () => {
    if (!db) {
        throw new TradingAgentsUserError('Database is not configured', 503);
    }
    return db;
};
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.\-]{0,12}$/;
const normalizeTickers = (tickers) => {
    const normalized = [];
    for (const ticker of tickers) {
        const value = ticker.trim().toUpperCase();
        if (!value)
            continue;
        if (!TICKER_PATTERN.test(value)) {
            throw new TradingAgentsUserError(`Ticker "${ticker}" is not supported. Use uppercase letters, numbers, dashes, or dots.`, 400);
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
const mapToolPolicy = (policy) => {
    if (!policy)
        return null;
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
const mapContextPolicy = (policy) => {
    if (!policy)
        return null;
    return {
        includePreviousAnalyses: Boolean(policy.includePreviousAnalyses),
        includeUserNotes: Boolean(policy.includeUserNotes),
        includeGlobalSummary: Boolean(policy.includeGlobalSummary),
        maxAnalyses: Number(policy.maxAnalyses ?? 0),
        maxContextTokens: Number(policy.maxContextTokens ?? 0),
    };
};
const dataSourcesFromToolPolicy = (policy) => {
    if (!policy)
        return [];
    const sources = [];
    if (policy.priceData)
        sources.push('price');
    if (policy.indicators)
        sources.push('indicators');
    if (policy.news)
        sources.push('news');
    if (policy.fundamentals)
        sources.push('fundamentals');
    if (policy.macro)
        sources.push('macro');
    return sources;
};
const toIsoString = (value) => {
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === 'string')
        return new Date(value).toISOString();
    return new Date().toISOString();
};
const mapAgentSummary = (row, toolPolicy) => ({
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
const mapRunRow = (row) => ({
    id: row.id,
    agentId: row.agentId,
    userId: row.userId ?? null,
    tickers: Array.isArray(row.tickers) ? [...row.tickers] : [],
    question: row.question ?? null,
    status: row.status,
    decisionSummary: row.decisionSummary ?? null,
    confidence: row.confidence ?? null,
    tokensPrompt: row.tokensPrompt ?? null,
    tokensCompletion: row.tokensCompletion ?? null,
    tokensTotal: row.tokensTotal ?? null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
});
const loadAgentRow = async (agentId) => {
    const database = requireDatabase();
    const [row] = await database.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    return row ?? null;
};
const ensureAgentActive = async (agentId) => {
    const row = await loadAgentRow(agentId);
    if (!row) {
        throw new TradingAgentsUserError('Agent not found', 404);
    }
    if (row.status !== 'active') {
        throw new TradingAgentsUserError('Agent is not available', 400);
    }
    return row;
};
const normalizeModelId = (candidate) => {
    if (!candidate)
        return env.defaultTradingModel;
    const trimmed = candidate.trim();
    if (!trimmed)
        return env.defaultTradingModel;
    if (!env.tradingAllowedModels.includes(trimmed)) {
        throw new TradingAgentsUserError(`Model ${trimmed} is not supported. Allowed: ${env.tradingAllowedModels.join(', ')}`, 400);
    }
    return trimmed;
};
const buildPromptPreview = (prompt) => {
    if (!prompt)
        return null;
    return {
        id: prompt.id,
        name: prompt.name,
        version: prompt.version ?? 1,
        outputSchemaExample: prompt.outputSchemaExample ?? null,
    };
};
export const listPublicTradingAgents = async () => {
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
export const getTradingAgentDetail = async (agentId, userId) => {
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
export const listAgentRunsForUser = async (agentId, userId, options = {}) => {
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
export const getAgentRunDetail = async (agentId, runId, userId) => {
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
const summarizeDecision = (decision) => {
    return decision.finalTradeDecision ?? decision.decision ?? null;
};
export const executeAgentRun = async (input) => {
    const database = requireDatabase();
    const agent = await ensureAgentActive(input.agentId);
    const tickers = normalizeTickers(input.tickers);
    const primarySymbol = tickers[0];
    if (!primarySymbol) {
        throw new TradingAgentsUserError('Primary ticker is missing', 400);
    }
    const modelId = normalizeModelId(input.modelId) || agent.defaultModel;
    const analysts = [...DEFAULT_TRADING_ANALYSTS];
    const payloadQuestion = input.question?.trim() || null;
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
            ...(input.useMockData !== undefined ? { useMockData: input.useMockData } : {}),
        });
        const summary = summarizeDecision(decision);
        const [updated] = await database
            .update(agentRuns)
            .set({
            status: 'success',
            decisionSummary: summary,
            confidence: null,
            updatedAt: new Date(),
        })
            .where(eq(agentRuns.id, runRow.id))
            .returning();
        const run = mapRunRow(updated ?? runRow);
        return {
            run,
            decisionSummary: summary,
        };
    }
    catch (error) {
        await database
            .update(agentRuns)
            .set({
            status: 'error',
            decisionSummary: null,
            updatedAt: new Date(),
        })
            .where(eq(agentRuns.id, runRow.id));
        throw error;
    }
};
//# sourceMappingURL=tradingAgentsUserService.js.map
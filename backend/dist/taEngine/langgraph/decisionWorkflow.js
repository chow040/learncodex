import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { env } from '../../config/env.js';
import { logAgentPrompts, writeEvalSummary, logToolCalls } from '../logger.js';
import { insertTaDecision } from '../../db/taDecisionRepository.js';
import { getRoleSummaries } from '../../services/pastResultsService.js';
import { fetchPersonaMemories, recordPersonaMemory } from '../../services/personaMemoryService.js';
import { runAnalystStage } from './analystsWorkflow.js';
import { publishProgressEvent } from '../../services/tradingProgressService.js';
import { DEFAULT_TRADING_ANALYSTS, isTradingAnalystId, } from '../../constants/tradingAgents.js';
import { createInitialState, } from './types.js';
import { BEAR_SYSTEM_PROMPT, buildBearUserMessage, createBearDebateRunnable, } from '../langchain/debates/bearRunnable.js';
import { BULL_SYSTEM_PROMPT, buildBullUserMessage, createBullDebateRunnable, } from '../langchain/debates/bullRunnable.js';
import { createResearchManagerRunnable, RESEARCH_MANAGER_SYSTEM_PROMPT, buildResearchManagerUserMessage, } from '../langchain/judges/researchManagerRunnable.js';
import { createTraderRunnable, TRADER_SYSTEM_PROMPT, buildTraderUserMessage, } from '../langchain/trader/traderRunnable.js';
import { createAggressiveAnalystRunnable, createConservativeAnalystRunnable, createNeutralAnalystRunnable, buildAggressiveUserMessage, buildConservativeUserMessage, buildNeutralUserMessage, AGGRESSIVE_SYSTEM_PROMPT, CONSERVATIVE_SYSTEM_PROMPT, NEUTRAL_SYSTEM_PROMPT, } from '../langchain/risk/index.js';
import { createRiskManagerRunnable, RISK_MANAGER_SYSTEM_PROMPT, buildRiskManagerUserMessage, } from '../langchain/risk/riskManagerRunnable.js';
import { canContinueInvestment, canContinueRisk, createDebateRoundEntry, createRiskDebateRoundEntry, withIncrementedInvestRound, withIncrementedRiskRound, } from './stateUtils.js';
/**
 * Determines the provider (openai or grok) for a given model ID.
 * Grok models typically start with 'grok-' prefix.
 * Supports region-specific models like: grok-4-fast-reasoning-us-east-1
 */
const resolveProvider = (modelId) => {
    const normalized = (modelId ?? '').trim().toLowerCase();
    if (normalized.startsWith('grok-') || normalized.startsWith('grok')) {
        return 'grok';
    }
    return 'openai';
};
const StateAnnotation = Annotation.Root({
    symbol: Annotation(),
    tradeDate: Annotation(),
    context: Annotation(),
    reports: Annotation({
        reducer: (_, right) => right,
        default: () => ({}),
    }),
    investmentPlan: Annotation({
        reducer: (_, right) => right,
        default: () => null,
    }),
    traderPlan: Annotation({
        reducer: (_, right) => right,
        default: () => null,
    }),
    finalDecision: Annotation({
        reducer: (_, right) => right,
        default: () => null,
    }),
    conversationLog: Annotation({
        default: () => [],
        reducer: (left, right) => left.concat(right),
    }),
    debate: Annotation({
        reducer: (left, right) => ({ ...left, ...right }),
        default: () => ({}),
    }),
    debateHistory: Annotation({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    riskDebateHistory: Annotation({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    metadata: Annotation({
        reducer: (left, right) => ({ ...left, ...right }),
        default: () => ({
            invest_continue: true,
            risk_continue: true,
        }),
    }),
    result: Annotation({
        reducer: (_, right) => right,
        default: () => undefined,
    }),
});
const createChatModel = (modelOverride, temperature = 1) => {
    const modelId = modelOverride ?? env.defaultTradingModel;
    const provider = resolveProvider(modelId);
    if (provider === 'grok') {
        if (!env.grokApiKey) {
            throw new Error('GROK_API_KEY is not configured. Cannot use Grok models.');
        }
        return new ChatOpenAI({
            apiKey: env.grokApiKey,
            model: modelId,
            temperature,
            configuration: { baseURL: env.grokBaseUrl },
        });
    }
    if (!env.openAiApiKey) {
        throw new Error('OPENAI_API_KEY is not configured.');
    }
    return new ChatOpenAI({
        apiKey: env.openAiApiKey,
        model: modelId,
        temperature,
        ...(env.openAiBaseUrl ? { configuration: { baseURL: env.openAiBaseUrl } } : {}),
    });
};
const DECISION_PARSER_SYSTEM_PROMPT = 'You are an efficient assistant that reads analyst reports. Extract the explicit investment verdict (SELL, BUY, or HOLD) and reply with only that single word. Do not include any other words or punctuation.';
const extractDecisionToken = async (text, modelId) => {
    const trimmed = text?.trim();
    if (!trimmed)
        return null;
    try {
        const parser = createChatModel(modelId, 0);
        const response = await parser.invoke([
            new SystemMessage(DECISION_PARSER_SYSTEM_PROMPT),
            new HumanMessage(trimmed),
        ]);
        const raw = response?.content;
        const content = typeof raw === 'string'
            ? raw
            : Array.isArray(raw)
                ? raw.map((chunk) => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk))).join('')
                : '';
        const token = content.trim().toUpperCase();
        if (token === 'BUY' || token === 'SELL' || token === 'HOLD') {
            return token;
        }
    }
    catch (error) {
        console.warn('[DecisionGraph] Failed to extract decision token via LLM', error);
    }
    return null;
};
const appendHistory = (history, label, content) => {
    const trimmed = content?.trim() ?? '';
    if (!trimmed)
        return history ?? '';
    const entry = `${label}:\n${trimmed}`;
    return history ? `${history}\n\n${entry}` : entry;
};
const coalesce = (value, fallback) => value && value.trim().length > 0 ? value : (fallback ?? '');
const coalesceReport = (reports, key, fallback) => coalesce(reports[key], fallback);
const stagePercents = {
    queued: 0,
    analysts: 15,
    investment_debate: 45,
    research_manager: 60,
    trader: 70,
    risk_debate: 85,
    risk_manager: 95,
    finalizing: 100,
};
const resolveModelId = (state) => {
    const raw = state.metadata?.modelId ?? '';
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : env.defaultTradingModel;
};
const resolveEnabledAnalysts = (state) => {
    const raw = state.metadata?.enabledAnalysts;
    if (Array.isArray(raw)) {
        const set = new Set();
        for (const entry of raw) {
            if (typeof entry !== 'string')
                continue;
            const normalized = entry.trim().toLowerCase();
            if (isTradingAnalystId(normalized)) {
                set.add(normalized);
            }
        }
        if (set.size > 0) {
            return DEFAULT_TRADING_ANALYSTS.filter((id) => set.has(id));
        }
    }
    return [...DEFAULT_TRADING_ANALYSTS];
};
const emitStage = (state, stage, label, message, iteration) => {
    const runId = typeof state.metadata?.progressRunId === 'string' ? state.metadata.progressRunId : null;
    if (!runId)
        return;
    const payload = {
        runId,
        stage,
        label,
        percent: stagePercents[stage],
        ...(message !== undefined ? { message } : {}),
        ...(iteration !== undefined ? { iteration } : {}),
        modelId: resolveModelId(state),
        analysts: resolveEnabledAnalysts(state),
    };
    publishProgressEvent(runId, payload);
};
const buildDebateContext = (state) => ({
    ...state.context,
    market_technical_report: coalesceReport(state.reports, 'market', state.context.market_technical_report),
    social_reddit_summary: coalesceReport(state.reports, 'social', state.context.social_reddit_summary),
    news_global: coalesceReport(state.reports, 'news', state.context.news_global),
    news_company: coalesceReport(state.reports, 'news', state.context.news_company),
    fundamentals_summary: coalesceReport(state.reports, 'fundamentals', state.context.fundamentals_summary),
});
const buildSituationSummary = (context) => {
    const sections = [
        context.market_technical_report ? `Market context:\n${context.market_technical_report}` : null,
        context.social_reddit_summary ? `Social sentiment:\n${context.social_reddit_summary}` : null,
        context.news_company ? `Company news:\n${context.news_company}` : null,
        context.news_global ? `Global news:\n${context.news_global}` : null,
        context.fundamentals_summary ? `Fundamentals:\n${context.fundamentals_summary}` : null,
    ].filter((segment) => Boolean(segment));
    return sections.length ? sections.join('\n\n') : 'No prior context available.';
};
const truncate = (input, limit = 240) => (input ?? '').slice(0, limit);
const normalizeDecision = (text) => {
    const value = (text ?? '').toString();
    const match = value.match(/^\s*(?:#+\s*)?(?:Final\s+(?:Recommendation|Decision|Verdict))\s*[:\-]\s*\**\s*(BUY|SELL|HOLD)\s*\**/im);
    if (match && match[1])
        return match[1].toUpperCase();
    const tokens = [...value.toUpperCase().matchAll(/\b(BUY|SELL|HOLD)\b/g)];
    if (tokens.length) {
        const lastMatch = tokens[tokens.length - 1];
        const extracted = (lastMatch[1] ?? lastMatch[0] ?? '').toUpperCase();
        if (extracted)
            return extracted;
    }
    return 'NO DECISION';
};
const loadMemoriesNode = async (state) => {
    const symbol = state.symbol;
    const tradeDate = state.tradeDate || new Date().toISOString().slice(0, 10);
    const baseContextSummary = buildSituationSummary(state.context);
    const personaMemoriesPromise = Promise.all([
        fetchPersonaMemories('research_manager', symbol, baseContextSummary, 3),
        fetchPersonaMemories('trader', symbol, baseContextSummary, 3),
        fetchPersonaMemories('risk_manager', symbol, baseContextSummary, 3),
    ]);
    let managerMemories = '';
    let traderMemories = '';
    let riskManagerMemories = '';
    if (env.useDbMemories) {
        try {
            const summaries = await getRoleSummaries(symbol, tradeDate);
            managerMemories = summaries.manager ?? '';
            traderMemories = summaries.trader ?? '';
            riskManagerMemories = summaries.risk ?? '';
        }
        catch (error) {
            console.warn(`[DecisionGraph] DB-backed memories unavailable for ${symbol}; falling back to Supabase/local store`, error);
        }
    }
    const [managerVector, traderVector, riskVector] = await personaMemoriesPromise;
    const normalize = (value) => (value && value.trim().length ? value : '');
    if (!normalize(managerMemories))
        managerMemories = normalize(managerVector);
    if (!normalize(traderMemories))
        traderMemories = normalize(traderVector);
    if (!normalize(riskManagerMemories))
        riskManagerMemories = normalize(riskVector);
    const existingMetadata = (state.metadata ?? {});
    return {
        metadata: {
            ...existingMetadata,
            managerMemories: normalize(managerMemories),
            traderMemories: normalize(traderMemories),
            riskManagerMemories: normalize(riskManagerMemories),
            invest_round: typeof existingMetadata.invest_round === 'number' ? existingMetadata.invest_round : 0,
            risk_round: typeof existingMetadata.risk_round === 'number' ? existingMetadata.risk_round : 0,
            invest_continue: existingMetadata.invest_continue === undefined ? true : existingMetadata.invest_continue,
            risk_continue: existingMetadata.risk_continue === undefined ? true : existingMetadata.risk_continue,
        },
    };
};
const analystsNode = async (state) => {
    emitStage(state, 'analysts', 'Running analyst stage');
    const modelId = resolveModelId(state);
    const enabledAnalysts = resolveEnabledAnalysts(state);
    const { reports, conversationLog, toolCalls } = await runAnalystStage(state.symbol, state.tradeDate, state.context, {
        modelId,
        enabledAnalysts,
    });
    await logToolCalls({
        symbol: state.symbol,
        tradeDate: state.tradeDate,
        context: state.context,
        modelId,
        analysts: enabledAnalysts,
    }, toolCalls ?? []);
    return {
        reports,
        conversationLog,
    };
};
const bearNode = async (state) => {
    const llm = createChatModel(resolveModelId(state));
    const runnable = createBearDebateRunnable(llm);
    const context = buildDebateContext(state);
    const round = Number(state.metadata?.invest_round ?? 0) + 1;
    emitStage(state, 'investment_debate', 'Investment debate', `Bear vs Bull round ${round}`, round);
    const history = state.debate?.investment ?? '';
    const opponentArgument = state.debate?.bull ?? '';
    const situationSummary = buildSituationSummary(context);
    const input = {
        context,
        symbol: state.symbol,
        tradeDate: state.tradeDate,
        history,
        opponentArgument,
        reflections: await fetchPersonaMemories('bear', state.symbol, situationSummary, 2),
        rounds: state.debateHistory ?? [],
    };
    const userMessage = buildBearUserMessage(input);
    const output = await runnable.invoke(input);
    return {
        debate: {
            ...(state.debate ?? {}),
            bear: output,
            investment: appendHistory(history, `Bear Analyst (Round ${round})`, output),
        },
        debateHistory: [createDebateRoundEntry('bear', round, output)],
        conversationLog: [
            {
                roleLabel: 'Bear Analyst',
                system: BEAR_SYSTEM_PROMPT,
                user: userMessage,
            },
        ],
    };
};
const bullNode = async (state) => {
    const llm = createChatModel(resolveModelId(state));
    const runnable = createBullDebateRunnable(llm);
    const context = buildDebateContext(state);
    const completedRounds = Number(state.metadata?.invest_round ?? 0);
    const round = completedRounds + 1;
    const history = state.debate?.investment ?? '';
    const opponentArgument = state.debate?.bear ?? '';
    const situationSummary = buildSituationSummary(context);
    const input = {
        context,
        symbol: state.symbol,
        tradeDate: state.tradeDate,
        history,
        opponentArgument,
        reflections: await fetchPersonaMemories('bull', state.symbol, situationSummary, 2),
        rounds: state.debateHistory ?? [],
    };
    const userMessage = buildBullUserMessage(input);
    const output = await runnable.invoke(input);
    return {
        debate: {
            ...(state.debate ?? {}),
            bull: output,
            investment: appendHistory(history, `Bull Analyst (Round ${round})`, output),
        },
        debateHistory: [createDebateRoundEntry('bull', round, output)],
        conversationLog: [
            {
                roleLabel: 'Bull Analyst',
                system: BULL_SYSTEM_PROMPT,
                user: userMessage,
            },
        ],
        metadata: withIncrementedInvestRound((state.metadata ?? {}), round),
    };
};
const researchManagerNode = async (state) => {
    const llm = createChatModel(resolveModelId(state));
    const runnable = createResearchManagerRunnable(llm);
    const managerMemories = state.metadata?.managerMemories ?? '';
    const debateHistory = state.debate?.investment ?? '';
    emitStage(state, 'research_manager', 'Research manager synthesis');
    const marketReport = coalesceReport(state.reports, 'market', state.context.market_technical_report);
    const sentimentReport = coalesceReport(state.reports, 'social', state.context.social_reddit_summary);
    const newsReport = coalesceReport(state.reports, 'news', state.context.news_company);
    const fundamentalsReport = coalesceReport(state.reports, 'fundamentals', state.context.fundamentals_summary);
    const input = {
        debateHistory,
        marketReport,
        sentimentReport,
        newsReport,
        fundamentalsReport,
        pastMemories: managerMemories,
    };
    const userMessage = buildResearchManagerUserMessage(input);
    const output = await runnable.invoke(input);
    return {
        investmentPlan: output,
        conversationLog: [
            {
                roleLabel: 'Research Manager',
                system: RESEARCH_MANAGER_SYSTEM_PROMPT,
                user: userMessage,
            },
        ],
    };
};
const traderNode = async (state) => {
    const llm = createChatModel(resolveModelId(state));
    const runnable = createTraderRunnable(llm);
    const traderMemories = state.metadata?.traderMemories ?? '';
    const marketReport = coalesceReport(state.reports, 'market', state.context.market_technical_report);
    const sentimentReport = coalesceReport(state.reports, 'social', state.context.social_reddit_summary);
    const newsReport = coalesceReport(state.reports, 'news', state.context.news_company);
    const fundamentalsReport = coalesceReport(state.reports, 'fundamentals', state.context.fundamentals_summary);
    const plan = state.investmentPlan ?? '';
    emitStage(state, 'trader', 'Trader execution plan');
    const input = {
        company: state.symbol,
        plan,
        marketReport,
        sentimentReport,
        newsReport,
        fundamentalsReport,
        pastMemories: traderMemories,
    };
    const userMessage = buildTraderUserMessage(input);
    const output = await runnable.invoke(input);
    return {
        traderPlan: output,
        conversationLog: [
            {
                roleLabel: 'Trader',
                system: TRADER_SYSTEM_PROMPT,
                user: userMessage,
            },
        ],
    };
};
const aggressiveNode = async (state) => {
    const llm = createChatModel(resolveModelId(state));
    const runnable = createAggressiveAnalystRunnable(llm);
    const context = buildDebateContext(state);
    const round = Number(state.metadata?.risk_round ?? 0) + 1;
    emitStage(state, 'risk_debate', 'Risk debate analysis', `Risk round ${round}`, round);
    const history = state.debate?.risk ?? '';
    const input = {
        context,
        traderPlan: state.traderPlan ?? '',
        history,
        rounds: state.riskDebateHistory ?? [],
    };
    if (state.debate?.aggressive)
        input.lastAggressive = state.debate.aggressive;
    if (state.debate?.conservative)
        input.lastConservative = state.debate.conservative;
    if (state.debate?.neutral)
        input.lastNeutral = state.debate.neutral;
    const userMessage = buildAggressiveUserMessage(input);
    const output = await runnable.invoke(input);
    return {
        debate: {
            aggressive: output,
            risk: appendHistory(history, `Aggressive Analyst (Round ${round})`, output),
        },
        riskDebateHistory: [createRiskDebateRoundEntry('aggressive', round, output)],
        conversationLog: [
            {
                roleLabel: 'Aggressive Analyst',
                system: AGGRESSIVE_SYSTEM_PROMPT,
                user: userMessage,
            },
        ],
    };
};
const conservativeNode = async (state) => {
    const llm = createChatModel(resolveModelId(state));
    const runnable = createConservativeAnalystRunnable(llm);
    const context = buildDebateContext(state);
    const round = Number(state.metadata?.risk_round ?? 0) + 1;
    const history = state.debate?.risk ?? '';
    const input = {
        context,
        traderPlan: state.traderPlan ?? '',
        history,
        rounds: state.riskDebateHistory ?? [],
    };
    if (state.debate?.aggressive)
        input.lastAggressive = state.debate.aggressive;
    if (state.debate?.conservative)
        input.lastConservative = state.debate.conservative;
    if (state.debate?.neutral)
        input.lastNeutral = state.debate.neutral;
    const userMessage = buildConservativeUserMessage(input);
    const output = await runnable.invoke(input);
    return {
        debate: {
            conservative: output,
            risk: appendHistory(history, `Conservative Analyst (Round ${round})`, output),
        },
        riskDebateHistory: [createRiskDebateRoundEntry('conservative', round, output)],
        conversationLog: [
            {
                roleLabel: 'Conservative Analyst',
                system: CONSERVATIVE_SYSTEM_PROMPT,
                user: userMessage,
            },
        ],
    };
};
const neutralNode = async (state) => {
    const llm = createChatModel(resolveModelId(state));
    const runnable = createNeutralAnalystRunnable(llm);
    const context = buildDebateContext(state);
    const completedRounds = Number(state.metadata?.risk_round ?? 0);
    const round = completedRounds + 1;
    const history = state.debate?.risk ?? '';
    const input = {
        context,
        traderPlan: state.traderPlan ?? '',
        history,
        rounds: state.riskDebateHistory ?? [],
    };
    if (state.debate?.aggressive)
        input.lastAggressive = state.debate.aggressive;
    if (state.debate?.conservative)
        input.lastConservative = state.debate.conservative;
    if (state.debate?.neutral)
        input.lastNeutral = state.debate.neutral;
    const userMessage = buildNeutralUserMessage(input);
    const output = await runnable.invoke(input);
    return {
        debate: {
            neutral: output,
            risk: appendHistory(history, `Neutral Analyst (Round ${round})`, output),
        },
        riskDebateHistory: [createRiskDebateRoundEntry('neutral', round, output)],
        conversationLog: [
            {
                roleLabel: 'Neutral Analyst',
                system: NEUTRAL_SYSTEM_PROMPT,
                user: userMessage,
            },
        ],
        metadata: withIncrementedRiskRound((state.metadata ?? {}), round),
    };
};
const riskManagerNode = async (state) => {
    const modelId = resolveModelId(state);
    const llm = createChatModel(modelId);
    const runnable = createRiskManagerRunnable(llm);
    const riskMemories = state.metadata?.riskManagerMemories ?? '';
    emitStage(state, 'risk_manager', 'Risk manager verdict');
    const marketReport = coalesceReport(state.reports, 'market', state.context.market_technical_report);
    const sentimentReport = coalesceReport(state.reports, 'social', state.context.social_reddit_summary);
    const newsReport = coalesceReport(state.reports, 'news', state.context.news_company);
    const fundamentalsReport = coalesceReport(state.reports, 'fundamentals', state.context.fundamentals_summary);
    const input = {
        traderPlan: state.traderPlan ?? '',
        debateHistory: state.debate?.risk ?? '',
        marketReport,
        sentimentReport,
        newsReport,
        fundamentalsReport,
        pastMemories: riskMemories,
    };
    const userMessage = buildRiskManagerUserMessage(input);
    const output = await runnable.invoke(input);
    const decisionToken = (await extractDecisionToken(output, modelId)) ?? normalizeDecision(output);
    return {
        finalDecision: output,
        conversationLog: [
            {
                roleLabel: 'Risk Manager',
                system: RISK_MANAGER_SYSTEM_PROMPT,
                user: userMessage,
            },
        ],
        metadata: {
            ...(state.metadata ?? {}),
            decision_token: decisionToken,
        },
    };
};
const persistMemoriesNode = async (state) => {
    const date = state.tradeDate || new Date().toISOString().slice(0, 10);
    const symbol = state.symbol;
    const contextSummary = buildSituationSummary(buildDebateContext(state));
    emitStage(state, 'finalizing', 'Finalizing decision outputs');
    const tasks = [];
    if (state.investmentPlan) {
        tasks.push(recordPersonaMemory({
            persona: 'research_manager',
            symbol,
            date,
            situation: contextSummary,
            recommendation: `Plan: ${truncate(state.investmentPlan)}`,
        }));
    }
    if (state.traderPlan) {
        tasks.push(recordPersonaMemory({
            persona: 'trader',
            symbol,
            date,
            situation: contextSummary,
            recommendation: `Trader: ${truncate(state.traderPlan)}`,
        }));
    }
    if (state.finalDecision) {
        const decisionToken = state.metadata?.decision_token ?? normalizeDecision(state.finalDecision);
        tasks.push(recordPersonaMemory({
            persona: 'risk_manager',
            symbol,
            date,
            situation: contextSummary,
            recommendation: `Risk: ${truncate(state.finalDecision)} | Decision: ${decisionToken}`,
        }));
    }
    if (tasks.length) {
        await Promise.allSettled(tasks);
    }
    return {};
};
const finalizeNode = async (state) => {
    const decisionToken = state.metadata?.decision_token ??
        normalizeDecision(state.finalDecision);
    const modelId = resolveModelId(state);
    const enabledAnalysts = resolveEnabledAnalysts(state);
    const enabledSet = new Set(enabledAnalysts);
    const runCompletedAt = Date.now();
    const runStartedAt = typeof state.metadata?.runStartedAt === 'number' && Number.isFinite(state.metadata.runStartedAt)
        ? state.metadata.runStartedAt
        : null;
    const executionMs = runStartedAt !== null ? Math.max(0, runCompletedAt - runStartedAt) : null;
    const decision = {
        symbol: state.symbol,
        tradeDate: state.tradeDate,
        decision: decisionToken,
        finalTradeDecision: decisionToken,
        investmentPlan: state.investmentPlan ?? null,
        traderPlan: state.traderPlan ?? null,
        investmentJudge: state.investmentPlan ?? null,
        riskJudge: state.finalDecision ?? null,
        modelId,
        analysts: enabledAnalysts,
        debugPrompt: '',
    };
    if (executionMs !== null) {
        decision.executionMs = executionMs;
    }
    if (enabledSet.has('market')) {
        decision.marketReport =
            coalesceReport(state.reports, 'market', state.context.market_technical_report) || null;
    }
    if (enabledSet.has('social')) {
        decision.sentimentReport =
            coalesceReport(state.reports, 'social', state.context.social_reddit_summary) || null;
    }
    if (enabledSet.has('news')) {
        decision.newsReport = coalesceReport(state.reports, 'news', state.context.news_company) || null;
    }
    if (enabledSet.has('fundamental')) {
        decision.fundamentalsReport =
            coalesceReport(state.reports, 'fundamentals', state.context.fundamentals_summary) || null;
    }
    if (state.debate?.investment) {
        decision.investmentDebate = state.debate.investment;
    }
    else if (state.debate?.bull || state.debate?.bear) {
        const bull = state.debate?.bull?.trim();
        const bear = state.debate?.bear?.trim();
        const sections = [];
        if (bull)
            sections.push(`### Bull Argument\n${bull}`);
        if (bear)
            sections.push(`### Bear Argument\n${bear}`);
        decision.investmentDebate = sections.length > 0 ? sections.join('\n\n') : null;
    }
    else {
        decision.investmentDebate = null;
    }
    decision.bullArgument = state.debate?.bull ?? null;
    decision.bearArgument = state.debate?.bear ?? null;
    // Include individual risk analyst arguments
    decision.aggressiveArgument = state.debate?.aggressive ?? null;
    decision.conservativeArgument = state.debate?.conservative ?? null;
    decision.neutralArgument = state.debate?.neutral ?? null;
    // Build risk debate transcript from individual arguments or history
    if (state.debate?.risk) {
        decision.riskDebate = state.debate.risk;
    }
    else if (state.debate?.aggressive || state.debate?.conservative || state.debate?.neutral) {
        const aggressive = state.debate?.aggressive?.trim();
        const conservative = state.debate?.conservative?.trim();
        const neutral = state.debate?.neutral?.trim();
        const sections = [];
        if (aggressive)
            sections.push(`### Aggressive Analyst\n${aggressive}`);
        if (conservative)
            sections.push(`### Conservative Analyst\n${conservative}`);
        if (neutral)
            sections.push(`### Neutral Analyst\n${neutral}`);
        decision.riskDebate = sections.length > 0 ? sections.join('\n\n') : null;
    }
    else {
        decision.riskDebate = null;
    }
    const payload = {
        symbol: state.symbol,
        tradeDate: state.tradeDate,
        context: state.context,
        modelId,
        analysts: enabledAnalysts,
    };
    let promptsLogPath = null;
    try {
        if (state.conversationLog.length) {
            promptsLogPath = await logAgentPrompts(payload, state.conversationLog, 'langgraph');
        }
    }
    catch (error) {
        console.error('[DecisionGraph] Failed to log agent prompts', error);
    }
    let evalLogPath = null;
    try {
        evalLogPath = await writeEvalSummary(payload, decision, {
            investmentDebateHistory: state.debate?.investment ?? '',
            investmentDebateRounds: state.debateHistory ?? [],
            bullArg: state.debate?.bull ?? null,
            bearArg: state.debate?.bear ?? null,
            riskDebateHistory: state.debate?.risk ?? '',
            riskDebateRounds: state.riskDebateHistory ?? [],
            riskyOut: state.debate?.aggressive ?? null,
            safeOut: state.debate?.conservative ?? null,
            neutralOut: state.debate?.neutral ?? null,
        });
    }
    catch (error) {
        console.error('[DecisionGraph] Failed to write eval summary', error);
    }
    // Best-effort DB persistence of decision for analytics / memory
    try {
        const runId = typeof state.metadata?.progressRunId === 'string' ? state.metadata.progressRunId : undefined;
        await insertTaDecision({
            decision,
            payload,
            ...(runId ? { runId } : {}),
            model: modelId,
            analysts: enabledAnalysts,
            orchestratorVersion: 'langgraph',
            logsPath: evalLogPath ?? promptsLogPath ?? null,
            rawText: null,
            executionMs,
        });
    }
    catch (error) {
        console.error('[DecisionGraph] Failed to persist decision to DB', error);
    }
    return {
        result: decision,
        metadata: {
            ...(state.metadata ?? {}),
            runCompletedAt,
            ...(executionMs !== null ? { executionMs } : {}),
        },
    };
};
const investmentShouldContinue = (state) => {
    const maxRounds = Math.max(1, env.investDebateRounds ?? 1);
    const shouldContinue = canContinueInvestment(state.metadata, maxRounds);
    if (process.env.DEBUG_LANGGRAPH === '1') {
        console.debug('[DecisionGraph] investmentShouldContinue', {
            invest_round: state.metadata?.invest_round,
            invest_continue: state.metadata?.invest_continue,
            maxRounds,
            decision: shouldContinue ? 'continue' : 'stop',
        });
    }
    return shouldContinue ? 'continue' : 'stop';
};
const riskShouldContinue = (state) => {
    const maxRounds = Math.max(1, env.riskDebateRounds ?? 1);
    const shouldContinue = canContinueRisk(state.metadata, maxRounds);
    if (process.env.DEBUG_LANGGRAPH === '1') {
        console.debug('[DecisionGraph] riskShouldContinue', {
            risk_round: state.metadata?.risk_round,
            risk_continue: state.metadata?.risk_continue,
            maxRounds,
            decision: shouldContinue ? 'continue' : 'stop',
        });
    }
    return shouldContinue ? 'continue' : 'stop';
};
const decisionGraph = (() => {
    const graph = new StateGraph(StateAnnotation);
    graph.addNode('LoadMemories', loadMemoriesNode);
    graph.addNode('Analysts', analystsNode);
    graph.addNode('Bear', bearNode);
    graph.addNode('Bull', bullNode);
    graph.addNode('ResearchManager', researchManagerNode);
    graph.addNode('Trader', traderNode);
    graph.addNode('Aggressive', aggressiveNode);
    graph.addNode('Conservative', conservativeNode);
    graph.addNode('Neutral', neutralNode);
    graph.addNode('RiskManager', riskManagerNode);
    graph.addNode('PersistMemories', persistMemoriesNode);
    graph.addNode('Finalize', finalizeNode);
    graph.addEdge(START, 'LoadMemories');
    graph.addEdge('LoadMemories', 'Analysts');
    graph.addEdge('Analysts', 'Bear');
    graph.addEdge('Bear', 'Bull');
    graph.addConditionalEdges('Bull', investmentShouldContinue, {
        continue: 'Bear',
        stop: 'ResearchManager',
    });
    graph.addEdge('ResearchManager', 'Trader');
    graph.addEdge('Trader', 'Aggressive');
    graph.addEdge('Aggressive', 'Conservative');
    graph.addEdge('Conservative', 'Neutral');
    graph.addConditionalEdges('Neutral', riskShouldContinue, {
        continue: 'Aggressive',
        stop: 'RiskManager',
    });
    graph.addEdge('RiskManager', 'PersistMemories');
    graph.addEdge('PersistMemories', 'Finalize');
    graph.addEdge('Finalize', END);
    return graph.compile();
})();
export const getDecisionGraph = () => decisionGraph;
export const runDecisionGraph = async (payload, options) => {
    const normalizedModelId = (options?.modelId ?? payload.modelId ?? env.defaultTradingModel)?.trim() ?? env.defaultTradingModel;
    const normalizedAnalysts = options?.analysts && options.analysts.length > 0
        ? options.analysts
        : payload.analysts && payload.analysts.length > 0
            ? payload.analysts
            : [...DEFAULT_TRADING_ANALYSTS];
    const normalizedPayload = {
        ...payload,
        modelId: normalizedModelId,
        analysts: normalizedAnalysts,
    };
    const runStartedAt = Date.now();
    const baseState = createInitialState(normalizedPayload.symbol, normalizedPayload.tradeDate, normalizedPayload.context);
    const metadata = {
        ...baseState.metadata,
        payload: normalizedPayload,
        modelId: normalizedModelId,
        enabledAnalysts: normalizedAnalysts,
        runStartedAt,
    };
    if (options?.runId) {
        metadata.progressRunId = options.runId;
    }
    const initialState = {
        ...baseState,
        metadata,
    };
    try {
        const finalState = await decisionGraph.invoke(initialState, {
            recursionLimit: env.maxRecursionLimit,
        });
        const executionMs = typeof finalState.metadata?.executionMs === 'number' && Number.isFinite(finalState.metadata.executionMs)
            ? finalState.metadata.executionMs
            : undefined;
        if (!finalState.result) {
            const enabledSet = new Set(normalizedAnalysts);
            const fallback = {
                symbol: normalizedPayload.symbol,
                tradeDate: normalizedPayload.tradeDate,
                decision: 'NO DECISION',
                finalTradeDecision: 'NO DECISION',
                investmentPlan: finalState.investmentPlan ?? null,
                traderPlan: finalState.traderPlan ?? null,
                investmentJudge: finalState.investmentPlan ?? null,
                riskJudge: finalState.finalDecision ?? null,
                modelId: normalizedModelId,
                analysts: normalizedAnalysts,
                debugPrompt: '',
            };
            if (executionMs !== undefined) {
                fallback.executionMs = executionMs;
            }
            else if (typeof finalState.metadata?.runStartedAt === 'number' &&
                Number.isFinite(finalState.metadata.runStartedAt)) {
                fallback.executionMs = Math.max(0, Date.now() - finalState.metadata.runStartedAt);
            }
            else {
                fallback.executionMs = null;
            }
            if (enabledSet.has('market')) {
                fallback.marketReport =
                    coalesceReport(finalState.reports, 'market', normalizedPayload.context.market_technical_report) || null;
            }
            if (enabledSet.has('social')) {
                fallback.sentimentReport =
                    coalesceReport(finalState.reports, 'social', normalizedPayload.context.social_reddit_summary) || null;
            }
            if (enabledSet.has('news')) {
                fallback.newsReport =
                    coalesceReport(finalState.reports, 'news', normalizedPayload.context.news_company) || null;
            }
            if (enabledSet.has('fundamental')) {
                fallback.fundamentalsReport =
                    coalesceReport(finalState.reports, 'fundamentals', normalizedPayload.context.fundamentals_summary) || null;
            }
            return fallback;
        }
        if (executionMs !== undefined && finalState.result.executionMs === undefined) {
            finalState.result.executionMs = executionMs;
        }
        return finalState.result;
    }
    catch (error) {
        const runId = options?.runId;
        if (runId) {
            publishProgressEvent(runId, {
                runId,
                stage: 'finalizing',
                label: 'Workflow error',
                percent: stagePercents.finalizing,
                message: error instanceof Error ? error.message : 'Unknown error',
                modelId: normalizedModelId,
                analysts: normalizedAnalysts,
            });
        }
        throw error;
    }
};
//# sourceMappingURL=decisionWorkflow.js.map
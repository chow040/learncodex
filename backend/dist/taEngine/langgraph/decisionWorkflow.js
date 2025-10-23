import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
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
import { createRiskyAnalystRunnable, createSafeAnalystRunnable, createNeutralAnalystRunnable, buildRiskyUserMessage, buildSafeUserMessage, buildNeutralUserMessage, RISKY_SYSTEM_PROMPT, SAFE_SYSTEM_PROMPT, NEUTRAL_SYSTEM_PROMPT, } from '../langchain/risk/riskAnalystRunnables.js';
import { createRiskManagerRunnable, RISK_MANAGER_SYSTEM_PROMPT, buildRiskManagerUserMessage, } from '../langchain/risk/riskManagerRunnable.js';
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
    metadata: Annotation({
        reducer: (left, right) => ({ ...left, ...right }),
        default: () => ({}),
    }),
    result: Annotation({
        reducer: (_, right) => right,
        default: () => undefined,
    }),
});
const createChatModel = (modelOverride) => {
    if (!env.openAiApiKey) {
        throw new Error('OPENAI_API_KEY is not configured.');
    }
    const options = {
        openAIApiKey: env.openAiApiKey,
        model: modelOverride ?? env.openAiModel,
        temperature: 1,
    };
    if (env.openAiBaseUrl) {
        options.configuration = { baseURL: env.openAiBaseUrl };
    }
    return new ChatOpenAI(options);
};
const appendHistory = (history, label, content) => {
    const trimmed = content?.trim() ?? '';
    if (!trimmed)
        return history ?? '';
    const entry = `${label}: ${trimmed}`;
    return history ? `${history}\n${entry}` : entry;
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
    return trimmed.length > 0 ? trimmed : env.openAiModel;
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
    return {
        metadata: {
            ...(state.metadata ?? {}),
            managerMemories: normalize(managerMemories),
            traderMemories: normalize(traderMemories),
            riskManagerMemories: normalize(riskManagerMemories),
            invest_round: 0,
            risk_round: 0,
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
    };
    const userMessage = buildBearUserMessage(input);
    const output = await runnable.invoke(input);
    return {
        debate: {
            bear: output,
            investment: appendHistory(history, `Bear Analyst (Round ${round})`, output),
        },
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
    };
    const userMessage = buildBullUserMessage(input);
    const output = await runnable.invoke(input);
    return {
        debate: {
            bull: output,
            investment: appendHistory(history, `Bull Analyst (Round ${round})`, output),
        },
        conversationLog: [
            {
                roleLabel: 'Bull Analyst',
                system: BULL_SYSTEM_PROMPT,
                user: userMessage,
            },
        ],
        metadata: {
            ...(state.metadata ?? {}),
            invest_round: round,
        },
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
const riskyNode = async (state) => {
    const llm = createChatModel(resolveModelId(state));
    const runnable = createRiskyAnalystRunnable(llm);
    const context = buildDebateContext(state);
    const round = Number(state.metadata?.risk_round ?? 0) + 1;
    emitStage(state, 'risk_debate', 'Risk debate analysis', `Risk round ${round}`, round);
    const history = state.debate?.risk ?? '';
    const input = {
        context,
        traderPlan: state.traderPlan ?? '',
        history,
    };
    if (state.debate?.risky)
        input.lastRisky = state.debate.risky;
    if (state.debate?.safe)
        input.lastSafe = state.debate.safe;
    if (state.debate?.neutral)
        input.lastNeutral = state.debate.neutral;
    const userMessage = buildRiskyUserMessage(input);
    const output = await runnable.invoke(input);
    return {
        debate: {
            risky: output,
            risk: appendHistory(history, `Risky Analyst (Round ${round})`, output),
        },
        conversationLog: [
            {
                roleLabel: 'Risky Analyst',
                system: RISKY_SYSTEM_PROMPT,
                user: userMessage,
            },
        ],
    };
};
const safeNode = async (state) => {
    const llm = createChatModel(resolveModelId(state));
    const runnable = createSafeAnalystRunnable(llm);
    const context = buildDebateContext(state);
    const round = Number(state.metadata?.risk_round ?? 0) + 1;
    const history = state.debate?.risk ?? '';
    const input = {
        context,
        traderPlan: state.traderPlan ?? '',
        history,
    };
    if (state.debate?.risky)
        input.lastRisky = state.debate.risky;
    if (state.debate?.safe)
        input.lastSafe = state.debate.safe;
    if (state.debate?.neutral)
        input.lastNeutral = state.debate.neutral;
    const userMessage = buildSafeUserMessage(input);
    const output = await runnable.invoke(input);
    return {
        debate: {
            safe: output,
            risk: appendHistory(history, `Safe Analyst (Round ${round})`, output),
        },
        conversationLog: [
            {
                roleLabel: 'Safe Analyst',
                system: SAFE_SYSTEM_PROMPT,
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
    };
    if (state.debate?.risky)
        input.lastRisky = state.debate.risky;
    if (state.debate?.safe)
        input.lastSafe = state.debate.safe;
    if (state.debate?.neutral)
        input.lastNeutral = state.debate.neutral;
    const userMessage = buildNeutralUserMessage(input);
    const output = await runnable.invoke(input);
    return {
        debate: {
            neutral: output,
            risk: appendHistory(history, `Neutral Analyst (Round ${round})`, output),
        },
        conversationLog: [
            {
                roleLabel: 'Neutral Analyst',
                system: NEUTRAL_SYSTEM_PROMPT,
                user: userMessage,
            },
        ],
        metadata: {
            ...(state.metadata ?? {}),
            risk_round: round,
        },
    };
};
const riskManagerNode = async (state) => {
    const llm = createChatModel(resolveModelId(state));
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
    const decisionToken = normalizeDecision(output);
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
            bullArg: state.debate?.bull ?? null,
            bearArg: state.debate?.bear ?? null,
            riskDebateHistory: state.debate?.risk ?? '',
            riskyOut: state.debate?.risky ?? null,
            safeOut: state.debate?.safe ?? null,
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
        });
    }
    catch (error) {
        console.error('[DecisionGraph] Failed to persist decision to DB', error);
    }
    return {
        result: decision,
    };
};
const investmentShouldContinue = (state) => {
    const maxRounds = Math.max(1, env.investDebateRounds ?? 1);
    const completed = Number(state.metadata?.invest_round ?? 0);
    return completed < maxRounds ? 'continue' : 'stop';
};
const riskShouldContinue = (state) => {
    const maxRounds = Math.max(1, env.riskDebateRounds ?? 1);
    const completed = Number(state.metadata?.risk_round ?? 0);
    return completed < maxRounds ? 'continue' : 'stop';
};
const decisionGraph = (() => {
    const graph = new StateGraph(StateAnnotation);
    graph.addNode('LoadMemories', loadMemoriesNode);
    graph.addNode('Analysts', analystsNode);
    graph.addNode('Bear', bearNode);
    graph.addNode('Bull', bullNode);
    graph.addNode('ResearchManager', researchManagerNode);
    graph.addNode('Trader', traderNode);
    graph.addNode('Risky', riskyNode);
    graph.addNode('Safe', safeNode);
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
    graph.addEdge('Trader', 'Risky');
    graph.addEdge('Risky', 'Safe');
    graph.addEdge('Safe', 'Neutral');
    graph.addConditionalEdges('Neutral', riskShouldContinue, {
        continue: 'Risky',
        stop: 'RiskManager',
    });
    graph.addEdge('RiskManager', 'PersistMemories');
    graph.addEdge('PersistMemories', 'Finalize');
    graph.addEdge('Finalize', END);
    return graph.compile();
})();
export const runDecisionGraph = async (payload, options) => {
    const normalizedModelId = (options?.modelId ?? payload.modelId ?? env.openAiModel)?.trim() ?? env.openAiModel;
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
    const initialState = {
        ...createInitialState(normalizedPayload.symbol, normalizedPayload.tradeDate, normalizedPayload.context),
        metadata: {
            payload: normalizedPayload,
            progressRunId: options?.runId,
            modelId: normalizedModelId,
            enabledAnalysts: normalizedAnalysts,
        },
    };
    try {
        const finalState = await decisionGraph.invoke(initialState);
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
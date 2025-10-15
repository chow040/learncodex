import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { env } from '../../config/env.js';
import { logAgentPrompts, writeEvalSummary } from '../logger.js';
import { insertTaDecision } from '../../db/taDecisionRepository.js';
import { getPastMemories, appendMemory } from '../memoryStore.js';
import { getRoleSummaries } from '../../services/pastResultsService.js';
import { runAnalystStage } from './analystsWorkflow.js';
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
const createChatModel = () => {
    if (!env.openAiApiKey) {
        throw new Error('OPENAI_API_KEY is not configured.');
    }
    const options = {
        openAIApiKey: env.openAiApiKey,
        model: env.openAiModel,
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
const buildDebateContext = (state) => ({
    ...state.context,
    market_technical_report: coalesceReport(state.reports, 'market', state.context.market_technical_report),
    social_reddit_summary: coalesceReport(state.reports, 'social', state.context.social_reddit_summary),
    news_global: coalesceReport(state.reports, 'news', state.context.news_global),
    news_company: coalesceReport(state.reports, 'news', state.context.news_company),
    fundamentals_summary: coalesceReport(state.reports, 'fundamentals', state.context.fundamentals_summary),
});
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
    // Prefer DB-backed summaries if enabled; fall back to file memories
    if (env.useDbMemories) {
        try {
            const summaries = await getRoleSummaries(symbol, tradeDate);
            return {
                metadata: {
                    managerMemories: summaries.manager ?? '',
                    traderMemories: summaries.trader ?? '',
                    riskManagerMemories: summaries.risk ?? '',
                    invest_round: 0,
                    risk_round: 0,
                },
            };
        }
        catch (error) {
            console.warn(`[DecisionGraph] DB-backed memories unavailable for ${symbol}; falling back to file store`, error);
        }
    }
    const fetchMemory = async (role) => {
        try {
            return await getPastMemories(symbol, role);
        }
        catch (error) {
            console.error(`[DecisionGraph] Failed to load ${role} memories for ${symbol}`, error);
            return '';
        }
    };
    const [managerMemories, traderMemories, riskManagerMemories] = await Promise.all([
        fetchMemory('manager'),
        fetchMemory('trader'),
        fetchMemory('riskManager'),
    ]);
    return {
        metadata: {
            managerMemories,
            traderMemories,
            riskManagerMemories,
            invest_round: 0,
            risk_round: 0,
        },
    };
};
const analystsNode = async (state) => {
    const { reports, conversationLog } = await runAnalystStage(state.symbol, state.tradeDate, state.context);
    return {
        reports,
        conversationLog,
    };
};
const bearNode = async (state) => {
    const llm = createChatModel();
    const runnable = createBearDebateRunnable(llm);
    const context = buildDebateContext(state);
    const round = Number(state.metadata?.invest_round ?? 0) + 1;
    const history = state.debate?.investment ?? '';
    const opponentArgument = state.debate?.bull ?? '';
    const input = {
        context,
        symbol: state.symbol,
        tradeDate: state.tradeDate,
        history,
        opponentArgument,
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
    const llm = createChatModel();
    const runnable = createBullDebateRunnable(llm);
    const context = buildDebateContext(state);
    const completedRounds = Number(state.metadata?.invest_round ?? 0);
    const round = completedRounds + 1;
    const history = state.debate?.investment ?? '';
    const opponentArgument = state.debate?.bear ?? '';
    const input = {
        context,
        symbol: state.symbol,
        tradeDate: state.tradeDate,
        history,
        opponentArgument,
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
            invest_round: round,
        },
    };
};
const researchManagerNode = async (state) => {
    const llm = createChatModel();
    const runnable = createResearchManagerRunnable(llm);
    const managerMemories = state.metadata?.managerMemories ?? '';
    const debateHistory = state.debate?.investment ?? '';
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
    const llm = createChatModel();
    const runnable = createTraderRunnable(llm);
    const traderMemories = state.metadata?.traderMemories ?? '';
    const marketReport = coalesceReport(state.reports, 'market', state.context.market_technical_report);
    const sentimentReport = coalesceReport(state.reports, 'social', state.context.social_reddit_summary);
    const newsReport = coalesceReport(state.reports, 'news', state.context.news_company);
    const fundamentalsReport = coalesceReport(state.reports, 'fundamentals', state.context.fundamentals_summary);
    const plan = state.investmentPlan ?? '';
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
    const llm = createChatModel();
    const runnable = createRiskyAnalystRunnable(llm);
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
    const llm = createChatModel();
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
    const llm = createChatModel();
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
            risk_round: round,
        },
    };
};
const riskManagerNode = async (state) => {
    const llm = createChatModel();
    const runnable = createRiskManagerRunnable(llm);
    const riskMemories = state.metadata?.riskManagerMemories ?? '';
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
            decision_token: decisionToken,
        },
    };
};
const persistMemoriesNode = async (state) => {
    const date = state.tradeDate || new Date().toISOString().slice(0, 10);
    const symbol = state.symbol;
    const tasks = [];
    if (state.investmentPlan) {
        tasks.push(appendMemory({
            symbol,
            date,
            role: 'manager',
            summary: `Plan: ${truncate(state.investmentPlan)}`,
        }));
    }
    if (state.traderPlan) {
        tasks.push(appendMemory({
            symbol,
            date,
            role: 'trader',
            summary: `Trader: ${truncate(state.traderPlan)}`,
        }));
    }
    if (state.finalDecision) {
        const decisionToken = state.metadata?.decision_token ?? normalizeDecision(state.finalDecision);
        tasks.push(appendMemory({
            symbol,
            date,
            role: 'riskManager',
            summary: `Risk: ${truncate(state.finalDecision)} | Decision: ${decisionToken}`,
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
    const decision = {
        symbol: state.symbol,
        tradeDate: state.tradeDate,
        decision: decisionToken,
        finalTradeDecision: decisionToken,
        investmentPlan: state.investmentPlan ?? null,
        traderPlan: state.traderPlan ?? null,
        investmentJudge: state.investmentPlan ?? null,
        riskJudge: state.finalDecision ?? null,
        marketReport: coalesceReport(state.reports, 'market', state.context.market_technical_report) || null,
        sentimentReport: coalesceReport(state.reports, 'social', state.context.social_reddit_summary) || null,
        newsReport: coalesceReport(state.reports, 'news', state.context.news_company) || null,
        fundamentalsReport: coalesceReport(state.reports, 'fundamentals', state.context.fundamentals_summary) || null,
        debugPrompt: '',
    };
    const payload = {
        symbol: state.symbol,
        tradeDate: state.tradeDate,
        context: state.context,
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
        await insertTaDecision({
            decision,
            payload,
            model: env.openAiModel,
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
export const runDecisionGraph = async (payload) => {
    const initialState = {
        ...createInitialState(payload.symbol, payload.tradeDate, payload.context),
        metadata: {
            payload,
        },
    };
    const finalState = await decisionGraph.invoke(initialState);
    if (!finalState.result) {
        return {
            symbol: payload.symbol,
            tradeDate: payload.tradeDate,
            decision: 'NO DECISION',
            finalTradeDecision: 'NO DECISION',
            investmentPlan: finalState.investmentPlan ?? null,
            traderPlan: finalState.traderPlan ?? null,
            investmentJudge: finalState.investmentPlan ?? null,
            riskJudge: finalState.finalDecision ?? null,
            marketReport: coalesceReport(finalState.reports, 'market', payload.context.market_technical_report) || null,
            sentimentReport: coalesceReport(finalState.reports, 'social', payload.context.social_reddit_summary) || null,
            newsReport: coalesceReport(finalState.reports, 'news', payload.context.news_company) || null,
            fundamentalsReport: coalesceReport(finalState.reports, 'fundamentals', payload.context.fundamentals_summary) || null,
            debugPrompt: '',
        };
    }
    return finalState.result;
};
//# sourceMappingURL=decisionWorkflow.js.map
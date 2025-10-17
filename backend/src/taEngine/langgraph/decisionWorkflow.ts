import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';

import { env } from '../../config/env.js';
import { logAgentPrompts, writeEvalSummary } from '../logger.js';
import { insertTaDecision } from '../../db/taDecisionRepository.js';
import { getPastMemories, appendMemory } from '../memoryStore.js';
import { getRoleSummaries } from '../../services/pastResultsService.js';
import type { TradingAgentsPayload, TradingAgentsDecision } from '../types.js';
import type { AgentsContext } from '../types.js';
import { runAnalystStage } from './analystsWorkflow.js';
import { publishProgressEvent, type ProgressEvent, type ProgressStage } from '../../services/tradingProgressService.js';
import {
  DEFAULT_TRADING_ANALYSTS,
  isTradingAnalystId,
  type TradingAnalystId,
} from '../../constants/tradingAgents.js';
import {
  createInitialState,
  type AnalystReports,
  type DebateHistory,
  type GraphState,
} from './types.js';
import {
  BEAR_SYSTEM_PROMPT,
  buildBearUserMessage,
  createBearDebateRunnable,
} from '../langchain/debates/bearRunnable.js';
import {
  BULL_SYSTEM_PROMPT,
  buildBullUserMessage,
  createBullDebateRunnable,
} from '../langchain/debates/bullRunnable.js';
import {
  createResearchManagerRunnable,
  RESEARCH_MANAGER_SYSTEM_PROMPT,
  buildResearchManagerUserMessage,
} from '../langchain/judges/researchManagerRunnable.js';
import {
  createTraderRunnable,
  TRADER_SYSTEM_PROMPT,
  buildTraderUserMessage,
} from '../langchain/trader/traderRunnable.js';
import {
  createRiskyAnalystRunnable,
  createSafeAnalystRunnable,
  createNeutralAnalystRunnable,
  buildRiskyUserMessage,
  buildSafeUserMessage,
  buildNeutralUserMessage,
  RISKY_SYSTEM_PROMPT,
  SAFE_SYSTEM_PROMPT,
  NEUTRAL_SYSTEM_PROMPT,
  type RiskDebateInput,
} from '../langchain/risk/riskAnalystRunnables.js';
import {
  createRiskManagerRunnable,
  RISK_MANAGER_SYSTEM_PROMPT,
  buildRiskManagerUserMessage,
} from '../langchain/risk/riskManagerRunnable.js';

type ConversationLogEntry = GraphState['conversationLog'][number];

const StateAnnotation = Annotation.Root({
  symbol: Annotation<string>(),
  tradeDate: Annotation<string>(),
  context: Annotation<AgentsContext>(),
  reports: Annotation<AnalystReports>({
    reducer: (_, right) => right,
    default: () => ({}),
  }),
  investmentPlan: Annotation<string | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  traderPlan: Annotation<string | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  finalDecision: Annotation<string | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  conversationLog: Annotation<ConversationLogEntry[]>({
    default: () => [],
    reducer: (left, right) => left.concat(right),
  }),
  debate: Annotation<DebateHistory>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  metadata: Annotation<Record<string, unknown>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  result: Annotation<TradingAgentsDecision | undefined>({
    reducer: (_, right) => right,
    default: () => undefined,
  }),
});

type State = typeof StateAnnotation.State;

const createChatModel = (modelOverride?: string): ChatOpenAI => {
  if (!env.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  const options: Record<string, unknown> = {
    openAIApiKey: env.openAiApiKey,
    model: modelOverride ?? env.openAiModel,
    temperature: 1,
  };
  if (env.openAiBaseUrl) {
    options.configuration = { baseURL: env.openAiBaseUrl };
  }
  return new ChatOpenAI(options);
};

const appendHistory = (history: string | undefined, label: string, content: string): string => {
  const trimmed = content?.trim() ?? '';
  if (!trimmed) return history ?? '';
  const entry = `${label}: ${trimmed}`;
  return history ? `${history}\n${entry}` : entry;
};

const coalesce = (value: string | null | undefined, fallback: string | null | undefined): string =>
  value && value.trim().length > 0 ? value : (fallback ?? '');

const coalesceReport = (
  reports: AnalystReports,
  key: keyof AnalystReports,
  fallback: string | null | undefined,
): string => coalesce(reports[key], fallback);

const stagePercents: Record<ProgressStage, number> = {
  queued: 0,
  analysts: 15,
  investment_debate: 45,
  research_manager: 60,
  trader: 70,
  risk_debate: 85,
  risk_manager: 95,
  finalizing: 100,
};

const resolveModelId = (state: State): string => {
  const raw = (state.metadata?.modelId as string | undefined) ?? '';
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : env.openAiModel;
};

const resolveEnabledAnalysts = (state: State): TradingAnalystId[] => {
  const raw = state.metadata?.enabledAnalysts;
  if (Array.isArray(raw)) {
    const set = new Set<TradingAnalystId>();
    for (const entry of raw) {
      if (typeof entry !== 'string') continue;
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

const emitStage = (
  state: State,
  stage: ProgressStage,
  label: string,
  message?: string,
  iteration?: number,
) => {
  const runId = typeof state.metadata?.progressRunId === 'string' ? state.metadata.progressRunId : null;
  if (!runId) return;
  const payload: Omit<ProgressEvent, 'timestamp'> = {
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

const buildDebateContext = (state: State): AgentsContext => ({
  ...state.context,
  market_technical_report: coalesceReport(state.reports, 'market', state.context.market_technical_report),
  social_reddit_summary: coalesceReport(state.reports, 'social', state.context.social_reddit_summary),
  news_global: coalesceReport(state.reports, 'news', state.context.news_global),
  news_company: coalesceReport(state.reports, 'news', state.context.news_company),
  fundamentals_summary: coalesceReport(
    state.reports,
    'fundamentals',
    state.context.fundamentals_summary,
  ),
});

const truncate = (input: string | null | undefined, limit = 240): string =>
  (input ?? '').slice(0, limit);

const normalizeDecision = (text: string | null | undefined): string => {
  const value = (text ?? '').toString();
  const match = value.match(
    /^\s*(?:#+\s*)?(?:Final\s+(?:Recommendation|Decision|Verdict))\s*[:\-]\s*\**\s*(BUY|SELL|HOLD)\s*\**/im,
  );
  if (match && match[1]) return match[1].toUpperCase();
  const tokens = [...value.toUpperCase().matchAll(/\b(BUY|SELL|HOLD)\b/g)];
  if (tokens.length) {
    const lastMatch = tokens[tokens.length - 1]!;
    const extracted = (lastMatch[1] ?? lastMatch[0] ?? '').toUpperCase();
    if (extracted) return extracted;
  }
  return 'NO DECISION';
};

const loadMemoriesNode = async (state: State) => {
  const symbol = state.symbol;
  const tradeDate = state.tradeDate || new Date().toISOString().slice(0, 10);

  // Prefer DB-backed summaries if enabled; fall back to file memories
  if (env.useDbMemories) {
    try {
      const summaries = await getRoleSummaries(symbol, tradeDate);
      return {
        metadata: {
          ...(state.metadata ?? {}),
          managerMemories: summaries.manager ?? '',
          traderMemories: summaries.trader ?? '',
          riskManagerMemories: summaries.risk ?? '',
          invest_round: 0,
          risk_round: 0,
        },
      };
    } catch (error) {
      console.warn(`[DecisionGraph] DB-backed memories unavailable for ${symbol}; falling back to file store`, error);
    }
  }

  const fetchMemory = async (role: 'manager' | 'trader' | 'riskManager'): Promise<string> => {
    try {
      return await getPastMemories(symbol, role);
    } catch (error) {
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
      ...(state.metadata ?? {}),
      managerMemories,
      traderMemories,
      riskManagerMemories,
      invest_round: 0,
      risk_round: 0,
    },
  };
};

const analystsNode = async (state: State) => {
  emitStage(state, 'analysts', 'Running analyst stage');
  const modelId = resolveModelId(state);
  const enabledAnalysts = resolveEnabledAnalysts(state);
  const { reports, conversationLog } = await runAnalystStage(
    state.symbol,
    state.tradeDate,
    state.context,
    {
      modelId,
      enabledAnalysts,
    },
  );
  return {
    reports,
    conversationLog,
  };
};

const bearNode = async (state: State) => {
  const llm = createChatModel(resolveModelId(state));
  const runnable = createBearDebateRunnable(llm);
  const context = buildDebateContext(state);
  const round = Number(state.metadata?.invest_round ?? 0) + 1;
  emitStage(state, 'investment_debate', 'Investment debate', `Bear vs Bull round ${round}`, round);
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

const bullNode = async (state: State) => {
  const llm = createChatModel(resolveModelId(state));
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
      ...(state.metadata ?? {}),
      invest_round: round,
    },
  };
};

const researchManagerNode = async (state: State) => {
  const llm = createChatModel(resolveModelId(state));
  const runnable = createResearchManagerRunnable(llm);
  const managerMemories = (state.metadata?.managerMemories as string) ?? '';
  const debateHistory = state.debate?.investment ?? '';

  emitStage(state, 'research_manager', 'Research manager synthesis');

  const marketReport = coalesceReport(state.reports, 'market', state.context.market_technical_report);
  const sentimentReport = coalesceReport(state.reports, 'social', state.context.social_reddit_summary);
  const newsReport = coalesceReport(state.reports, 'news', state.context.news_company);
  const fundamentalsReport = coalesceReport(
    state.reports,
    'fundamentals',
    state.context.fundamentals_summary,
  );

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

const traderNode = async (state: State) => {
  const llm = createChatModel(resolveModelId(state));
  const runnable = createTraderRunnable(llm);
  const traderMemories = (state.metadata?.traderMemories as string) ?? '';

  const marketReport = coalesceReport(state.reports, 'market', state.context.market_technical_report);
  const sentimentReport = coalesceReport(state.reports, 'social', state.context.social_reddit_summary);
  const newsReport = coalesceReport(state.reports, 'news', state.context.news_company);
  const fundamentalsReport = coalesceReport(
    state.reports,
    'fundamentals',
    state.context.fundamentals_summary,
  );

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

const riskyNode = async (state: State) => {
  const llm = createChatModel(resolveModelId(state));
  const runnable = createRiskyAnalystRunnable(llm);
  const context = buildDebateContext(state);
  const round = Number(state.metadata?.risk_round ?? 0) + 1;
  emitStage(state, 'risk_debate', 'Risk debate analysis', `Risk round ${round}`, round);
  const history = state.debate?.risk ?? '';

  const input: RiskDebateInput = {
    context,
    traderPlan: state.traderPlan ?? '',
    history,
  };
  if (state.debate?.risky) input.lastRisky = state.debate.risky;
  if (state.debate?.safe) input.lastSafe = state.debate.safe;
  if (state.debate?.neutral) input.lastNeutral = state.debate.neutral;
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

const safeNode = async (state: State) => {
  const llm = createChatModel(resolveModelId(state));
  const runnable = createSafeAnalystRunnable(llm);
  const context = buildDebateContext(state);
  const round = Number(state.metadata?.risk_round ?? 0) + 1;
  const history = state.debate?.risk ?? '';

  const input: RiskDebateInput = {
    context,
    traderPlan: state.traderPlan ?? '',
    history,
  };
  if (state.debate?.risky) input.lastRisky = state.debate.risky;
  if (state.debate?.safe) input.lastSafe = state.debate.safe;
  if (state.debate?.neutral) input.lastNeutral = state.debate.neutral;
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

const neutralNode = async (state: State) => {
  const llm = createChatModel(resolveModelId(state));
  const runnable = createNeutralAnalystRunnable(llm);
  const context = buildDebateContext(state);
  const completedRounds = Number(state.metadata?.risk_round ?? 0);
  const round = completedRounds + 1;
  const history = state.debate?.risk ?? '';

  const input: RiskDebateInput = {
    context,
    traderPlan: state.traderPlan ?? '',
    history,
  };
  if (state.debate?.risky) input.lastRisky = state.debate.risky;
  if (state.debate?.safe) input.lastSafe = state.debate.safe;
  if (state.debate?.neutral) input.lastNeutral = state.debate.neutral;
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

const riskManagerNode = async (state: State) => {
  const llm = createChatModel(resolveModelId(state));
  const runnable = createRiskManagerRunnable(llm);
  const riskMemories = (state.metadata?.riskManagerMemories as string) ?? '';

  emitStage(state, 'risk_manager', 'Risk manager verdict');

  const marketReport = coalesceReport(state.reports, 'market', state.context.market_technical_report);
  const sentimentReport = coalesceReport(state.reports, 'social', state.context.social_reddit_summary);
  const newsReport = coalesceReport(state.reports, 'news', state.context.news_company);
  const fundamentalsReport = coalesceReport(
    state.reports,
    'fundamentals',
    state.context.fundamentals_summary,
  );

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

const persistMemoriesNode = async (state: State) => {
  const date = state.tradeDate || new Date().toISOString().slice(0, 10);
  const symbol = state.symbol;

  emitStage(state, 'finalizing', 'Finalizing decision outputs');

  const tasks: Array<Promise<void>> = [];

  if (state.investmentPlan) {
    tasks.push(
      appendMemory({
        symbol,
        date,
        role: 'manager',
        summary: `Plan: ${truncate(state.investmentPlan)}`,
      }),
    );
  }
  if (state.traderPlan) {
    tasks.push(
      appendMemory({
        symbol,
        date,
        role: 'trader',
        summary: `Trader: ${truncate(state.traderPlan)}`,
      }),
    );
  }
  if (state.finalDecision) {
    const decisionToken = (state.metadata?.decision_token as string) ?? normalizeDecision(state.finalDecision);
    tasks.push(
      appendMemory({
        symbol,
        date,
        role: 'riskManager',
        summary: `Risk: ${truncate(state.finalDecision)} | Decision: ${decisionToken}`,
      }),
    );
  }

  if (tasks.length) {
    await Promise.allSettled(tasks);
  }

  return {};
};

const finalizeNode = async (state: State) => {
  const decisionToken =
    (state.metadata?.decision_token as string | undefined) ??
    normalizeDecision(state.finalDecision);

  const modelId = resolveModelId(state);
  const enabledAnalysts = resolveEnabledAnalysts(state);
  const decision: TradingAgentsDecision = {
    symbol: state.symbol,
    tradeDate: state.tradeDate,
    decision: decisionToken,
    finalTradeDecision: decisionToken,
    investmentPlan: state.investmentPlan ?? null,
    traderPlan: state.traderPlan ?? null,
    investmentJudge: state.investmentPlan ?? null,
    riskJudge: state.finalDecision ?? null,
    marketReport: coalesceReport(state.reports, 'market', state.context.market_technical_report) || null,
    sentimentReport:
      coalesceReport(state.reports, 'social', state.context.social_reddit_summary) || null,
    newsReport: coalesceReport(state.reports, 'news', state.context.news_company) || null,
    fundamentalsReport:
      coalesceReport(state.reports, 'fundamentals', state.context.fundamentals_summary) || null,
    modelId,
    analysts: enabledAnalysts,
    debugPrompt: '',
  };

  const payload: TradingAgentsPayload = {
    symbol: state.symbol,
    tradeDate: state.tradeDate,
    context: state.context,
    modelId,
    analysts: enabledAnalysts,
  };

  let promptsLogPath: string | null = null;
  try {
    if (state.conversationLog.length) {
      promptsLogPath = await logAgentPrompts(payload, state.conversationLog, 'langgraph');
    }
  } catch (error) {
    console.error('[DecisionGraph] Failed to log agent prompts', error);
  }

  let evalLogPath: string | null = null;
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
  } catch (error) {
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
  } catch (error) {
    console.error('[DecisionGraph] Failed to persist decision to DB', error);
  }

  return {
    result: decision,
  };
};

const investmentShouldContinue = (state: State): 'continue' | 'stop' => {
  const maxRounds = Math.max(1, env.investDebateRounds ?? 1);
  const completed = Number(state.metadata?.invest_round ?? 0);
  return completed < maxRounds ? 'continue' : 'stop';
};

const riskShouldContinue = (state: State): 'continue' | 'stop' => {
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

  graph.addEdge(START, 'LoadMemories' as any);
  graph.addEdge('LoadMemories' as any, 'Analysts' as any);
  graph.addEdge('Analysts' as any, 'Bear' as any);
  graph.addEdge('Bear' as any, 'Bull' as any);
  graph.addConditionalEdges('Bull' as any, investmentShouldContinue, {
    continue: 'Bear',
    stop: 'ResearchManager',
  } as any);
  graph.addEdge('ResearchManager' as any, 'Trader' as any);
  graph.addEdge('Trader' as any, 'Risky' as any);
  graph.addEdge('Risky' as any, 'Safe' as any);
  graph.addEdge('Safe' as any, 'Neutral' as any);
  graph.addConditionalEdges('Neutral' as any, riskShouldContinue, {
    continue: 'Risky',
    stop: 'RiskManager',
  } as any);
  graph.addEdge('RiskManager' as any, 'PersistMemories' as any);
  graph.addEdge('PersistMemories' as any, 'Finalize' as any);
  graph.addEdge('Finalize' as any, END);

  return graph.compile();
})();

export const runDecisionGraph = async (
  payload: TradingAgentsPayload,
  options?: { runId?: string; modelId?: string; analysts?: TradingAnalystId[] },
): Promise<TradingAgentsDecision> => {
  const normalizedModelId = (options?.modelId ?? payload.modelId ?? env.openAiModel)?.trim() ?? env.openAiModel;
  const normalizedAnalysts = options?.analysts && options.analysts.length > 0
    ? options.analysts
    : payload.analysts && payload.analysts.length > 0
      ? payload.analysts
      : [...DEFAULT_TRADING_ANALYSTS];

  const normalizedPayload: TradingAgentsPayload = {
    ...payload,
    modelId: normalizedModelId,
    analysts: normalizedAnalysts,
  };

  const initialState: GraphState = {
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
      return {
        symbol: normalizedPayload.symbol,
        tradeDate: normalizedPayload.tradeDate,
        decision: 'NO DECISION',
        finalTradeDecision: 'NO DECISION',
        investmentPlan: finalState.investmentPlan ?? null,
        traderPlan: finalState.traderPlan ?? null,
        investmentJudge: finalState.investmentPlan ?? null,
        riskJudge: finalState.finalDecision ?? null,
        marketReport: coalesceReport(finalState.reports, 'market', normalizedPayload.context.market_technical_report) || null,
        sentimentReport: coalesceReport(finalState.reports, 'social', normalizedPayload.context.social_reddit_summary) || null,
        newsReport: coalesceReport(finalState.reports, 'news', normalizedPayload.context.news_company) || null,
        fundamentalsReport: coalesceReport(finalState.reports, 'fundamentals', normalizedPayload.context.fundamentals_summary) || null,
        modelId: normalizedModelId,
        analysts: normalizedAnalysts,
        debugPrompt: '',
      };
    }
    return finalState.result;
  } catch (error) {
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

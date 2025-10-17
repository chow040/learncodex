import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';

import { env } from '../../config/env.js';
import { ensureLangchainToolsRegistered } from '../langchain/tools/bootstrap.js';
import { createAnalystRunnable } from '../langchain/analysts/index.js';
import {
  buildMarketCollaborationHeader,
  buildMarketUserContext,
  MARKET_SYSTEM_PROMPT,
} from '../langchain/analysts/marketRunnable.js';
import {
  buildNewsCollaborationHeader,
  buildNewsUserContext,
  NEWS_SYSTEM_PROMPT,
} from '../langchain/analysts/newsRunnable.js';
import {
  buildSocialCollaborationHeader,
  buildSocialUserContext,
  SOCIAL_SYSTEM_PROMPT,
} from '../langchain/analysts/socialRunnable.js';
import {
  buildFundamentalsCollaborationHeader,
  buildFundamentalsUserContext,
  FUNDAMENTALS_SYSTEM_PROMPT,
} from '../langchain/analysts/fundamentalsRunnable.js';
import type { AnalystNodeContext } from '../langchain/types.js';
import {
  createInitialState,
  type GraphState,
  type AnalystReports,
  type DebateHistory,
  type ConversationLogEntry,
} from './types.js';
import type { AgentsContext } from '../types.js';
import {
  DEFAULT_TRADING_ANALYSTS,
  isTradingAnalystId,
  type TradingAnalystId,
} from '../../constants/tradingAgents.js';

ensureLangchainToolsRegistered();

const resolveModelId = (state: typeof StateAnnotation.State): string => {
  const raw = (state.metadata?.modelId as string | undefined) ?? '';
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : env.openAiModel;
};

const resolveEnabledAnalysts = (state: typeof StateAnnotation.State): Set<TradingAnalystId> => {
  const raw = state.metadata?.enabledAnalysts;
  if (Array.isArray(raw)) {
    const result = new Set<TradingAnalystId>();
    for (const entry of raw) {
      if (typeof entry !== 'string') continue;
      const normalized = entry.trim().toLowerCase();
      if (isTradingAnalystId(normalized)) {
        result.add(normalized);
      }
    }
    if (result.size > 0) {
      return result;
    }
  }
  return new Set(DEFAULT_TRADING_ANALYSTS);
};

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
});

const buildAnalystContext = (
  base: Pick<AnalystNodeContext, 'symbol' | 'tradeDate' | 'agentsContext'>,
): AnalystNodeContext => ({
  ...base,
  tools: {},
});

const analystNode = async (state: typeof StateAnnotation.State) => {
  const modelId = resolveModelId(state);
  const enabledAnalysts = resolveEnabledAnalysts(state);
  const llmOptions: any = {
    openAIApiKey: env.openAiApiKey,
    model: modelId,
    temperature: 1,
  };
  if (env.openAiBaseUrl) {
    llmOptions.configuration = { baseURL: env.openAiBaseUrl };
  }
  const llm = new ChatOpenAI(llmOptions);

  const baseOptions = {
    symbol: state.symbol,
    tradeDate: state.tradeDate,
    agentsContext: state.context,
    llm,
  };

  const logs: ConversationLogEntry[] = [];
  const reports: AnalystReports = { ...state.reports };

  const runAnalyst = async (
    id: string,
    label: string,
    buildHeader: (context: AnalystNodeContext) => string,
    buildUserContextFn: (ctx: AgentsContext) => string,
    systemPrompt: string,
    key: keyof AnalystReports,
  ) => {
    const runnable = createAnalystRunnable(id, baseOptions);
    const report = (await runnable.invoke(state.context)) as string;
    const header = buildHeader(
      buildAnalystContext({
        symbol: state.symbol,
        tradeDate: state.tradeDate,
        agentsContext: state.context,
      }),
    );
    const user = buildUserContextFn(state.context);
    logs.push({
      roleLabel: label,
      system: systemPrompt,
      user: `${header}\n\n${user}`,
    });
    reports[key] = report;
  };

  const analystConfigs: Array<{
    personaId: TradingAnalystId;
    runnableId: string;
    label: string;
    buildHeader: (context: AnalystNodeContext) => string;
    buildUserContextFn: (ctx: AgentsContext) => string;
    systemPrompt: string;
    key: keyof AnalystReports;
  }> = [
    {
      personaId: 'market',
      runnableId: 'MarketAnalyst',
      label: 'Market Analyst',
      buildHeader: buildMarketCollaborationHeader,
      buildUserContextFn: buildMarketUserContext,
      systemPrompt: MARKET_SYSTEM_PROMPT,
      key: 'market',
    },
    {
      personaId: 'news',
      runnableId: 'NewsAnalyst',
      label: 'News Analyst',
      buildHeader: buildNewsCollaborationHeader,
      buildUserContextFn: buildNewsUserContext,
      systemPrompt: NEWS_SYSTEM_PROMPT,
      key: 'news',
    },
    {
      personaId: 'social',
      runnableId: 'SocialAnalyst',
      label: 'Social Analyst',
      buildHeader: buildSocialCollaborationHeader,
      buildUserContextFn: buildSocialUserContext,
      systemPrompt: SOCIAL_SYSTEM_PROMPT,
      key: 'social',
    },
    {
      personaId: 'fundamental',
      runnableId: 'FundamentalsAnalyst',
      label: 'Fundamentals Analyst',
      buildHeader: buildFundamentalsCollaborationHeader,
      buildUserContextFn: buildFundamentalsUserContext,
      systemPrompt: FUNDAMENTALS_SYSTEM_PROMPT,
      key: 'fundamentals',
    },
  ];

  for (const config of analystConfigs) {
    if (!enabledAnalysts.has(config.personaId)) continue;
    await runAnalyst(
      config.runnableId,
      config.label,
      config.buildHeader,
      config.buildUserContextFn,
      config.systemPrompt,
      config.key,
    );
  }

  return {
    reports,
    conversationLog: logs,
  };
};

const analystGraph = (() => {
  const graph = new StateGraph(StateAnnotation);
  graph.addNode('RunAnalysts', analystNode);
  graph.addEdge(START, 'RunAnalysts' as any);
  graph.addEdge('RunAnalysts' as any, END);
  return graph.compile();
})();

export interface RunAnalystStageOptions {
  modelId?: string;
  enabledAnalysts?: TradingAnalystId[];
}

export const runAnalystStage = async (
  symbol: string,
  tradeDate: string,
  context: AgentsContext,
  options?: RunAnalystStageOptions,
) => {
  const modelId = (options?.modelId ?? env.openAiModel)?.trim() ?? env.openAiModel;
  const enabledAnalysts = options?.enabledAnalysts && options.enabledAnalysts.length > 0
    ? options.enabledAnalysts
    : [...DEFAULT_TRADING_ANALYSTS];

  const initialState: GraphState = {
    ...createInitialState(symbol, tradeDate, context),
    metadata: {
      modelId,
      enabledAnalysts,
    },
  };
  const finalState = await analystGraph.invoke(initialState);
  return {
    reports: finalState.reports,
    conversationLog: finalState.conversationLog,
  };
};

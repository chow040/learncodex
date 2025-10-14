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

ensureLangchainToolsRegistered();

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
  const llmOptions: any = {
    openAIApiKey: env.openAiApiKey,
    model: env.openAiModel,
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

  await runAnalyst(
    'MarketAnalyst',
    'Market Analyst',
    buildMarketCollaborationHeader,
    buildMarketUserContext,
    MARKET_SYSTEM_PROMPT,
    'market',
  );
  await runAnalyst(
    'NewsAnalyst',
    'News Analyst',
    buildNewsCollaborationHeader,
    buildNewsUserContext,
    NEWS_SYSTEM_PROMPT,
    'news',
  );
  await runAnalyst(
    'SocialAnalyst',
    'Social Analyst',
    buildSocialCollaborationHeader,
    buildSocialUserContext,
    SOCIAL_SYSTEM_PROMPT,
    'social',
  );
  await runAnalyst(
    'FundamentalsAnalyst',
    'Fundamentals Analyst',
    buildFundamentalsCollaborationHeader,
    buildFundamentalsUserContext,
    FUNDAMENTALS_SYSTEM_PROMPT,
    'fundamentals',
  );

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

export const runAnalystStage = async (
  symbol: string,
  tradeDate: string,
  context: AgentsContext,
) => {
  const initialState = createInitialState(symbol, tradeDate, context);
  const finalState = await analystGraph.invoke(initialState);
  return {
    reports: finalState.reports,
    conversationLog: finalState.conversationLog,
  };
};

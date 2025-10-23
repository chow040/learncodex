import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';

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
import type { AgentsContext } from '../types.js';
import {
  DEFAULT_TRADING_ANALYSTS,
  isTradingAnalystId,
  type TradingAnalystId,
} from '../../constants/tradingAgents.js';
import type {
  AnalystReports,
  ConversationLogEntry,
  AnalystToolCall,
} from './types.js';

ensureLangchainToolsRegistered();

type PersonaConfig = {
  personaId: TradingAnalystId;
  runnableId: string;
  label: string;
  systemPrompt: string;
  reportKey: keyof AnalystReports;
  buildHeader: (context: AnalystNodeContext) => string;
  buildUserContext: (ctx: AgentsContext) => string;
};

const PERSONA_CONFIGS: Record<TradingAnalystId, PersonaConfig> = {
  market: {
    personaId: 'market',
    runnableId: 'MarketAnalyst',
    label: 'Market Analyst',
    systemPrompt: MARKET_SYSTEM_PROMPT,
    reportKey: 'market',
    buildHeader: buildMarketCollaborationHeader,
    buildUserContext: buildMarketUserContext,
  },
  news: {
    personaId: 'news',
    runnableId: 'NewsAnalyst',
    label: 'News Analyst',
    systemPrompt: NEWS_SYSTEM_PROMPT,
    reportKey: 'news',
    buildHeader: buildNewsCollaborationHeader,
    buildUserContext: buildNewsUserContext,
  },
  social: {
    personaId: 'social',
    runnableId: 'SocialAnalyst',
    label: 'Social Analyst',
    systemPrompt: SOCIAL_SYSTEM_PROMPT,
    reportKey: 'social',
    buildHeader: buildSocialCollaborationHeader,
    buildUserContext: buildSocialUserContext,
  },
  fundamental: {
    personaId: 'fundamental',
    runnableId: 'FundamentalsAnalyst',
    label: 'Fundamentals Analyst',
    systemPrompt: FUNDAMENTALS_SYSTEM_PROMPT,
    reportKey: 'fundamentals',
    buildHeader: buildFundamentalsCollaborationHeader,
    buildUserContext: buildFundamentalsUserContext,
  },
};

const messageToString = (message: AIMessage | unknown): string => {
  if (typeof message === 'string') return message;
  if (message instanceof AIMessage) {
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((chunk: unknown) => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk)))
        .join('');
    }
    return message.content ? JSON.stringify(message.content) : '';
  }
  if (message && typeof (message as any).content === 'string') {
    return (message as any).content;
  }
  return JSON.stringify(message ?? '');
};

const parseToolArguments = (raw: unknown): unknown => {
  if (raw === null || raw === undefined) {
    return {};
  }
  if (typeof raw !== 'string') {
    return raw;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
};

const formatToolResult = (result: unknown): string => {
  if (result === null || result === undefined) {
    return 'null';
  }
  if (typeof result === 'string') {
    return result;
  }
  if (typeof result === 'number' || typeof result === 'boolean') {
    return String(result);
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
};

const AnalystAnnotation = Annotation.Root({
  symbol: Annotation<string>(),
  tradeDate: Annotation<string>(),
  context: Annotation<AgentsContext>(),
  reports: Annotation<AnalystReports>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  conversationLog: Annotation<ConversationLogEntry[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  toolCalls: Annotation<AnalystToolCall[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: (_, right) => right,
    default: () => [],
  }),
  pendingConversation: Annotation<ConversationLogEntry | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
});

type AnalystState = typeof AnalystAnnotation.State;

const lastMessage = (state: AnalystState): BaseMessage | undefined =>
  state.messages[state.messages.length - 1];

const shouldRequestTools = (state: AnalystState): 'tools' | 'finalize' => {
  const last = lastMessage(state);
  if (last instanceof AIMessage && Array.isArray(last.tool_calls) && last.tool_calls.length > 0) {
    return 'tools';
  }
  return 'finalize';
};

type PersonaAssets = {
  runnable: ReturnType<typeof createAnalystRunnable>['runnable'];
  tools: ReturnType<typeof createAnalystRunnable>['tools'];
};

const registerPersonaNodes = (
  graph: StateGraph<any>,
  config: PersonaConfig,
  assets: PersonaAssets,
  symbol: string,
  tradeDate: string,
  llm: ChatOpenAI,
) => {
  const setupName = `${config.personaId}_Setup`;
  const llmName = `${config.personaId}_LLM`;
  const toolsName = `${config.personaId}_Tools`;
  const finalizeName = `${config.personaId}_Finalize`;
  const clearName = `${config.personaId}_Clear`;

  graph.addNode(setupName, (state: AnalystState) => {
    const analystContext: AnalystNodeContext = {
      symbol,
      tradeDate,
      tools: assets.tools,
      agentsContext: state.context,
      llm,
    };
    const header = config.buildHeader(analystContext);
    const userContext = config.buildUserContext(state.context);
    const conversationEntry: ConversationLogEntry = {
      roleLabel: config.label,
      system: config.systemPrompt,
      user: `${header}\n\n${userContext}`,
    };
    return {
      pendingConversation: conversationEntry,
      messages: [],
    } as Partial<AnalystState>;
  });

  graph.addNode(llmName, async (state: AnalystState) => {
    const input = { ...state.context, messages: state.messages } as AgentsContext & { messages: BaseMessage[] };
    const message = (await assets.runnable.invoke(input)) as AIMessage;
    return {
      messages: [...state.messages, message],
    } as Partial<AnalystState>;
  });

  graph.addNode(toolsName, async (state: AnalystState) => {
    const last = lastMessage(state);
    const toolCalls = last instanceof AIMessage ? last.tool_calls ?? [] : [];
    if (!toolCalls.length) {
      return {
        messages: state.messages,
      } as Partial<AnalystState>;
    }

    const newMessages = [...state.messages];
    const personaToolCalls: AnalystToolCall[] = [];

    for (const call of toolCalls) {
      const tool = assets.tools[call.name];
      const rawArgs = (call as any).arguments ?? (call as any).args;
      const args = parseToolArguments(rawArgs);
      if (!tool) {
        const failure = `Requested tool "${call.name}" is not registered.`;
        personaToolCalls.push({
          persona: config.label,
          name: call.name,
          input: rawArgs ?? null,
          error: failure,
          startedAt: new Date(),
          finishedAt: new Date(),
          durationMs: 0,
        });
        newMessages.push(
          new ToolMessage({
            tool_call_id: call.id ?? call.name,
            content: failure,
          }),
        );
        continue;
      }

      const startedAt = new Date();
      try {
        const output = await tool.invoke(args);
        personaToolCalls.push({
          persona: config.label,
          name: call.name,
          input: rawArgs ?? null,
          output: output ?? null,
          startedAt,
          finishedAt: new Date(),
        });
        newMessages.push(
          new ToolMessage({
            tool_call_id: call.id ?? call.name,
            content: formatToolResult(output),
          }),
        );
      } catch (error) {
        const failure = `Tool invocation failed: ${error instanceof Error ? error.message : String(error)}`;
        personaToolCalls.push({
          persona: config.label,
          name: call.name,
          input: rawArgs ?? null,
          error: failure,
          startedAt,
          finishedAt: new Date(),
          durationMs: 0,
        });
        newMessages.push(
          new ToolMessage({
            tool_call_id: call.id ?? call.name,
            content: failure,
          }),
        );
      }
    }

    return {
      messages: newMessages,
      toolCalls: personaToolCalls,
    } as Partial<AnalystState>;
  });

  graph.addNode(finalizeName, (state: AnalystState) => {
    const last = [...state.messages].reverse().find((msg) => msg instanceof AIMessage) as AIMessage | undefined;
    const report = last ? messageToString(last) : '';
    const conversationEntry = state.pendingConversation;
    const updates: Partial<AnalystState> = {
      reports: { [config.reportKey]: report },
      pendingConversation: null,
    };
    if (conversationEntry) {
      updates.conversationLog = [conversationEntry];
    }
    return updates as Partial<AnalystState>;
  });

  graph.addNode(clearName, () => ({
    messages: [],
  }) as Partial<AnalystState>);

  graph.addEdge(setupName as any, llmName as any);
  graph.addConditionalEdges(llmName as any, new RunnableLambda({ func: shouldRequestTools }), {
    tools: toolsName,
    finalize: finalizeName,
  } as any);
  graph.addEdge(toolsName as any, llmName as any);
  graph.addEdge(finalizeName as any, clearName as any);

  return {
    setupName,
    llmName,
    toolsName,
    finalizeName,
    clearName,
  };
};

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
  const enabledAnalysts = (() => {
    const requested = options?.enabledAnalysts;
    if (!requested || requested.length === 0) {
      return [...DEFAULT_TRADING_ANALYSTS];
    }
    const filtered = requested.filter((id) => isTradingAnalystId(id));
    return filtered.length > 0 ? filtered : [...DEFAULT_TRADING_ANALYSTS];
  })();

  const requestedModel = options?.modelId ?? env.openAiModel ?? '';
  const modelId = requestedModel.trim() || env.openAiModel;

  const llmOptions: Record<string, unknown> = {
    openAIApiKey: env.openAiApiKey,
    model: modelId,
    temperature: 1,
  };
  if (env.openAiBaseUrl) {
    llmOptions.configuration = { baseURL: env.openAiBaseUrl };
  }
  const llm = new ChatOpenAI(llmOptions);

  const personaAssets = new Map<TradingAnalystId, PersonaAssets>();
  for (const personaId of enabledAnalysts) {
    const config = PERSONA_CONFIGS[personaId];
    if (!config) continue;
    const assets = createAnalystRunnable(config.runnableId, {
      symbol,
      tradeDate,
      agentsContext: context,
      llm,
    });
    personaAssets.set(personaId, assets);
  }

  const graph = new StateGraph(AnalystAnnotation);

  let previousClear: string | null = null;
  for (const personaId of enabledAnalysts) {
    const config = PERSONA_CONFIGS[personaId];
    const assets = personaAssets.get(personaId);
    if (!config || !assets) {
      continue;
    }
    const nodes = registerPersonaNodes(graph, config, assets, symbol, tradeDate, llm);
    if (previousClear) {
      graph.addEdge(previousClear as any, nodes.setupName as any);
    } else {
      graph.addEdge(START, nodes.setupName as any);
    }
    previousClear = nodes.clearName;
  }

  if (previousClear) {
    graph.addEdge(previousClear as any, END);
  } else {
    graph.addEdge(START, END);
  }

  const compiledGraph = graph.compile();
  const initialState = {
    symbol,
    tradeDate,
    context,
    reports: {},
    conversationLog: [],
    toolCalls: [],
    messages: [],
    pendingConversation: null,
  };

  const finalState = await compiledGraph.invoke(initialState as any, {
    recursionLimit: env.maxRecursionLimit,
  });

  return {
    reports: finalState.reports,
    conversationLog: finalState.conversationLog,
    toolCalls: finalState.toolCalls,
  };
};

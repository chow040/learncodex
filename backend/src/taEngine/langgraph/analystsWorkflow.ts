import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';

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
import type { AnalystNodeContext, ToolLogger } from '../langchain/types.js';
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

const MAX_TOOL_CALL_ITERATIONS = 4;

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
  if (result === null || result === undefined) return 'null';
  if (typeof result === 'string') return result;
  if (typeof result === 'number' || typeof result === 'boolean') {
    return String(result);
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
};

const resolveEnabledAnalysts = (requested?: TradingAnalystId[]): TradingAnalystId[] => {
  if (!requested || requested.length === 0) {
    return [...DEFAULT_TRADING_ANALYSTS];
  }
  const filtered = requested.filter((id) => isTradingAnalystId(id));
  return filtered.length > 0 ? filtered : [...DEFAULT_TRADING_ANALYSTS];
};

interface PersonaRunResult {
  report: string;
  toolCalls: AnalystToolCall[];
  conversationEntry: ConversationLogEntry;
}

const executePersona = async (
  config: PersonaConfig,
  {
    symbol,
    tradeDate,
    context,
    llm,
  }: {
    symbol: string;
    tradeDate: string;
    context: AgentsContext;
    llm: ChatOpenAI;
  },
): Promise<PersonaRunResult> => {
  const personaToolCalls: AnalystToolCall[] = [];

  const toolLogger: ToolLogger = {
    record: (entry) => {
      personaToolCalls.push({
        persona: config.label,
        ...entry,
      });
    },
  };

  const { runnable, tools } = createAnalystRunnable(config.runnableId, {
    symbol,
    tradeDate,
    agentsContext: context,
    llm,
    toolLogger,
  });

  const analystContext: AnalystNodeContext = {
    symbol,
    tradeDate,
    agentsContext: context,
    tools,
    llm,
  };

  const header = config.buildHeader(analystContext);
  const userPrompt = config.buildUserContext(context);
  const conversationEntry: ConversationLogEntry = {
    roleLabel: config.label,
    system: config.systemPrompt,
    user: `${header}\n\n${userPrompt}`,
  };

  let messages: BaseMessage[] = [];
  let finalReport: string | null = null;

  for (let iteration = 0; iteration < MAX_TOOL_CALL_ITERATIONS; iteration += 1) {
    const runInput = { ...context, messages } as AgentsContext & { messages: BaseMessage[] };
    const message = (await runnable.invoke(runInput)) as AIMessage;
    messages = [...messages, message];

    const toolCalls = message.tool_calls ?? [];
    if (!toolCalls.length) {
      finalReport = messageToString(message);
      break;
    }

    for (const toolCall of toolCalls) {
      const tool = tools[toolCall.name];
      if (!tool) {
        const failure = `Requested tool "${toolCall.name}" is not registered.`;
        personaToolCalls.push({
          persona: config.label,
          name: toolCall.name,
          input: toolCall.arguments ?? null,
          error: failure,
          startedAt: new Date(),
          finishedAt: new Date(),
          durationMs: 0,
        });
        messages = [
          ...messages,
          new ToolMessage({
            tool_call_id: toolCall.id ?? toolCall.name,
            content: failure,
          }),
        ];
        continue;
      }

      const args = parseToolArguments(toolCall.arguments);
      let toolOutput: unknown;
      try {
        toolOutput = await tool.invoke(args);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        toolOutput = `Tool invocation failed: ${errorMessage}`;
      }

      messages = [
        ...messages,
        new ToolMessage({
          tool_call_id: toolCall.id ?? toolCall.name,
          content: formatToolResult(toolOutput),
        }),
      ];
    }
  }

  if (finalReport === null) {
    const lastMessage = [...messages].reverse().find((msg) => msg instanceof AIMessage) as AIMessage | undefined;
    finalReport = lastMessage ? messageToString(lastMessage) : '';
  }

  return {
    report: finalReport,
    toolCalls: personaToolCalls,
    conversationEntry,
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
  const enabledAnalysts = resolveEnabledAnalysts(options?.enabledAnalysts);
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

  const reports: AnalystReports = {};
  const conversationLog: ConversationLogEntry[] = [];
  const toolCalls: AnalystToolCall[] = [];

  for (const personaId of enabledAnalysts) {
    const config = PERSONA_CONFIGS[personaId];
    if (!config) continue;

    const {
      report,
      toolCalls: personaToolCalls,
      conversationEntry,
    } = await executePersona(config, {
      symbol,
      tradeDate,
      context,
      llm,
    });

    reports[config.reportKey] = report;
    toolCalls.push(...personaToolCalls);
    conversationLog.push(conversationEntry);
  }

  return {
    reports,
    conversationLog,
    toolCalls,
  };
};

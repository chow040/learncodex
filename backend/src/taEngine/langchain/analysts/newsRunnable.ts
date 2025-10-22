import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type { RunnableInterface } from '@langchain/core/runnables';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';

import type { AgentsContext } from '../../types.js';
import { TOOL_IDS } from '../toolRegistry.js';
import type { AnalystNodeContext, AnalystNodeRegistration } from '../types.js';

const MISSING_PLACEHOLDER = 'Not provided by internal engine at this time.';

export const NEWS_SYSTEM_PROMPT = `You are a news researcher tasked with analyzing recent news and trends over the past week. Please write a comprehensive report of the current state of the world that is relevant for trading and macroeconomics. Look at news from EODHD, and finnhub to be comprehensive. Do not simply state the trends are mixed, provide detailed and finegrained analysis and insights that may help traders make decisions. Make sure to append a Makrdown table at the end of the report to organize key points in the report, organized and easy to read.`;

const REQUIRED_TOOL_IDS = [
  TOOL_IDS.GOOGLE_NEWS,
  TOOL_IDS.FINNHUB_MARKET_NEWS,
  TOOL_IDS.REDDIT_NEWS,
] as const;

const formatToolReminder = (tools: string | string[]): string => {
  const normalized = Array.isArray(tools) ? tools : [tools];
  if (normalized.length === 0) return '';
  if (normalized.length === 1) return normalized[0]!;
  if (normalized.length === 2) return `${normalized[0]!} or ${normalized[1]!}`;
  const [last, ...rest] = normalized.slice().reverse();
  return `${rest.reverse().join(', ')}, or ${last!}`;
};

export const buildNewsCollaborationHeader = (context: AnalystNodeContext): string => {
  const toolList = REQUIRED_TOOL_IDS.join(', ');
  return `You are a helpful AI assistant, collaborating with other assistants. Use the provided tools to progress towards answering the question. If you are unable to fully answer, that's OK; another assistant with different tools will help where you left off. Execute what you can to make progress. If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable, prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop. You have access to the following tools: ${toolList}.\n${NEWS_SYSTEM_PROMPT}For your reference, the current date is ${context.tradeDate}. We are looking at the company ${context.symbol}`;
};

const sanitizeValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.toString().trim();
  if (!trimmed || trimmed === MISSING_PLACEHOLDER) return null;
  return trimmed;
};

const buildMissingSection = (label: string, tools: string | string[]): string =>
  `${label}:\nNo ${label.toLowerCase()} data preloaded. Call ${formatToolReminder(tools)} to retrieve the latest updates.`;

export const buildNewsUserContext = (context: AgentsContext): string => {
  const sections: string[] = [];

  const companyNews = sanitizeValue(context.news_company);
  const redditNews = sanitizeValue(context.news_reddit);
  const globalNews = sanitizeValue(context.news_global);

  if (companyNews) {
    sections.push(`Company news:\n${companyNews}`);
  } else {
    sections.push(buildMissingSection('Company news', ['get_finnhub_news', 'get_google_news']));
  }

  if (redditNews) {
    sections.push(`Reddit discussions:\n${redditNews}`);
  } else {
    sections.push(buildMissingSection('Reddit discussions', 'get_reddit_news'));
  }

  if (globalNews) {
    sections.push(`Global macro news:\n${globalNews}`);
  } else {
    sections.push(buildMissingSection('Global macro news', 'get_google_news (provide a macro query)'));
  }

  return sections.join('\n\n');
};

const aiMessageToString = (message: unknown): string => {
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

type AnalystInput = AgentsContext & { messages?: BaseMessage[] };

const buildNewsRunnable = (context: AnalystNodeContext): RunnableInterface<AnalystInput, AIMessage> => {
  const llm = context.llm;
  if (!llm) {
    throw new Error('News analyst runnable requires an LLM instance in context.');
  }

  const toolInstances = Array.from(
    new Set(
      REQUIRED_TOOL_IDS.map((id) => {
        const tool = context.tools[id];
        if (!tool) {
          throw new Error(`News analyst runnable missing tool registration for ${id}.`);
        }
        return tool;
      }),
    ),
  );

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', NEWS_SYSTEM_PROMPT],
    ['human', '{collaborationHeader}\n\n{userContext}'],
    new MessagesPlaceholder('messages'),
  ]);

  const prepareInputs = new RunnableLambda({
    func: async (input: AnalystInput) => ({
      collaborationHeader: buildNewsCollaborationHeader(context),
      userContext: buildNewsUserContext(input),
      messages: input.messages ?? [],
    }),
  });

  let llmWithTools: RunnableInterface<any, any>;
  if (typeof (llm as any).bindTools === 'function') {
    llmWithTools = (llm as any).bindTools(toolInstances);
  } else {
    llmWithTools = llm;
  }

  return RunnableSequence.from([
    prepareInputs,
    prompt,
    llmWithTools,
  ]);
};

export const newsAnalystRegistration: AnalystNodeRegistration = {
  id: 'NewsAnalyst',
  label: 'News Analyst',
  requiredTools: [...REQUIRED_TOOL_IDS],
  createRunnable: (context) => buildNewsRunnable(context),
};

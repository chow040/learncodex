import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type { RunnableInterface } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';

import type { AgentsContext } from '../../types.js';
import type { DebateRoundEntry } from '../../langgraph/types.js';

export interface DebateInput {
  context: AgentsContext;
  symbol: string;
  tradeDate: string;
  history: string;
  opponentArgument: string;
  reflections?: string;
  rounds?: DebateRoundEntry[];
}

export const BEAR_SYSTEM_PROMPT = '';

export const buildBearUserMessage = (input: DebateInput): string => {
  const marketReport = input.context.market_technical_report ?? '';
  const sentimentReport = input.context.social_reddit_summary ?? '';
  const newsReport = input.context.news_global ?? '';
  const fundamentalsReport = input.context.fundamentals_summary ?? '';
  const history = input.history ?? '';
  const lastBull = input.opponentArgument ?? '';
  const reflections = input.reflections ?? '';

  return `You are a Bear Analyst making the case against investing in the stock. Your goal is to present a well-reasoned argument emphasizing risks, challenges, and negative indicators. Leverage the provided research and data to highlight potential downsides and counter bullish arguments effectively.

Key points to focus on:

- Risks and Challenges: Highlight factors like market saturation, financial instability, or macroeconomic threats that could hinder the stock's performance.
- Competitive Weaknesses: Emphasize vulnerabilities such as weaker market positioning, declining innovation, or threats from competitors.
- Negative Indicators: Use evidence from financial data, market trends, or recent adverse news to support your position.
- Bull Counterpoints: Critically analyze the bull argument with specific data and sound reasoning, exposing weaknesses or over-optimistic assumptions.
- Engagement: Present your argument in a conversational style, directly engaging with the bull analyst's points and debating effectively rather than simply listing facts.

Resources available:

Market research report: ${marketReport}
Social media sentiment report: ${sentimentReport}
Latest world affairs news: ${newsReport}
Company fundamentals report: ${fundamentalsReport}
Conversation history of the debate: ${history}
Last bull argument: ${lastBull}
Reflections from similar situations and lessons learned: ${reflections}
Use this information to deliver a compelling bear argument, refute the bull's claims, and engage in a dynamic debate that demonstrates the risks and weaknesses of investing in the stock. You must also address reflections and learn from lessons and mistakes you made in the past.`;
};

const messageToString = (message: unknown): string => {
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

export interface DebateRunnableOptions {
  systemPrompt?: string;
}

export const createBearDebateRunnable = (
  llm: RunnableInterface<any, any>,
  options?: DebateRunnableOptions,
): RunnableInterface<DebateInput, string> => {
  const systemPrompt = options?.systemPrompt ?? BEAR_SYSTEM_PROMPT;
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['human', '{userMessage}'],
  ]);

  const prepareInputs = new RunnableLambda({
    func: async (input: DebateInput) => ({
      userMessage: buildBearUserMessage(input),
    }),
  });

  const convertOutput = new RunnableLambda({
    func: async (message: unknown) => messageToString(message),
  });

  return RunnableSequence.from([
    prepareInputs,
    prompt,
    llm,
    convertOutput,
  ]);
};

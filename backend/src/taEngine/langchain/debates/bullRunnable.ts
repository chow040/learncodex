import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type { RunnableInterface } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';

import type { AgentsContext } from '../../types.js';
import type { DebateInput } from './bearRunnable.js';

export const BULL_SYSTEM_PROMPT = `You are a Bull Analyst advocating for investing in the stock. Build a strong, evidence-based case emphasizing growth potential, competitive advantages, and positive indicators. Engage with and rebut the bear's latest argument. Be conversational, no special formatting.`;

export const buildBullUserMessage = (input: DebateInput): string => {
  const lines = [
    `Symbol: ${input.symbol} | Date: ${input.tradeDate}`,
    `Market research report:\n${input.context.market_technical_report}`,
    `Social media sentiment report:\n${input.context.social_reddit_summary}`,
    `Latest world affairs/news:\n${input.context.news_global}`,
    `Fundamentals summary:\n${input.context.fundamentals_summary || 'No fundamentals summary provided.'}`,
    `Past reflections:\n${input.reflections || '(none)'}`,
    `Conversation history:\n${input.history || '(none)'}`,
    `Last bear argument:\n${input.opponentArgument || '(none)'}`,
    'Deliver a compelling bull argument and directly refute the bear’s points.',
  ];
  return lines.join('\n\n');
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

export const createBullDebateRunnable = (
  llm: RunnableInterface<any, any>,
): RunnableInterface<DebateInput, string> => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', BULL_SYSTEM_PROMPT],
    ['human', '{userMessage}'],
  ]);

  const prepareInputs = new RunnableLambda({
    func: async (input: DebateInput) => ({
      userMessage: buildBullUserMessage(input),
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

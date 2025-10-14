import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type { RunnableInterface } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';

import type { AgentsContext } from '../../types.js';

export interface DebateInput {
  context: AgentsContext;
  symbol: string;
  tradeDate: string;
  history: string;
  opponentArgument: string;
}

export const BEAR_SYSTEM_PROMPT = `You are a Bear Analyst making the case against investing. Emphasize risks, challenges, and negative indicators. Engage directly with the bull's latest argument. Be conversational, no special formatting.`;

export const buildBearUserMessage = (input: DebateInput): string => {
  const lines = [
    `Symbol: ${input.symbol} | Date: ${input.tradeDate}`,
    `Market research report:\n${input.context.market_technical_report}`,
    `Social media sentiment report:\n${input.context.social_reddit_summary}`,
    `Latest world affairs/news:\n${input.context.news_global}`,
    `Conversation history:\n${input.history || '(none)'}`,
    `Last bull argument:\n${input.opponentArgument || '(none)'}`,
    'Deliver a compelling bear argument and directly refute the bull’s points.',
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

export const createBearDebateRunnable = (
  llm: RunnableInterface<any, any>,
): RunnableInterface<DebateInput, string> => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', BEAR_SYSTEM_PROMPT],
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

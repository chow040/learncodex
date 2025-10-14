import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type { RunnableInterface } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';

export interface ResearchManagerInput {
  debateHistory: string;
  marketReport: string;
  sentimentReport: string;
  newsReport: string;
  fundamentalsReport: string;
  pastMemories: string;
}

export const RESEARCH_MANAGER_SYSTEM_PROMPT = `As the portfolio manager and debate facilitator, evaluate the bull vs bear debate and make a definitive recommendation: Buy, Sell, or Hold (Hold only if strongly justified). Provide rationale and strategic actions. Learn from past mistakes.`;

export const buildResearchManagerUserMessage = (input: ResearchManagerInput): string => {
  const lines = [
    `Past reflections:\n${input.pastMemories || '(none)'}`,
    `Debate History:\n${input.debateHistory || '(none)'}`,
    `Market report:\n${input.marketReport}`,
    `Sentiment report:\n${input.sentimentReport}`,
    `News report:\n${input.newsReport}`,
    `Fundamentals report:\n${input.fundamentalsReport}`,
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

export const createResearchManagerRunnable = (
  llm: RunnableInterface<any, any>,
): RunnableInterface<ResearchManagerInput, string> => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', RESEARCH_MANAGER_SYSTEM_PROMPT],
    ['human', '{userMessage}'],
  ]);

  const prepareInputs = new RunnableLambda({
    func: async (input: ResearchManagerInput) => ({
      userMessage: buildResearchManagerUserMessage(input),
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

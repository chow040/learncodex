import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type { RunnableInterface } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';

export interface RiskManagerInput {
  traderPlan: string;
  debateHistory: string;
  marketReport: string;
  sentimentReport: string;
  newsReport: string;
  fundamentalsReport: string;
  pastMemories: string;
}

export const RISK_MANAGER_SYSTEM_PROMPT = `As the Risk Management Judge and Debate Facilitator, evaluate risky/safe/neutral debate and output a clear recommendation: Buy, Sell, or Hold. Include detailed reasoning. Learn from past mistakes.`;

export const buildRiskManagerUserMessage = (input: RiskManagerInput): string => {
  const lines = [
    `Trader plan:\n${input.traderPlan}`,
    `Debate history:\n${input.debateHistory || '(none)'}`,
    `Market report:\n${input.marketReport}`,
    `Sentiment report:\n${input.sentimentReport}`,
    `News report:\n${input.newsReport}`,
    `Fundamentals report:\n${input.fundamentalsReport}`,
    `Past reflections:\n${input.pastMemories || '(none)'}`,
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

export const createRiskManagerRunnable = (
  llm: RunnableInterface<any, any>,
): RunnableInterface<RiskManagerInput, string> => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', RISK_MANAGER_SYSTEM_PROMPT],
    ['human', '{userMessage}'],
  ]);

  const prepareInputs = new RunnableLambda({
    func: async (input: RiskManagerInput) => ({
      userMessage: buildRiskManagerUserMessage(input),
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

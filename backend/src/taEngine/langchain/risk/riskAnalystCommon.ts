import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type { RunnableInterface } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';

import type { AgentsContext } from '../../types.js';
import type { RiskDebateRoundEntry } from '../../langgraph/types.js';

export interface RiskDebateInput {
  context: AgentsContext;
  traderPlan: string;
  history: string;
  lastAggressive?: string;
  lastConservative?: string;
  lastNeutral?: string;
  rounds?: RiskDebateRoundEntry[];
}

export const messageToString = (message: unknown): string => {
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

export const buildAnalystRunnable = (
  llm: RunnableInterface<any, any>,
  prompt: ChatPromptTemplate,
  buildUser: (input: RiskDebateInput) => string,
): RunnableInterface<RiskDebateInput, string> =>
  RunnableSequence.from([
    new RunnableLambda({
      func: async (input: RiskDebateInput) => ({ userMessage: buildUser(input) }),
    }),
    prompt,
    llm,
    new RunnableLambda({
      func: async (message: unknown) => messageToString(message),
    }),
  ]);

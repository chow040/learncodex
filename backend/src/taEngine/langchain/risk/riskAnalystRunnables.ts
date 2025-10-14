import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type { RunnableInterface } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';

import type { AgentsContext } from '../../types.js';

export interface RiskDebateInput {
  context: AgentsContext;
  traderPlan: string;
  history: string;
  lastRisky?: string;
  lastSafe?: string;
  lastNeutral?: string;
}

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

export const RISKY_SYSTEM_PROMPT =
  'Risky Analyst: champion high-reward strategies, rebut conservative and neutral points. Conversational, no special formatting.';

export const SAFE_SYSTEM_PROMPT =
  'Safe/Conservative Analyst: protect assets, minimize volatility, rebut risky and neutral. Conversational, no special formatting.';

export const NEUTRAL_SYSTEM_PROMPT =
  'Neutral Analyst: balanced perspective, challenge risky and safe where over/under cautious. Conversational, no special formatting.';

export const RISKY_PROMPT = ChatPromptTemplate.fromMessages([
  ['system', RISKY_SYSTEM_PROMPT],
  ['human', '{userMessage}'],
]);

export const SAFE_PROMPT = ChatPromptTemplate.fromMessages([
  ['system', SAFE_SYSTEM_PROMPT],
  ['human', '{userMessage}'],
]);

export const NEUTRAL_PROMPT = ChatPromptTemplate.fromMessages([
  ['system', NEUTRAL_SYSTEM_PROMPT],
  ['human', '{userMessage}'],
]);

export const buildRiskBaseSections = (input: RiskDebateInput): string[] => [
  `Trader plan:\n${input.traderPlan}`,
  `Market report:\n${input.context.market_technical_report}`,
  `Sentiment report:\n${input.context.social_reddit_summary}`,
  `News report:\n${input.context.news_global}`,
  `Debate history:\n${input.history || '(none)'}`,
];

export const buildRiskyUserMessage = (input: RiskDebateInput): string => {
  const sections = buildRiskBaseSections(input);
  sections.push(`Last safe response:\n${input.lastSafe || '(none)'}`);
  sections.push(`Last neutral response:\n${input.lastNeutral || '(none)'}`);
  return sections.join('\n\n');
};

export const buildSafeUserMessage = (input: RiskDebateInput): string => {
  const sections = buildRiskBaseSections(input);
  sections.push(`Last risky response:\n${input.lastRisky || '(none)'}`);
  sections.push(`Last neutral response:\n${input.lastNeutral || '(none)'}`);
  return sections.join('\n\n');
};

export const buildNeutralUserMessage = (input: RiskDebateInput): string => {
  const sections = buildRiskBaseSections(input);
  sections.push(`Last risky response:\n${input.lastRisky || '(none)'}`);
  sections.push(`Last safe response:\n${input.lastSafe || '(none)'}`);
  return sections.join('\n\n');
};

const buildRunnable = (
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

export const createRiskyAnalystRunnable = (
  llm: RunnableInterface<any, any>,
): RunnableInterface<RiskDebateInput, string> => buildRunnable(llm, RISKY_PROMPT, buildRiskyUserMessage);

export const createSafeAnalystRunnable = (
  llm: RunnableInterface<any, any>,
): RunnableInterface<RiskDebateInput, string> => buildRunnable(llm, SAFE_PROMPT, buildSafeUserMessage);

export const createNeutralAnalystRunnable = (
  llm: RunnableInterface<any, any>,
): RunnableInterface<RiskDebateInput, string> => buildRunnable(llm, NEUTRAL_PROMPT, buildNeutralUserMessage);

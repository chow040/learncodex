import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type { RunnableInterface } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';

import type { AgentsContext } from '../../types.js';
import type { DebateInput } from './bearRunnable.js';

export const BULL_SYSTEM_PROMPT = '';
export const buildBullUserMessage = (input: DebateInput): string => {
  const marketReport = input.context.market_technical_report ?? '';
  const sentimentReport = input.context.social_reddit_summary ?? '';
  const newsReport = input.context.news_global ?? '';
  const fundamentalsReport = input.context.fundamentals_summary ?? '';
  const history = input.history ?? '';
  const lastBear = input.opponentArgument ?? '';
  const reflections = input.reflections ?? '';

  return `You are a Bull Analyst advocating for investing in the stock. Your task is to build a strong, evidence-based case emphasizing growth potential, competitive advantages, and positive market indicators. Leverage the provided research and data to address concerns and counter bearish arguments effectively.

Key points to focus on:
- Growth Potential: Highlight the company's market opportunities, revenue projections, and scalability.
- Competitive Advantages: Emphasize factors like unique products, strong branding, or dominant market positioning.
- Positive Indicators: Use financial health, industry trends, and recent positive news as evidence.
- Bear Counterpoints: Critically analyze the bear argument with specific data and sound reasoning, addressing concerns thoroughly and showing why the bull perspective holds stronger merit.
- Engagement: Present your argument in a conversational style, engaging directly with the bear analyst's points and debating effectively rather than just listing data.

Resources available:
Market research report: ${marketReport}
Social media sentiment report: ${sentimentReport}
Latest world affairs news: ${newsReport}
Company fundamentals report: ${fundamentalsReport}
Conversation history of the debate: ${history}
Last bear argument: ${lastBear}
Reflections from similar situations and lessons learned: ${reflections}
Use this information to deliver a compelling bull argument, refute the bear's concerns, and engage in a dynamic debate that demonstrates the strengths of the bull position. You must also address reflections and learn from lessons and mistakes you made in the past.`;
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
  const prompt = ChatPromptTemplate.fromMessages([['human', '{userMessage}']]);

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

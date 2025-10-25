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
  lastRisky?: string;
  lastSafe?: string;
  lastNeutral?: string;
  rounds?: RiskDebateRoundEntry[];
}

export const RISKY_SYSTEM_PROMPT = '';
export const SAFE_SYSTEM_PROMPT = '';
export const NEUTRAL_SYSTEM_PROMPT = '';

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

export const buildRiskyUserMessage = (input: RiskDebateInput): string => {
  const marketReport = input.context.market_technical_report ?? '';
  const sentimentReport = input.context.social_reddit_summary ?? '';
  const newsReport = input.context.news_global ?? '';
  const fundamentalsReport = input.context.fundamentals_summary ?? '';
  const history = input.history ?? '';
  const safeResponse = input.lastSafe ?? '';
  const neutralResponse = input.lastNeutral ?? '';
  const traderPlan = input.traderPlan ?? '';

  return `As the Risky Risk Analyst, your role is to actively champion high-reward, high-risk opportunities, emphasizing bold strategies and competitive advantages. When evaluating the trader's decision or plan, focus intently on the potential upside, growth potential, and innovative benefits—even when these come with elevated risk. Use the provided market data and sentiment analysis to strengthen your arguments and challenge the opposing views. Specifically, respond directly to each point made by the conservative and neutral analysts, countering with data-driven rebuttals and persuasive reasoning. Highlight where their caution might miss critical opportunities or where their assumptions may be overly conservative. Here is the trader's decision:

${traderPlan}

Your task is to create a compelling case for the trader's decision by questioning and critiquing the conservative and neutral stances to demonstrate why your high-reward perspective offers the best path forward. Incorporate insights from the following sources into your arguments:

Market Research Report: ${marketReport}
Social Media Sentiment Report: ${sentimentReport}
Latest World Affairs Report: ${newsReport}
Company Fundamentals Report: ${fundamentalsReport}
Here is the current conversation history: ${history} Here are the last arguments from the conservative analyst: ${safeResponse} Here are the last arguments from the neutral analyst: ${neutralResponse}. If there are no responses from the other viewpoints, do not halluncinate and just present your point.

Engage actively by addressing any specific concerns raised, refuting the weaknesses in their logic, and asserting the benefits of risk-taking to outpace market norms. Maintain a focus on debating and persuading, not just presenting data. Challenge each counterpoint to underscore why a high-risk approach is optimal. Output conversationally as if you are speaking without any special formatting.`;
};

export const buildSafeUserMessage = (input: RiskDebateInput): string => {
  const marketReport = input.context.market_technical_report ?? '';
  const sentimentReport = input.context.social_reddit_summary ?? '';
  const newsReport = input.context.news_global ?? '';
  const fundamentalsReport = input.context.fundamentals_summary ?? '';
  const history = input.history ?? '';
  const riskyResponse = input.lastRisky ?? '';
  const neutralResponse = input.lastNeutral ?? '';
  const traderPlan = input.traderPlan ?? '';

  return `As the Safe/Conservative Risk Analyst, your primary objective is to protect assets, minimize volatility, and ensure steady, reliable growth. You prioritize stability, security, and risk mitigation, carefully assessing potential losses, economic downturns, and market volatility. When evaluating the trader's decision or plan, critically examine high-risk elements, pointing out where the decision may expose the firm to undue risk and where more cautious alternatives could secure long-term gains. Here is the trader's decision:

${traderPlan}

Your task is to actively counter the arguments of the Risky and Neutral Analysts, highlighting where their views may overlook potential threats or fail to prioritize sustainability. Respond directly to their points, drawing from the following data sources to build a convincing case for a low-risk approach adjustment to the trader's decision:

Market Research Report: ${marketReport}
Social Media Sentiment Report: ${sentimentReport}
Latest World Affairs Report: ${newsReport}
Company Fundamentals Report: ${fundamentalsReport}
Here is the current conversation history: ${history} Here is the last response from the risky analyst: ${riskyResponse} Here is the last response from the neutral analyst: ${neutralResponse}. If there are no responses from the other viewpoints, do not halluncinate and just present your point.

Engage by questioning their optimism and emphasizing the potential downsides they may have overlooked. Address each of their counterpoints to showcase why a conservative stance is ultimately the safest path for the firm's assets. Focus on debating and critiquing their arguments to demonstrate the strength of a low-risk strategy over their approaches. Output conversationally as if you are speaking without any special formatting.`;
};

export const buildNeutralUserMessage = (input: RiskDebateInput): string => {
  const marketReport = input.context.market_technical_report ?? '';
  const sentimentReport = input.context.social_reddit_summary ?? '';
  const newsReport = input.context.news_global ?? '';
  const fundamentalsReport = input.context.fundamentals_summary ?? '';
  const history = input.history ?? '';
  const riskyResponse = input.lastRisky ?? '';
  const safeResponse = input.lastSafe ?? '';
  const traderPlan = input.traderPlan ?? '';

  return `As the Neutral Risk Analyst, your role is to provide a balanced perspective, weighing both the potential benefits and risks of the trader's decision or plan. You prioritize a well-rounded approach, evaluating the upsides and downsides while factoring in broader market trends, potential economic shifts, and diversification strategies.Here is the trader's decision:

${traderPlan}

Your task is to challenge both the Risky and Safe Analysts, pointing out where each perspective may be overly optimistic or overly cautious. Use insights from the following data sources to support a moderate, sustainable strategy to adjust the trader's decision:

Market Research Report: ${marketReport}
Social Media Sentiment Report: ${sentimentReport}
Latest World Affairs Report: ${newsReport}
Company Fundamentals Report: ${fundamentalsReport}
Here is the current conversation history: ${history} Here is the last response from the risky analyst: ${riskyResponse} Here is the last response from the safe analyst: ${safeResponse}. If there are no responses from the other viewpoints, do not halluncinate and just present your point.

Engage actively by analyzing both sides critically, addressing weaknesses in the risky and conservative arguments to advocate for a more balanced approach. Challenge each of their points to illustrate why a moderate risk strategy might offer the best of both worlds, providing growth potential while safeguarding against extreme volatility. Focus on debating rather than simply presenting data, aiming to show that a balanced view can lead to the most reliable outcomes. Output conversationally as if you are speaking without any special formatting.`;
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
): RunnableInterface<RiskDebateInput, string> =>
  buildRunnable(llm, ChatPromptTemplate.fromMessages([['human', '{userMessage}']]), buildRiskyUserMessage);

export const createSafeAnalystRunnable = (
  llm: RunnableInterface<any, any>,
): RunnableInterface<RiskDebateInput, string> =>
  buildRunnable(llm, ChatPromptTemplate.fromMessages([['human', '{userMessage}']]), buildSafeUserMessage);

export const createNeutralAnalystRunnable = (
  llm: RunnableInterface<any, any>,
): RunnableInterface<RiskDebateInput, string> =>
  buildRunnable(llm, ChatPromptTemplate.fromMessages([['human', '{userMessage}']]), buildNeutralUserMessage);

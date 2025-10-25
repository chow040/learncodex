import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { RunnableInterface } from '@langchain/core/runnables';

import { buildAnalystRunnable, type RiskDebateInput } from './riskAnalystCommon.js';

export const NEUTRAL_SYSTEM_PROMPT = '';

export const buildNeutralUserMessage = (input: RiskDebateInput): string => {
  const marketReport = input.context.market_technical_report ?? '';
  const sentimentReport = input.context.social_reddit_summary ?? '';
  const newsReport = input.context.news_global ?? '';
  const fundamentalsReport = input.context.fundamentals_summary ?? '';
  const history = input.history ?? '';
  const aggressiveResponse = input.lastAggressive ?? '';
  const conservativeResponse = input.lastConservative ?? '';
  const traderPlan = input.traderPlan ?? '';

  return `As the Neutral Risk Analyst, your role is to provide a balanced perspective, weighing both the potential benefits and risks of the trader's decision or plan. You prioritize a well-rounded approach, evaluating the upsides and downsides while factoring in broader market trends, potential economic shifts, and diversification strategies.Here is the trader's decision:

${traderPlan}

Your task is to challenge both the Risky and Safe Analysts, pointing out where each perspective may be overly optimistic or overly cautious. Use insights from the following data sources to support a moderate, sustainable strategy to adjust the trader's decision:

Market Research Report: ${marketReport}
Social Media Sentiment Report: ${sentimentReport}
Latest World Affairs Report: ${newsReport}
Company Fundamentals Report: ${fundamentalsReport}
Here is the current conversation history: ${history} Here is the last response from the risky analyst: ${aggressiveResponse} Here is the last response from the safe analyst: ${conservativeResponse}. If there are no responses from the other viewpoints, do not halluncinate and just present your point.

Engage actively by analyzing both sides critically, addressing weaknesses in the risky and conservative arguments to advocate for a more balanced approach. Challenge each of their points to illustrate why a moderate risk strategy might offer the best of both worlds, providing growth potential while safeguarding against extreme volatility. Focus on debating rather than simply presenting data, aiming to show that a balanced view can lead to the most reliable outcomes. Output conversationally as if you are speaking without any special formatting.`;
};

export const createNeutralAnalystRunnable = (
  llm: RunnableInterface<any, any>,
): RunnableInterface<RiskDebateInput, string> =>
  buildAnalystRunnable(llm, ChatPromptTemplate.fromMessages([['human', '{userMessage}']]), buildNeutralUserMessage);

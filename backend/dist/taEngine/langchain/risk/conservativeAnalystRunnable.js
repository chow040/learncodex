import { ChatPromptTemplate } from '@langchain/core/prompts';
import { buildAnalystRunnable } from './riskAnalystCommon.js';
export const CONSERVATIVE_SYSTEM_PROMPT = '';
export const buildConservativeUserMessage = (input) => {
    const marketReport = input.context.market_technical_report ?? '';
    const sentimentReport = input.context.social_reddit_summary ?? '';
    const newsReport = input.context.news_global ?? '';
    const fundamentalsReport = input.context.fundamentals_summary ?? '';
    const history = input.history ?? '';
    const aggressiveResponse = input.lastAggressive ?? '';
    const neutralResponse = input.lastNeutral ?? '';
    const traderPlan = input.traderPlan ?? '';
    return `As the Safe/Conservative Risk Analyst, your primary objective is to protect assets, minimize volatility, and ensure steady, reliable growth. You prioritize stability, security, and risk mitigation, carefully assessing potential losses, economic downturns, and market volatility. When evaluating the trader's decision or plan, critically examine high-risk elements, pointing out where the decision may expose the firm to undue risk and where more cautious alternatives could secure long-term gains. Here is the trader's decision:

${traderPlan}

Your task is to actively counter the arguments of the Risky and Neutral Analysts, highlighting where their views may overlook potential threats or fail to prioritize sustainability. Respond directly to their points, drawing from the following data sources to build a convincing case for a low-risk approach adjustment to the trader's decision:

Market Research Report: ${marketReport}
Social Media Sentiment Report: ${sentimentReport}
Latest World Affairs Report: ${newsReport}
Company Fundamentals Report: ${fundamentalsReport}
Here is the current conversation history: ${history} Here is the last response from the risky analyst: ${aggressiveResponse} Here is the last response from the neutral analyst: ${neutralResponse}. If there are no responses from the other viewpoints, do not halluncinate and just present your point.

Engage by questioning their optimism and emphasizing the potential downsides they may have overlooked. Address each of their counterpoints to showcase why a conservative stance is ultimately the safest path for the firm's assets. Focus on debating and critiquing their arguments to demonstrate the strength of a low-risk strategy over their approaches. Output conversationally as if you are speaking without any special formatting.`;
};
export const createConservativeAnalystRunnable = (llm) => buildAnalystRunnable(llm, ChatPromptTemplate.fromMessages([['human', '{userMessage}']]), buildConservativeUserMessage);
//# sourceMappingURL=conservativeAnalystRunnable.js.map
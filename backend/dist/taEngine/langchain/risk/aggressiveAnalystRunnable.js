import { ChatPromptTemplate } from '@langchain/core/prompts';
import { buildAnalystRunnable } from './riskAnalystCommon.js';
export const AGGRESSIVE_SYSTEM_PROMPT = '';
export const buildAggressiveUserMessage = (input) => {
    const marketReport = input.context.market_technical_report ?? '';
    const sentimentReport = input.context.social_reddit_summary ?? '';
    const newsReport = input.context.news_global ?? '';
    const fundamentalsReport = input.context.fundamentals_summary ?? '';
    const history = input.history ?? '';
    const conservativeResponse = input.lastConservative ?? '';
    const neutralResponse = input.lastNeutral ?? '';
    const traderPlan = input.traderPlan ?? '';
    return `As the Risky Risk Analyst, your role is to actively champion high-reward, high-risk opportunities, emphasizing bold strategies and competitive advantages. When evaluating the trader's decision or plan, focus intently on the potential upside, growth potential, and innovative benefits—even when these come with elevated risk. Use the provided market data and sentiment analysis to strengthen your arguments and challenge the opposing views. Specifically, respond directly to each point made by the conservative and neutral analysts, countering with data-driven rebuttals and persuasive reasoning. Highlight where their caution might miss critical opportunities or where their assumptions may be overly conservative. Here is the trader's decision:

${traderPlan}

Your task is to create a compelling case for the trader's decision by questioning and critiquing the conservative and neutral stances to demonstrate why your high-reward perspective offers the best path forward. Incorporate insights from the following sources into your arguments:

Market Research Report: ${marketReport}
Social Media Sentiment Report: ${sentimentReport}
Latest World Affairs Report: ${newsReport}
Company Fundamentals Report: ${fundamentalsReport}
Here is the current conversation history: ${history} Here are the last arguments from the conservative analyst: ${conservativeResponse} Here are the last arguments from the neutral analyst: ${neutralResponse}. If there are no responses from the other viewpoints, do not halluncinate and just present your point.

Engage actively by addressing any specific concerns raised, refuting the weaknesses in their logic, and asserting the benefits of risk-taking to outpace market norms. Maintain a focus on debating and persuading, not just presenting data. Challenge each counterpoint to underscore why a high-risk approach is optimal. Output conversationally as if you are speaking without any special formatting.`;
};
export const createAggressiveAnalystRunnable = (llm) => buildAnalystRunnable(llm, ChatPromptTemplate.fromMessages([['human', '{userMessage}']]), buildAggressiveUserMessage);
//# sourceMappingURL=aggressiveAnalystRunnable.js.map
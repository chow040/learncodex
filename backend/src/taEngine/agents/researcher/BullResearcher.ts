import type { AgentsContext, AgentPrompt } from '../../types.js';

export class BullResearcher {
  analyze(
    ctx: AgentsContext,
    symbol: string,
    tradeDate: string,
    history: string,
    lastBearArg: string,
  ): AgentPrompt {
    const system = `You are a Bull Analyst advocating for investing in the stock. Build a strong, evidence-based case emphasizing growth potential, competitive advantages, and positive indicators. Engage with and rebut the bear's latest argument. Be conversational, no special formatting.`;
    const user = [
      `Symbol: ${symbol} | Date: ${tradeDate}`,
      `Market research report:\n${ctx.market_technical_report}`,
      `Social media sentiment report:\n${ctx.social_reddit_summary}`,
      `Latest world affairs/news:\n${ctx.news_global}`,
      `Company fundamentals report:\n${ctx.fundamentals_summary}`,
      `Conversation history:\n${history || '(none)'}`,
      `Last bear argument:\n${lastBearArg || '(none)'}\n`,
      'Deliver a compelling bull argument and directly refute the bear’s points.',
    ].join('\n\n');
    return { roleLabel: 'Bull Researcher', system, user };
  }
}

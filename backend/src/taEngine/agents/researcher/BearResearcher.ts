import type { AgentsContext, AgentPrompt } from '../../types.js';

export class BearResearcher {
  analyze(
    ctx: AgentsContext,
    symbol: string,
    tradeDate: string,
    history: string,
    lastBullArg: string,
  ): AgentPrompt {
    const system = `You are a Bear Analyst making the case against investing. Emphasize risks, challenges, and negative indicators. Engage directly with the bull's latest argument. Be conversational, no special formatting.`;
    const user = [
      `Symbol: ${symbol} | Date: ${tradeDate}`,
      `Market research report:\n${ctx.market_technical_report}`,
      `Social media sentiment report:\n${ctx.social_reddit_summary}`,
      `Latest world affairs/news:\n${ctx.news_global}`,
  // fundamentals removed per request
      `Conversation history:\n${history || '(none)'}`,
      `Last bull argument:\n${lastBullArg || '(none)'}\n`,
      'Deliver a compelling bear argument and directly refute the bull’s points.',
    ].join('\n\n');
    return { roleLabel: 'Bear Researcher', system, user };
  }
}

import type { AgentsContext, AgentPrompt } from '../../types.js';

export class RiskyAnalyst {
  analyze(ctx: AgentsContext, traderPlan: string, history: string, lastSafe: string, lastNeutral: string): AgentPrompt {
    const system = 'Risky Analyst: champion high-reward strategies, rebut conservative and neutral points. Conversational, no special formatting.';
    const user = [
      `Trader plan:\n${traderPlan}`,
      `Market report:\n${ctx.market_technical_report}`,
      `Sentiment report:\n${ctx.social_reddit_summary}`,
      `News report:\n${ctx.news_global}`,
  // fundamentals removed per request
      `Debate history:\n${history || '(none)'}`,
      `Last safe response:\n${lastSafe || '(none)'}`,
      `Last neutral response:\n${lastNeutral || '(none)'}`,
    ].join('\n\n');
    return { roleLabel: 'Risky Analyst', system, user };
  }
}

export class SafeAnalyst {
  analyze(ctx: AgentsContext, traderPlan: string, history: string, lastRisky: string, lastNeutral: string): AgentPrompt {
    const system = 'Safe/Conservative Analyst: protect assets, minimize volatility, rebut risky and neutral. Conversational, no special formatting.';
    const user = [
      `Trader plan:\n${traderPlan}`,
      `Market report:\n${ctx.market_technical_report}`,
      `Sentiment report:\n${ctx.social_reddit_summary}`,
      `News report:\n${ctx.news_global}`,
  // fundamentals removed per request
      `Debate history:\n${history || '(none)'}`,
      `Last risky response:\n${lastRisky || '(none)'}`,
      `Last neutral response:\n${lastNeutral || '(none)'}`,
    ].join('\n\n');
    return { roleLabel: 'Safe Analyst', system, user };
  }
}

export class NeutralAnalyst {
  analyze(ctx: AgentsContext, traderPlan: string, history: string, lastRisky: string, lastSafe: string): AgentPrompt {
    const system = 'Neutral Analyst: balanced perspective, challenge risky and safe where over/under cautious. Conversational, no special formatting.';
    const user = [
      `Trader plan:\n${traderPlan}`,
      `Market report:\n${ctx.market_technical_report}`,
      `Sentiment report:\n${ctx.social_reddit_summary}`,
      `News report:\n${ctx.news_global}`,
  // fundamentals removed per request
      `Debate history:\n${history || '(none)'}`,
      `Last risky response:\n${lastRisky || '(none)'}`,
      `Last safe response:\n${lastSafe || '(none)'}`,
    ].join('\n\n');
    return { roleLabel: 'Neutral Analyst', system, user };
  }
}

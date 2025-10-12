import type { AgentPrompt } from '../../types.js';

export class TraderAgent {
  propose(company: string, plan: string, marketReport: string, sentimentReport: string, newsReport: string, fundamentalsReport: string, pastMemories: string): AgentPrompt {
    const system = `You are a trading agent analyzing market data to make investment decisions. Provide a specific recommendation to buy, sell, or hold. Always conclude with: FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**. Learn from past decisions.`;
    const user = [
      `Company: ${company}`,
      `Proposed investment plan: ${plan}`,
      `Market report:\n${marketReport}`,
      `Sentiment report:\n${sentimentReport}`,
      `News report:\n${newsReport}`,
      `Fundamentals report:\n${fundamentalsReport}`,
      `Past reflections:\n${pastMemories || 'No past memories found.'}`,
    ].join('\n\n');
    return { roleLabel: 'Trader', system, user };
  }
}

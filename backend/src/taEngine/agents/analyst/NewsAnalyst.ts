import type { AgentsContext, AgentPrompt } from '../../types.js';

const TOOL_LABELS = [
  'get_google_news',
  'get_finnhub_news',
  'get_reddit_news',
] as const;

const formatToolReminder = (tools: string | string[]): string => {
  const normalized = Array.isArray(tools) ? tools : [tools];
  if (normalized.length === 1) return normalized[0];
  if (normalized.length === 2) return `${normalized[0]} or ${normalized[1]}`;
  const [last, ...rest] = normalized.slice().reverse();
  return `${rest.reverse().join(', ')}, or ${last}`;
};

export class NewsAnalyst {
  analyze(ctx: AgentsContext, symbol: string, tradeDate: string): AgentPrompt {
    const systemMessage = `You are a news researcher tasked with analyzing recent news and trends over the past week. Please write a comprehensive report of the current state of the world that is relevant for trading and macroeconomics. Look at news from EODHD, and finnhub to be comprehensive. Do not simply state the trends are mixed, provide detailed and finegrained analysis and insights that may help traders make decisions. Make sure to append a Makrdown table at the end of the report to organize key points in the report, organized and easy to read.`;

    const collabHeader = `You are a helpful AI assistant, collaborating with other assistants. Use the provided tools to progress towards answering the question. If you are unable to fully answer, that's OK; another assistant with different tools will help where you left off. Execute what you can to make progress. If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable, prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop. You have access to the following tools: ${TOOL_LABELS.join(', ')}.\n${systemMessage}For your reference, the current date is ${tradeDate}. We are looking at the company ${symbol}`;

    const userLines: string[] = [];
    const missingPlaceholder = 'Not provided by internal engine at this time.';

    const addSection = (
      label: string,
      value: string | undefined,
      tools: string | string[],
    ) => {
      const trimmed = value?.toString().trim();
      if (trimmed && trimmed !== missingPlaceholder) {
        userLines.push(`${label}:\n${trimmed}`);
        return;
      }

      const reminder = formatToolReminder(tools);
      userLines.push(`${label}:\nNo ${label.toLowerCase()} data preloaded. Call ${reminder} to retrieve the latest updates.`);
    };

    addSection('Company news', ctx.news_company, ['get_finnhub_news', 'get_google_news']);
    addSection('Reddit discussions', ctx.news_reddit, 'get_reddit_news');
    addSection('Global macro news', ctx.news_global, 'get_google_news (supply a macro query)');

    return {
      roleLabel: 'News Analyst',
      system: collabHeader,
      user: userLines.join('\n\n') || 'No news provided.',
    };
  }
}

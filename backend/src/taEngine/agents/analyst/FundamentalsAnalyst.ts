import type { AgentsContext, AgentPrompt } from '../../types.js';

const TOOL_LABELS = [
  'get_finnhub_company_insider_sentiment',
  'get_finnhub_company_insider_transactions',
  'get_finnhub_balance_sheet',
  'get_finnhub_cashflow',
  'get_finnhub_income_stmt',
];

const formatToolReminder = (primary: string): string => primary;

export class FundamentalsAnalyst {
  analyze(ctx: AgentsContext, symbol: string, tradeDate: string): AgentPrompt {
    const systemMessage = `You are a researcher tasked with analyzing fundamental information over the past week about a company. Please write a comprehensive report of the company's fundamental information such as financial documents, company profile, basic company financials, company financial history, insider sentiment and insider transactions to gain a full view of the company's fundamental information to inform traders. Make sure to include as much detail as possible. Do not simply state the trends are mixed, provide detailed and finegrained analysis and insights that may help traders make decisions. Make sure to append a Markdown table at the end of the report to organize key points in the report, organized and easy to read.`;

  const collabHeader = `You are a helpful AI assistant, collaborating with other assistants. You MUST use the provided tools to fetch real fundamentals before writing any report. Do not summarize placeholders. Call at least two tools among: ${TOOL_LABELS.join(', ')}. If a tool fails, try another. If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable, prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop.\n${systemMessage} For your reference, the current date is ${tradeDate}. The company we want to look at is ${symbol}`;

    const userLines: string[] = [];
    const missingPlaceholder = 'Not provided by internal engine at this time.';

    // fundamentals_summary intentionally not included to avoid leaking precompiled summaries

    const addSection = (
      label: string,
      value: string | undefined,
      primaryTool: string,
    ) => {
      const trimmed = value?.toString().trim();
      if (trimmed && trimmed !== missingPlaceholder) {
        userLines.push(`${label}:\n${trimmed}`);
        return;
      }

      const reminder = formatToolReminder(primaryTool);
      userLines.push(`${label}:\nNo ${label.toLowerCase()} data preloaded. Call ${reminder} to retrieve the latest figures.`);
    };

    // Use tool reminders when detailed statements are missing so the agent fetches them on demand.
    addSection('Balance sheet', ctx.fundamentals_balance_sheet, 'get_finnhub_balance_sheet');
    addSection('Cash flow', ctx.fundamentals_cashflow, 'get_finnhub_cashflow');
    addSection('Income statement', ctx.fundamentals_income_stmt, 'get_finnhub_income_stmt');

    // Do not include preloaded insider data; require tool usage instead
    userLines.push(
      'Insider data:\nNo insider transactions or sentiment data preloaded. Call get_finnhub_company_insider_transactions and get_finnhub_company_insider_sentiment to retrieve the latest details.'
    );

    return {
      roleLabel: 'Fundamentals Analyst',
      system: collabHeader,
      user: userLines.join('\n\n') || 'No fundamentals provided.',
    };
  }
}

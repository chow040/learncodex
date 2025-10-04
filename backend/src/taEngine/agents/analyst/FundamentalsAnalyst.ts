import type { AgentsContext, AgentPrompt } from '../../types.js';

export class FundamentalsAnalyst {
  analyze(ctx: AgentsContext, symbol: string, tradeDate: string): AgentPrompt {
    const toolNames = [
      'get_fundamentals_openai',
      'get_finnhub_company_insider_sentiment',
      'get_finnhub_company_insider_transactions',
      'get_finnhub_balance_sheet',
      'get_finnhub_cashflow',
      'get_finnhub_income_stmt',
    ].join(', ');

    const systemMessage = `You are a researcher tasked with analyzing fundamental information over the past week about a company. Please write a comprehensive report of the company's fundamental information such as financial documents, company profile, basic company financials, company financial history, insider sentiment and insider transactions to gain a full view of the company's fundamental information to inform traders. Make sure to include as much detail as possible. Do not simply state the trends are mixed, provide detailed and finegrained analysis and insights that may help traders make decisions. Make sure to append a Markdown table at the end of the report to organize key points in the report, organized and easy to read.`;

    const collabHeader = `You are a helpful AI assistant, collaborating with other assistants. Use the provided tools to progress towards answering the question. If you are unable to fully answer, that's OK; another assistant with different tools will help where you left off. Execute what you can to make progress. If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable, prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop. You have access to the following tools: ${toolNames}.\n${systemMessage}For your reference, the current date is ${tradeDate}. The company we want to look at is ${symbol}`;

    const userLines: string[] = [];
    if (ctx.fundamentals_summary) userLines.push(`Fundamentals overview:\n${ctx.fundamentals_summary}`);
    if (ctx.fundamentals_balance_sheet) userLines.push(`Balance sheet:\n${ctx.fundamentals_balance_sheet}`);
    if (ctx.fundamentals_cashflow) userLines.push(`Cash flow:\n${ctx.fundamentals_cashflow}`);
    if (ctx.fundamentals_income_stmt) userLines.push(`Income statement:\n${ctx.fundamentals_income_stmt}`);
  if (ctx.fundamentals_insider_transactions) userLines.push(`Insider transactions (recent):\n${ctx.fundamentals_insider_transactions}`);

    return {
      roleLabel: 'Fundamentals Analyst',
      system: collabHeader,
      user: userLines.join('\n\n') || 'No fundamentals provided.',
    };
  }
}

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { registerTool, TOOL_IDS } from '../toolRegistry.js';
import type { ToolContext } from '../types.js';
import { withToolLogging } from '../toolLogging.js';
import {
  getFinancialsReported,
  getInsiderTransactions,
  type InsiderTransactionItem,
  type InsiderSentimentItem,
  getInsiderSentiment,
} from '../../../services/finnhubService.js';
import { buildFinancialStatementDetail } from '../../../services/financialsFormatter.js';

type SectionKey = 'bs' | 'cf' | 'ic';

const financialSchema = z.object({
  ticker: z.string().trim().min(1).optional().describe('Ticker symbol to fetch. Defaults to the active symbol.'),
  freq: z.enum(['annual', 'quarterly']).optional().describe('Reporting frequency. Defaults to quarterly.'),
  limit: z
    .number()
    .int()
    .min(10)
    .max(200)
    .optional()
    .describe('Maximum number of line items per filing. Defaults to 60.'),
});

const financialJsonSchema = {
  type: 'object',
  properties: {
    ticker: { type: 'string', description: 'Ticker symbol to fetch. Defaults to the active symbol.' },
    freq: { type: 'string', enum: ['annual', 'quarterly'], description: 'Reporting frequency. Defaults to quarterly.' },
    limit: { type: 'integer', minimum: 10, maximum: 200, description: 'Maximum number of line items per filing. Defaults to 60.' },
  },
  additionalProperties: false,
};

const insiderTransactionsSchema = z.object({
  ticker: z.string().trim().min(1).optional().describe('Ticker symbol to fetch. Defaults to the active symbol.'),
  lookback_days: z
    .number()
    .int()
    .min(7)
    .max(365)
    .optional()
    .describe('Lookback window in days. Defaults to 90.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum number of transactions to list. Defaults to 15.'),
});

const insiderTransactionsJsonSchema = {
  type: 'object',
  properties: {
    ticker: { type: 'string', description: 'Ticker symbol to fetch. Defaults to the active symbol.' },
    lookback_days: { type: 'integer', minimum: 7, maximum: 365, description: 'Lookback window in days. Defaults to 90.' },
    limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum number of transactions to list. Defaults to 15.' },
  },
  additionalProperties: false,
};

const insiderSentimentSchema = z.object({
  ticker: z.string().trim().min(1).optional().describe('Ticker symbol to fetch. Defaults to the active symbol.'),
  lookback_months: z
    .number()
    .int()
    .min(1)
    .max(36)
    .optional()
    .describe('Months of insider sentiment to retrieve. Defaults to 6.'),
});

const insiderSentimentJsonSchema = {
  type: 'object',
  properties: {
    ticker: { type: 'string', description: 'Ticker symbol to fetch. Defaults to the active symbol.' },
    lookback_months: { type: 'integer', minimum: 1, maximum: 36, description: 'Months of insider sentiment to retrieve. Defaults to 6.' },
  },
  additionalProperties: false,
};

const formatTransactions = (items: InsiderTransactionItem[], limit: number): string => {
  if (!items.length) {
    return 'No insider transactions recorded in the requested window.';
  }

  const lines = items.slice(0, limit).map((tx) => {
    const price = tx.transactionPrice !== null && tx.transactionPrice !== undefined ? `$${tx.transactionPrice.toFixed(2)}` : 'N/A';
    const change = tx.change !== null && tx.change !== undefined ? tx.change.toLocaleString('en-US') : 'N/A';
    const shares = tx.share !== null && tx.share !== undefined ? tx.share.toLocaleString('en-US') : 'N/A';
    return `• ${tx.transactionDate}: ${tx.name || 'Insider'} (${tx.transactionCode || 'N/A'}) @ ${price} | Change ${change} | Shares ${shares}`;
  });

  const summary = [
    `Recent insider transactions (${items.length} records fetched).`,
    '',
    ...lines,
  ];

  if (items.length > limit) {
    summary.push('', `… ${items.length - limit} additional transactions truncated.`);
  }

  return summary.join('\n');
};

const formatSentiment = (items: InsiderSentimentItem[]): string => {
  if (!items.length) {
    return 'No insider sentiment data retrieved for the requested window.';
  }

  const sorted = [...items].sort((a, b) => {
    const aKey = a.year * 12 + a.month;
    const bKey = b.year * 12 + b.month;
    return bKey - aKey;
  });

  const lines = sorted.map((entry) => {
    const month = `${entry.year}-${String(entry.month).padStart(2, '0')}`;
    const change = entry.change !== null && entry.change !== undefined ? entry.change.toFixed(2) : 'N/A';
    const mspr = entry.mspr !== null && entry.mspr !== undefined ? entry.mspr.toFixed(3) : 'N/A';
    return `• ${month}: Change=${change}, MSPR=${mspr}`;
  });

  const recent = sorted.slice(0, Math.min(sorted.length, 6));
  const avgChange = recent.reduce((sum, item) => sum + (item.change ?? 0), 0) / recent.length;

  return [
    `Insider sentiment (${sorted.length} months retrieved).`,
    `Average change (last ${recent.length} months): ${avgChange.toFixed(2)}`,
    '',
    ...lines,
  ].join('\n');
};

const resolveTicker = (inputTicker: string | undefined, context: ToolContext): { ticker: string; warning?: string } => {
  const requested = inputTicker?.trim().toUpperCase();
  if (!requested) {
    return { ticker: context.symbol };
  }
  if (requested !== context.symbol) {
    return {
      ticker: context.symbol,
      warning: `Requested ticker ${requested} does not match active symbol ${context.symbol}. Using ${context.symbol} instead.`,
    };
  }
  return { ticker: requested };
};

const parseTradeDate = (tradeDate: string | undefined): Date => {
  if (!tradeDate) return new Date();
  const parsed = new Date(tradeDate);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const registerFinancialSectionTool = (section: SectionKey, toolId: typeof TOOL_IDS[keyof typeof TOOL_IDS], description: string) => {
  registerTool({
    name: toolId,
    description,
    schema: financialJsonSchema,
    create: (context) => new DynamicStructuredTool({
      name: toolId,
      description,
      schema: financialSchema,
      func: async (input) => withToolLogging(toolId, input, context.logger, async () => {
        const { ticker, warning } = resolveTicker(input.ticker, context);
        const freq = input.freq ?? 'quarterly';
        const limit = input.limit ?? 60;
        const reports = await getFinancialsReported(ticker, freq).catch(() => []);
        const detail = buildFinancialStatementDetail(reports, section, { limitPerStatement: limit });
        const header = warning ? `${warning}\n\n` : '';
        return header + (detail ?? `No ${section === 'bs' ? 'balance sheet' : section === 'cf' ? 'cash flow' : 'income statement'} data available for ${ticker} (${freq}).`);
      }),
    }),
  });
};

const registerInsiderTransactionsTool = () => {
  const description = 'Retrieve recent insider transactions for the active ticker.';
  registerTool({
    name: TOOL_IDS.FINNHUB_INSIDER_TRANSACTIONS,
    description,
    schema: insiderTransactionsJsonSchema,
    create: (context) => new DynamicStructuredTool({
      name: TOOL_IDS.FINNHUB_INSIDER_TRANSACTIONS,
      description,
      schema: insiderTransactionsSchema,
      func: async (input) => withToolLogging(TOOL_IDS.FINNHUB_INSIDER_TRANSACTIONS, input, context.logger, async () => {
        const { ticker, warning } = resolveTicker(input.ticker, context);
        const lookbackDays = input.lookback_days ?? 90;
        const limit = input.limit ?? 15;
        const end = parseTradeDate(context.tradeDate);
        const from = new Date(end);
        from.setDate(from.getDate() - lookbackDays);
        const transactions = await getInsiderTransactions(ticker, from, end);
        const header = warning ? `${warning}\n\n` : '';
        return header + formatTransactions(transactions, limit);
      }),
    }),
  });
};

const registerInsiderSentimentTool = () => {
  const description = 'Retrieve Finnhub insider sentiment metrics for the active ticker.';
  registerTool({
    name: TOOL_IDS.FINNHUB_INSIDER_SENTIMENT,
    description,
    schema: insiderSentimentJsonSchema,
    create: (context) => new DynamicStructuredTool({
      name: TOOL_IDS.FINNHUB_INSIDER_SENTIMENT,
      description,
      schema: insiderSentimentSchema,
      func: async (input) => withToolLogging(TOOL_IDS.FINNHUB_INSIDER_SENTIMENT, input, context.logger, async () => {
        const { ticker, warning } = resolveTicker(input.ticker, context);
        const months = input.lookback_months ?? 6;
        const end = parseTradeDate(context.tradeDate);
        const from = new Date(end);
        from.setMonth(from.getMonth() - months);
        const sentiment = await getInsiderSentiment(ticker, from, end);
        const header = warning ? `${warning}\n\n` : '';
        return header + formatSentiment(sentiment);
      }),
    }),
  });
};

export const registerFinnhubFundamentalTools = (): void => {
  registerFinancialSectionTool('bs', TOOL_IDS.FINNHUB_BALANCE_SHEET, 'Retrieve the latest balance sheet excerpts from Finnhub filings.');
  registerFinancialSectionTool('cf', TOOL_IDS.FINNHUB_CASHFLOW, 'Retrieve the latest cash flow statement excerpts from Finnhub filings.');
  registerFinancialSectionTool('ic', TOOL_IDS.FINNHUB_INCOME_STATEMENT, 'Retrieve the latest income statement excerpts from Finnhub filings.');
  registerInsiderTransactionsTool();
  registerInsiderSentimentTool();
};

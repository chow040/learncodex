import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import {
  TOOL_IDS,
  registerTool,
} from '../toolRegistry.js';
import { withToolLogging } from '../toolLogging.js';
import type { ToolContext } from '../types.js';
import { getGoogleNews } from '../../../services/googleNewsService.js';
import {
  getCompanyNews,
  type CompanyNewsArticle,
} from '../../../services/finnhubService.js';
import {
  getRedditInsights,
  type RedditInsightsResponse,
} from '../../../services/redditService.js';

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const parseTradeDate = (tradeDate: string | undefined): Date => {
  if (!tradeDate) return new Date();
  const parsed = new Date(tradeDate);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const resolveTicker = (inputTicker: string | undefined, context: ToolContext): { ticker: string; warning?: string } => {
  const requested = inputTicker?.trim().toUpperCase();
  if (!requested) return { ticker: context.symbol };
  if (requested !== context.symbol) {
    return {
      ticker: context.symbol,
      warning: `Requested ticker ${requested} does not match active symbol ${context.symbol}. Using ${context.symbol} instead.`,
    };
  }
  return { ticker: requested };
};

const googleNewsSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search query. Defaults to the active ticker.' },
    lookback_days: { type: 'integer', minimum: 1, maximum: 30, description: 'Days to look back from the trade date. Defaults to 7.' },
    limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Maximum number of articles to summarise. Defaults to 12.' },
  },
  additionalProperties: false,
};

const finnhubNewsSchema = {
  type: 'object',
  properties: {
    ticker: { type: 'string', description: 'Ticker symbol. Defaults to the active symbol.' },
    lookback_days: { type: 'integer', minimum: 1, maximum: 30, description: 'Days to look back from the trade date. Defaults to 7.' },
    limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum number of articles to include. Defaults to 20.' },
  },
  additionalProperties: false,
};

const redditNewsSchema = {
  type: 'object',
  properties: {
    ticker: { type: 'string', description: 'Ticker symbol to search for. Defaults to the active symbol.' },
    limit: { type: 'integer', minimum: 3, maximum: 20, description: 'Maximum number of posts to include. Defaults to 10.' },
  },
  additionalProperties: false,
};

const googleNewsInput = z.object({
  query: z.string().trim().min(1).optional(),
  lookback_days: z.number().int().min(1).max(30).optional(),
  limit: z.number().int().min(1).max(25).optional(),
});

const finnhubNewsInput = z.object({
  ticker: z.string().trim().min(1).optional(),
  lookback_days: z.number().int().min(1).max(30).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const redditNewsInput = z.object({
  ticker: z.string().trim().min(1).optional(),
  limit: z.number().int().min(3).max(20).optional(),
});

const formatGoogleNews = (items: Array<Record<string, string>>, limit: number, query: string): string => {
  if (!Array.isArray(items) || !items.length) {
    return `No Google News articles found for "${query}".`;
  }

  const lines = items.slice(0, limit).map((item, index) => {
    const title = item.title?.trim() || `Story ${index + 1}`;
    const snippet = item.snippet?.trim() || 'No snippet provided.';
    const source = item.source?.trim();
    const date = item.date?.trim();
    const link = item.link?.trim();
    const metaParts = [];
    if (source) metaParts.push(`Source: ${source}`);
    if (date) metaParts.push(`Published: ${date}`);
    const metadata = metaParts.length ? `- ${metaParts.join(' | ')}` : '';
    const linkLine = link ? `Link: ${link}` : 'Link unavailable.';
    return `### ${title}\n${metadata}\n${snippet}\n${linkLine}`;
  });

  const suffix = items.length > limit ? `\n\n… ${items.length - limit} additional articles truncated.` : '';
  return `Google News results for "${query}":\n\n${lines.join('\n\n')}${suffix}`;
};

const formatCompanyNews = (articles: CompanyNewsArticle[], limit: number, ticker: string): string => {
  if (!articles.length) {
    return `No Finnhub company news retrieved for ${ticker}.`;
  }

  const lines = articles.slice(0, limit).map((article) => {
    const headline = article.headline || 'Untitled article';
    const summary = article.summary ? article.summary.trim() : 'No summary provided.';
    const source = article.source || 'Unknown source';
    const date = article.datetime ? new Date(article.datetime * 1000).toISOString().slice(0, 10) : 'Unknown date';
    const link = article.url || 'Link unavailable.';
    return `### ${headline}\n- Source: ${source} | Date: ${date}\n${summary}\n${link}`;
  });

  const suffix = articles.length > limit ? `\n\n… ${articles.length - limit} additional articles truncated.` : '';
  return `Finnhub company news for ${ticker}:\n\n${lines.join('\n\n')}${suffix}`;
};

const formatRedditNews = (insights: RedditInsightsResponse, limit: number): string => {
  if (!insights.posts.length) {
    return `No Reddit posts captured for ${insights.ticker} (${insights.query}).`;
  }

  const header = [
    `Reddit sentiment for ${insights.ticker} (query: ${insights.query})`,
    `- Total posts (7d): ${insights.totalPosts.toLocaleString('en-US')}`,
    `- Total upvotes: ${insights.totalUpvotes.toLocaleString('en-US')}`,
    `- Average comments per post: ${insights.averageComments}`,
  ].join('\n');

  const subredditLines = insights.topSubreddits.length
    ? ['Top subreddits:', ...insights.topSubreddits.map((item) => `• r/${item.name}: ${item.mentions} mentions`)].join('\n')
    : 'Top subreddits: (none captured)';

  const postLines = insights.posts.slice(0, limit).map((post) => {
    const title = post.title || '(untitled)';
    const score = post.score.toLocaleString('en-US');
    const comments = post.comments.toLocaleString('en-US');
    const link = post.url || 'Link unavailable.';
    return `• ${title} — Score ${score} | Comments ${comments}\n  ${link}`;
  });

  const suffix = insights.posts.length > limit ? `\n\n… ${insights.posts.length - limit} additional posts truncated.` : '';

  return [
    header,
    '',
    subredditLines,
    '',
    'Trending posts:',
    ...postLines,
    suffix,
  ].join('\n');
};

export const registerNewsTools = (): void => {
  // Google News
  registerTool({
    name: TOOL_IDS.GOOGLE_NEWS,
    description: 'Search Google News for a query within a configurable lookback window.',
    schema: googleNewsSchema,
    create: (context) =>
      new DynamicStructuredTool({
        name: TOOL_IDS.GOOGLE_NEWS,
        description: 'Search Google News for relevant articles.',
        schema: googleNewsInput,
        func: async (input) =>
          withToolLogging(TOOL_IDS.GOOGLE_NEWS, input, context.logger, async () => {
            const query = input.query?.trim() || context.symbol;
            const lookbackDays = input.lookback_days ?? 7;
            const limit = input.limit ?? 12;
            const end = parseTradeDate(context.tradeDate);
            const start = new Date(end);
            start.setDate(start.getDate() - lookbackDays);
            const results = await getGoogleNews(query, formatDate(start), formatDate(end));
            return formatGoogleNews(results, limit, query);
          }),
      }),
  });

  // Finnhub company news
  registerTool({
    name: TOOL_IDS.FINNHUB_MARKET_NEWS,
    description: 'Retrieve recent Finnhub company news for the active ticker.',
    schema: finnhubNewsSchema,
    create: (context) =>
      new DynamicStructuredTool({
        name: TOOL_IDS.FINNHUB_MARKET_NEWS,
        description: 'Fetch Finnhub company news articles for the active ticker.',
        schema: finnhubNewsInput,
        func: async (input) =>
          withToolLogging(TOOL_IDS.FINNHUB_MARKET_NEWS, input, context.logger, async () => {
            const { ticker, warning } = resolveTicker(input.ticker, context);
            const lookbackDays = input.lookback_days ?? 7;
            const limit = input.limit ?? 20;
            const end = parseTradeDate(context.tradeDate);
            const start = new Date(end);
            start.setDate(start.getDate() - lookbackDays);
            const articles = await getCompanyNews(ticker, start, end).catch(() => []);
            const header = warning ? `${warning}\n\n` : '';
            return header + formatCompanyNews(articles, limit, ticker);
          }),
      }),
  });

  // Reddit news
  registerTool({
    name: TOOL_IDS.REDDIT_NEWS,
    description: 'Retrieve recent Reddit discussions mentioning the ticker.',
    schema: redditNewsSchema,
    create: (context) =>
      new DynamicStructuredTool({
        name: TOOL_IDS.REDDIT_NEWS,
        description: 'Fetch Reddit sentiment/news for the active ticker.',
        schema: redditNewsInput,
        func: async (input) =>
          withToolLogging(TOOL_IDS.REDDIT_NEWS, input, context.logger, async () => {
            const { ticker, warning } = resolveTicker(input.ticker, context);
            const limit = input.limit ?? 10;
            const insights = await getRedditInsights(ticker, limit).catch(() => null);
            const header = warning ? `${warning}\n\n` : '';
            if (!insights) {
              return `${header}Unable to retrieve Reddit insights for ${ticker}.`;
            }
            return header + formatRedditNews(insights, limit);
          }),
      }),
  });
};

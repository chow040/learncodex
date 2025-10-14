import type OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';

import { env } from '../../config/env.js';
import { logNewsToolCalls, logNewsConversation } from '../logger.js';
import { getCompanyNews, type CompanyNewsArticle } from '../../services/finnhubService.js';
import { getGoogleNews } from '../../services/googleNewsService.js';
import { getRedditInsights, type RedditInsightsResponse } from '../../services/redditService.js';
import type { AgentsContext, TradingAgentsPayload } from '../types.js';

const FALLBACK_NO_DATA = 'No data available.';
const MAX_COMPLETION_TOKENS = 6000;
const INITIAL_AI_TIMEOUT_MS = 60_000;
const FOLLOWUP_AI_TIMEOUT_MS = 75_000;
const EXECUTION_TIME_LIMIT_MS = 90_000;

const KNOWN_PLACEHOLDERS = [
  'No news provided.',
  'No company news provided.',
  'No reddit news provided.',
  'No reddit or social data available for this symbol in the requested window.',
  'Global macro summary unavailable.',
  'Global macro feed not supplied; use internal macro dashboard as needed.',
  'Global macro feed not supplied via TradingAgents integration; use internal macro dashboard as needed.',
  'Not provided by internal engine at this time.',
  'No company news data preloaded. Call get_finnhub_news to retrieve the latest updates.',
  'No company news data preloaded. Call get_google_news to retrieve the latest updates.',
  'No reddit discussions data preloaded. Call get_reddit_news to retrieve the latest updates.',
  'No global macro news data preloaded. Call get_google_news to retrieve the latest updates.',
];

const PLACEHOLDER_HINTS = [
  'no company news data preloaded',
  'no reddit discussions data preloaded',
  'no global macro news data preloaded',
  'no global macro news',
  'no reddit news',
  'no company news',
  'no data provided for',
  'placeholder',
  'not supplied',
];

const KNOWN_PLACEHOLDERS_LOWER = new Set(KNOWN_PLACEHOLDERS.map((value) => value.toLowerCase()));

type ToolHandler = (args: any) => Promise<string>;

interface NewsAgentState {
  messages: ChatCompletionMessageParam[];
  step_count: number;
  tool_calls_made: number;
  completed: boolean;
  final_output: string | null;
  context: AgentsContext;
  symbol: string;
  trade_date: string;
}

const sanitizeNewsValue = (value: unknown): string => {
  if (value === undefined || value === null) return FALLBACK_NO_DATA;
  const str = value.toString().trim();
  if (!str) return FALLBACK_NO_DATA;

  const lower = str.toLowerCase();
  if (KNOWN_PLACEHOLDERS_LOWER.has(lower)) return FALLBACK_NO_DATA;
  if (PLACEHOLDER_HINTS.some((hint) => lower.includes(hint))) return FALLBACK_NO_DATA;

  return str;
};

const parseInteger = (value: unknown, fallback: number, opts: { min?: number; max?: number } = {}): number => {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : Number.NaN;

  const candidate = Number.isFinite(numeric) ? numeric : fallback;
  const min = opts.min ?? Number.MIN_SAFE_INTEGER;
  const max = opts.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(candidate, min), max);
};

const parseDateInput = (value: unknown, fallback: Date): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value.trim());
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date(fallback);
};

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const subtractDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - days);
  return copy;
};

const formatEpochDate = (epochSeconds: number): string => {
  if (!Number.isFinite(epochSeconds)) return 'n/a';
  const millis = epochSeconds > 10_000_000_000 ? epochSeconds : epochSeconds * 1000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toISOString().slice(0, 10);
};

const formatCompanyNewsArticles = (articles: CompanyNewsArticle[], limit: number): string => {
  if (!articles.length) {
    return 'No recent company news retrieved from Finnhub for the requested window.';
  }

  const blocks = articles
    .slice(0, limit)
    .map((article, index) => {
      const headline = article.headline || `Story ${index + 1}`;
      const source = article.source || 'Unknown source';
      const date = formatEpochDate(article.datetime);
      const summary = article.summary ? article.summary.trim() : 'Summary not provided.';
      const link = article.url || 'N/A';
      return `### ${headline}\n- Source: ${source} | Date: ${date}\n${summary}\nLink: ${link}`;
    });

  return blocks.join('\n\n');
};

const normalizeField = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const formatGoogleNewsItems = (items: Array<Record<string, string>>, limit: number): string => {
  if (!Array.isArray(items) || !items.length) {
    return 'No Google News articles matched the query in the requested window.';
  }

  const valid = items
    .map((item, index) => {
      const title = normalizeField(item.title) || `Story ${index + 1}`;
      const snippet = normalizeField(item.snippet) || 'Snippet not provided.';
      const source = normalizeField(item.source);
      const date = normalizeField(item.date);
      const link = normalizeField(item.link);

      const metadataParts = [];
      if (source) metadataParts.push(`Source: ${source}`);
      if (date) metadataParts.push(`Published: ${date}`);
      const metadata = metadataParts.length ? `- ${metadataParts.join(' | ')}` : '- Source metadata unavailable';

      const linkLine = link ? `Link: ${link}` : 'Link unavailable.';

      return `### ${title}\n${metadata}\n${snippet}\n${linkLine}`;
    });

  if (!valid.length) {
    return 'No Google News articles matched the query in the requested window.';
  }

  return valid.slice(0, limit).join('\n\n');
};

const formatRedditInsights = (insights: RedditInsightsResponse | null, limit: number): string => {
  if (!insights) {
    return 'No Reddit discussions retrieved for the requested symbol.';
  }

  const header = [
    `Reddit coverage for ${insights.ticker} (query: ${insights.query})`,
    `- Posts (7d): ${insights.totalPosts.toLocaleString('en-US')}`,
    `- Total upvotes: ${insights.totalUpvotes.toLocaleString('en-US')}`,
    `- Average comments per post: ${insights.averageComments}`,
  ].join('\n');

  const subreddits = insights.topSubreddits.length
    ? ['Top subreddits:', ...insights.topSubreddits.map((item) => `• r/${item.name}: ${item.mentions} mentions`)].join('\n')
    : 'Top subreddits: (none captured)';

  const posts = insights.posts
    .slice(0, limit)
    .map((post) => {
      const title = post.title || '(untitled)';
      const score = post.score.toLocaleString('en-US');
      const comments = post.comments.toLocaleString('en-US');
      const url = post.url || 'Link unavailable';
      return `• ${title} — Score ${score} | Comments ${comments}\n  ${url}`;
    })
    .join('\n');

  const postsSection = posts.length
    ? `Trending posts:\n${posts}`
    : 'Trending posts: none captured in the requested window.';

  return [header, '', subreddits, '', postsSection].join('\n');
};

export class StateNewsAgent {
  private client: OpenAI;
  private newsTools: ChatCompletionTool[];
  private toolHandlers: Record<string, ToolHandler>;
  private googleCache: Map<string, string>;
  private finnhubCache: Map<string, string>;
  private redditCache: Map<string, string>;

  constructor(client: OpenAI) {
    this.client = client;
    this.newsTools = [];
    this.toolHandlers = {};
    this.googleCache = new Map();
    this.finnhubCache = new Map();
    this.redditCache = new Map();

    this.setupTools();
  }

  private setupTools(): void {
    this.newsTools = [
      {
        type: 'function',
        function: {
          name: 'get_finnhub_news',
          description: 'Retrieve recent company news for a ticker from Finnhub.',
          parameters: {
            type: 'object',
            properties: {
              ticker: { type: 'string', description: 'Ticker symbol to fetch news for. Defaults to the active symbol.' },
              curr_date: { type: 'string', description: 'Reference date in yyyy-mm-dd format. Defaults to the trade date.' },
              look_back_days: { type: 'integer', description: 'Days prior to curr_date to include. Defaults to 7.', minimum: 1, maximum: 30 },
              limit: { type: 'integer', description: 'Maximum number of articles to return. Defaults to 10.', minimum: 1, maximum: 20 },
              force_refresh: { type: 'boolean', description: 'Set true to bypass cached/context data and refetch.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_google_news',
          description: 'Scrape Google News for a query within a date range.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query. Defaults to the active ticker symbol.' },
              curr_date: { type: 'string', description: 'Reference date in yyyy-mm-dd format. Defaults to trade date.' },
              look_back_days: { type: 'integer', description: 'Days prior to curr_date to include. Defaults to 7.', minimum: 1, maximum: 30 },
              limit: { type: 'integer', description: 'Maximum number of search results to return. Defaults to 10.', minimum: 1, maximum: 20 },
              force_refresh: { type: 'boolean', description: 'Set true to bypass cached/context data and refetch.' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_reddit_news',
          description: 'Fetch Reddit discussions mentioning the ticker over the past week.',
          parameters: {
            type: 'object',
            properties: {
              ticker: { type: 'string', description: 'Ticker symbol to search for. Defaults to the active symbol.' },
              limit: { type: 'integer', description: 'Maximum number of posts to surface. Defaults to 8.', minimum: 3, maximum: 20 },
              force_refresh: { type: 'boolean', description: 'Set true to bypass cached/context data and refetch.' },
            },
          },
        },
      },
    ];
  }

  private createInitialState(
    systemPrompt: string,
    userPrompt: string,
    context: AgentsContext,
    symbol: string,
    tradeDate: string,
  ): NewsAgentState {
    return {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      step_count: 0,
      tool_calls_made: 0,
      completed: false,
      final_output: null,
      context,
      symbol,
      trade_date: tradeDate,
    };
  }

  private createToolHandlers(context: AgentsContext, symbol: string, tradeDate: string): Record<string, ToolHandler> {
    const baseDate = parseDateInput(tradeDate, new Date());

    const companyContext = sanitizeNewsValue(context.news_company);
    const redditContext = sanitizeNewsValue(context.news_reddit);
    const globalContext = sanitizeNewsValue(context.news_global);

    const shouldFetch = (existing: string, forceRefresh: boolean): boolean =>
      existing === FALLBACK_NO_DATA || forceRefresh;

    return {
      get_finnhub_news: async (rawArgs: any = {}) => {
        const ticker = typeof rawArgs?.ticker === 'string' && rawArgs.ticker.trim()
          ? rawArgs.ticker.trim().toUpperCase()
          : symbol;
        const lookback = parseInteger(rawArgs?.look_back_days ?? rawArgs?.lookBackDays, 7, { min: 1, max: 30 });
        const limit = parseInteger(rawArgs?.limit, 10, { min: 1, max: 20 });
        const currDate = parseDateInput(rawArgs?.curr_date ?? rawArgs?.currDate, baseDate);
        const forceRefresh = Boolean(rawArgs?.force_refresh || rawArgs?.forceRefresh || rawArgs?.refresh);

        if (!shouldFetch(companyContext, forceRefresh)) {
          return companyContext;
        }

        const fromDate = subtractDays(currDate, lookback);
        const cacheKey = JSON.stringify({ ticker, from: formatDate(fromDate), to: formatDate(currDate), limit });

        if (!forceRefresh && this.finnhubCache.has(cacheKey)) {
          return this.finnhubCache.get(cacheKey)!;
        }

        try {
          const articles = await getCompanyNews(ticker, fromDate, currDate);
          const formatted = formatCompanyNewsArticles(articles, limit);
          this.finnhubCache.set(cacheKey, formatted);
          return formatted;
        } catch (error) {
          const message = (error as Error)?.message ?? String(error);
          return `Failed to retrieve Finnhub company news: ${message}`;
        }
      },
      get_google_news: async (rawArgs: any = {}) => {
        const defaultQuery = symbol;
        const query = typeof rawArgs?.query === 'string' && rawArgs.query.trim()
          ? rawArgs.query.trim()
          : defaultQuery;
        const lookback = parseInteger(rawArgs?.look_back_days ?? rawArgs?.lookBackDays, 7, { min: 1, max: 30 });
        const limit = parseInteger(rawArgs?.limit, 10, { min: 1, max: 20 });
        const currDate = parseDateInput(rawArgs?.curr_date ?? rawArgs?.currDate, baseDate);
        const forceRefresh = Boolean(rawArgs?.force_refresh || rawArgs?.forceRefresh || rawArgs?.refresh);

        const existing = query === defaultQuery ? companyContext : globalContext;
        if (!shouldFetch(existing, forceRefresh)) {
          return existing;
        }

        const fromDate = subtractDays(currDate, lookback);
        const cacheKey = JSON.stringify({ query: query.toLowerCase(), from: formatDate(fromDate), to: formatDate(currDate), limit });

        if (!forceRefresh && this.googleCache.has(cacheKey)) {
          return this.googleCache.get(cacheKey)!;
        }

        try {
          const results = await getGoogleNews(query, formatDate(fromDate), formatDate(currDate));
          const formatted = formatGoogleNewsItems(results as Array<Record<string, string>>, limit);
          this.googleCache.set(cacheKey, formatted);
          return formatted;
        } catch (error) {
          const message = (error as Error)?.message ?? String(error);
          return `Failed to retrieve Google News results: ${message}`;
        }
      },
      get_reddit_news: async (rawArgs: any = {}) => {
        const ticker = typeof rawArgs?.ticker === 'string' && rawArgs.ticker.trim()
          ? rawArgs.ticker.trim().toUpperCase()
          : symbol;
        const limit = parseInteger(rawArgs?.limit, 8, { min: 3, max: 20 });
        const forceRefresh = Boolean(rawArgs?.force_refresh || rawArgs?.forceRefresh || rawArgs?.refresh);

        if (!shouldFetch(redditContext, forceRefresh)) {
          return redditContext;
        }

        const cacheKey = JSON.stringify({ ticker, limit });

        if (!forceRefresh && this.redditCache.has(cacheKey)) {
          return this.redditCache.get(cacheKey)!;
        }

        try {
          const insights = await getRedditInsights(ticker, limit);
          const formatted = formatRedditInsights(insights, limit);
          this.redditCache.set(cacheKey, formatted);
          return formatted;
        } catch (error) {
          const message = (error as Error)?.message ?? String(error);
          return `Failed to retrieve Reddit news: ${message}`;
        }
      },
    };
  }

  private async callModel(
    messages: ChatCompletionMessageParam[],
    includeTools = false,
    timeoutMs = FOLLOWUP_AI_TIMEOUT_MS,
  ): Promise<ChatCompletion> {
    const params: ChatCompletionCreateParams = {
      model: env.openAiModel,
      messages,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
    };

    if (includeTools) {
      params.tools = this.newsTools;
    }

    return Promise.race([
      this.client.chat.completions.create(params),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI call timeout')), timeoutMs)),
    ]) as Promise<ChatCompletion>;
  }

  private async executeToolCalls(state: NewsAgentState, payload: TradingAgentsPayload): Promise<NewsAgentState> {
    const lastMessage = state.messages[state.messages.length - 1] as ChatCompletionMessageParam & {
      tool_calls?: ChatCompletionMessageToolCall[];
    };

    const toolCalls = lastMessage?.tool_calls ?? [];
    if (!toolCalls.length) {
      return state;
    }

    const toolOutputs: ChatCompletionToolMessageParam[] = [];
    const logEntries: Array<{ toolCallId: string; name: string | null; args: unknown; output: string }> = [];

    for (const toolCall of toolCalls) {
      if (toolCall.type !== 'function') {
        console.warn(`[StateNewsAgent] Unsupported tool call type "${toolCall.type}" encountered; skipping.`);
        continue;
      }

      const fnCall = toolCall.function;
      const name = fnCall?.name ?? null;
      const handler = name ? this.toolHandlers[name] : undefined;

      let parsedArgs: any = {};
      if (fnCall?.arguments) {
        try {
          parsedArgs = JSON.parse(fnCall.arguments);
        } catch (error) {
          parsedArgs = {};
        }
      }

      let output = '';
      if (!handler) {
        output = `Tool ${name ?? 'unknown'} is not implemented.`;
      } else {
        try {
          output = await handler(parsedArgs);
          state.tool_calls_made += 1;
        } catch (error) {
          const message = (error as Error)?.message ?? String(error);
          output = `Failed to execute ${name}: ${message}`;
        }
      }

      toolOutputs.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: output,
      });

      logEntries.push({
        toolCallId: toolCall.id,
        name,
        args: parsedArgs,
        output,
      });
    }

    if (logEntries.length) {
      try {
        await logNewsToolCalls(payload, logEntries);
      } catch (error) {
        console.error('[StateNewsAgent] Failed to log news tool calls:', error);
      }
    }

    state.messages.push(...toolOutputs);

    try {
      const response = await this.callModel(state.messages, true);
      const assistantMessage = response.choices[0]?.message;

      if (assistantMessage) {
        state.messages.push({
          role: 'assistant',
          content: assistantMessage.content || '',
          tool_calls: assistantMessage.tool_calls || [],
        });
      } else {
        state.completed = true;
        state.final_output = 'No assistant response produced after executing tools.';
      }
    } catch (error) {
      state.completed = true;
      const message = (error as Error)?.message ?? String(error);
      state.final_output = `Unable to continue news analysis after tool execution: ${message}`;
    }

    return state;
  }

  private async executeStep(state: NewsAgentState, payload: TradingAgentsPayload): Promise<NewsAgentState> {
    state.step_count += 1;

    if (state.step_count >= env.maxRecursionLimit) {
      state.completed = true;
      state.final_output = state.final_output ?? 'Maximum step count reached before completing news analysis.';
      return state;
    }

    if (state.tool_calls_made >= env.maxToolSteps) {
      state.completed = true;
      state.final_output = state.final_output
        ?? 'Tool usage limit reached before completing news analysis.';
      return state;
    }

    const lastMessage = state.messages[state.messages.length - 1] as ChatCompletionMessageParam & {
      tool_calls?: ChatCompletionMessageToolCall[];
    };

    if (lastMessage?.role === 'assistant' && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
      if (state.tool_calls_made >= env.maxToolSteps) {
        state.completed = true;
        state.final_output = state.final_output
          ?? 'Tool usage limit reached before completing news analysis.';
        return state;
      }

      return this.executeToolCalls(state, payload);
    }

    const content = typeof lastMessage?.content === 'string' ? lastMessage.content.trim() : '';
    state.completed = true;
    state.final_output = content || state.final_output || 'No news analysis was generated.';

    return state;
  }

  async executeWithState(
    systemPrompt: string,
    userPrompt: string,
    context: AgentsContext,
    symbol: string,
    tradeDate: string,
    payload: TradingAgentsPayload,
  ): Promise<string> {
    console.log(`[StateNewsAgent] Starting execution for ${symbol}`);

    let state = this.createInitialState(systemPrompt, userPrompt, context, symbol, tradeDate);
    this.toolHandlers = this.createToolHandlers(context, symbol, tradeDate);

    try {
      const response = await this.callModel(state.messages, true, INITIAL_AI_TIMEOUT_MS);
      const assistantMessage = response.choices[0]?.message;

      if (assistantMessage) {
        state.messages.push({
          role: 'assistant',
          content: assistantMessage.content || '',
          tool_calls: assistantMessage.tool_calls || [],
        });
      } else {
        return 'News analysis unavailable: the assistant produced no response.';
      }
    } catch (error) {
      const message = (error as Error)?.message ?? String(error);
      return `News analysis unavailable: failed to initiate assistant call (${message}).`;
    }

    const startTime = Date.now();

    while (!state.completed && state.step_count < env.maxRecursionLimit) {
      const elapsed = Date.now() - startTime;
      if (elapsed > EXECUTION_TIME_LIMIT_MS) {
        state.completed = true;
        state.final_output = state.final_output
          ?? 'News analysis halted due to runtime limits after retrieving available data.';
        break;
      }

      state = await this.executeStep(state, payload);
    }

    const finalMessage = state.final_output ?? FALLBACK_NO_DATA;
    const resolved = finalMessage.trim() || 'News analysis not generated. Please review tool outputs manually.';

    state.final_output = resolved;

    try {
      await logNewsConversation(payload, state.messages, state.step_count, state.tool_calls_made);
    } catch (error) {
      console.error('[StateNewsAgent] Failed to log news conversation:', error);
    }

    console.log(`[StateNewsAgent] Execution completed for ${symbol}. Tool calls: ${state.tool_calls_made}, steps: ${state.step_count}`);
    return resolved;
  }
}

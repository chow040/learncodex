import { env } from '../config/env.js';
import { TradingOrchestrator } from '../taEngine/graph/orchestrator.js';
import { DEFAULT_TRADING_ANALYSTS, type TradingAnalystId } from '../constants/tradingAgents.js';
import type { TradingAgentsDecision, TradingAgentsPayload, AgentsContext } from '../taEngine/types.js';
import {
  type QuoteResponse,
  type StockMetrics,
  type CompanyProfile,
  type CompanyNewsArticle,
  type InsiderTransactionItem,
  getQuote,
  getStockMetricsCached,
  getCompanyProfileCached,
  getCompanyNewsCached,
  getInsiderTransactions,
} from './finnhubService.js';
import { getRedditInsights, type RedditInsightsResponse } from './redditService.js';
import { getGoogleNews } from './googleNewsService.js';
import { getAlphaDailyCandles } from './alphaVantageService.js';
import { buildIndicatorsSummary } from './indicatorsService.js';
import { fetchAssessmentCache, upsertAssessmentCache } from '../db/cacheRepository.js';
import { fingerprint } from './cache/index.js';
import { recordAssessmentCacheEvent } from './cache/telemetry.js';

const formatNumber = (value: number | null | undefined, fractionDigits = 2): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return Number(value).toFixed(fractionDigits);
};
const formatPercent = (value: number | null | undefined, fractionDigits = 1): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return `${Number(value).toFixed(fractionDigits)}%`;
};
const formatCurrency = (value: number | null | undefined, currency = 'USD'): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch { return value.toFixed(2); }
};

const ASSESSMENT_CACHE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days by default

const buildMarketSummary = (
  quote: QuoteResponse,
  metrics: StockMetrics,
  profile: CompanyProfile,
): { priceHistory: string; technical: string } => {
  const currency = profile.currency || 'USD';
  const change = quote.current - quote.previousClose;
  const changePct = quote.previousClose ? ((change / quote.previousClose) * 100).toFixed(2) : '0.00';
  const summaryLines = [
    `Price snapshot for ${profile.name || profile.symbol} (${profile.symbol})`,
    `Current: ${formatCurrency(quote.current, currency)} (High ${formatCurrency(quote.high, currency)} / Low ${formatCurrency(quote.low, currency)})`,
    `Previous close: ${formatCurrency(quote.previousClose, currency)} | Intraday change: ${formatCurrency(change, currency)} (${changePct}%)`,
    `Market cap: ${formatCurrency(profile.marketCapitalization, currency)} | Shares outstanding: ${formatNumber(profile.shareOutstanding)}`,
    `Valuation metrics -> P/E: ${formatNumber(metrics.pe)} | EPS: ${formatNumber(metrics.eps)} | Dividend yield: ${formatPercent(metrics.dividendYield, 2)}`,
    `Efficiency metrics -> Revenue growth: ${formatPercent(metrics.revenueGrowth, 2)} | Operating margin: ${formatPercent(metrics.operatingMargin, 2)}`,
    `Balance sheet metrics -> Debt/Equity: ${formatNumber(metrics.debtToEquity)} | Price/FCF: ${formatNumber(metrics.priceToFreeCashFlow)}`,
  ];
  const technicalLines = [
    'Technical overview (derived from latest quote data):',
    `Price opened at ${formatCurrency(quote.open, currency)} and last traded at ${formatCurrency(quote.current, currency)}.`,
    quote.current > quote.previousClose
      ? 'Price trades above previous close, indicating near-term positive momentum.'
      : 'Price trades below previous close, indicating near-term consolidation.',
    'Detailed moving-average and indicator signals were not supplied; supplement with in-house charting if required.',
  ];
  return { priceHistory: summaryLines.join('\n'), technical: technicalLines.join('\n') };
};

const buildSocialSummary = (reddit: RedditInsightsResponse | null | undefined): { stockNews: string; redditSummary: string } => {
  if (!reddit) {
    const placeholder = 'No Reddit or social data available for this symbol in the requested window.';
    return { stockNews: placeholder, redditSummary: placeholder };
  }
  const topSubreddits = reddit.topSubreddits.map((item) => `r/${item.name}: ${item.mentions} mentions`).join('\n');
  const topPosts = reddit.posts.slice(0, 5).map((post) => `• ${post.title} — Score ${post.score.toLocaleString('en-US')} | Comments ${post.comments.toLocaleString('en-US')}\n  ${post.url}`).join('\n');
  const stockNews = [
    `Social buzz for ${reddit.ticker} (search: ${reddit.query})`,
    `Total posts (7d): ${reddit.totalPosts.toLocaleString('en-US')} | Upvotes: ${reddit.totalUpvotes.toLocaleString('en-US')} | Avg comments: ${reddit.averageComments}`,
    'Most active subreddits:',
    topSubreddits || 'No subreddit activity observed.',
  ].join('\n');
  const redditSummary = [stockNews, '', 'Top linked posts:', topPosts || 'No trending Reddit posts were captured for this symbol.'].join('\n');
  return { stockNews, redditSummary };
};

const buildNewsSummary = (articles: CompanyNewsArticle[]): { company: string; reddit: string; global: string } => {
  if (!articles.length) {
    const placeholder = 'No recent company news retrieved in the past week.';
    return { company: placeholder, reddit: placeholder, global: 'Global macro summary unavailable.' };
  }
  const topArticles = articles.slice(0, 6).map((article) => {
    const timestamp = new Date(article.datetime * 1000).toISOString().slice(0, 10);
    const headline = article.headline || 'Untitled';
    const summary = article.summary ? ` — ${article.summary}` : '';
    return `• ${headline} (${timestamp}, ${article.source})${summary}\n  ${article.url || ''}`;
  }).join('\n');
  return {
    company: `Company news highlights (last 7 days):\n${topArticles}`,
    reddit: 'Reddit news feed delegated to dedicated social summary provided separately.',
    global: 'Global macro feed not supplied; use internal macro dashboard as needed.',
  };
};

export interface TradingAgentsDecisionOptions {
  runId?: string;
  modelId?: string;
  analysts?: TradingAnalystId[];
}

export const requestTradingAgentsDecisionInternal = async (
  symbol: string,
  options?: TradingAgentsDecisionOptions,
): Promise<TradingAgentsDecision> => {
  const orchestrator = new TradingOrchestrator();
  const modelId = options?.modelId ?? env.openAiModel;
  const analysts = options?.analysts && options.analysts.length > 0
    ? options.analysts
    : [...DEFAULT_TRADING_ANALYSTS];

  // Defaults
      // No pre-fetching - let agents fetch financial data via tool calls
      // This ensures consistent behavior with Python version and proper tool call testing
  const defaultQuote: QuoteResponse = { symbol, current: 0, high: 0, low: 0, open: 0, previousClose: 0, timestamp: 0 };
  const defaultProfile: CompanyProfile = { symbol, name: symbol, exchange: '', currency: 'USD', ipo: '', marketCapitalization: 0, shareOutstanding: 0, logo: '', weburl: '' };
  const defaultMetrics: StockMetrics = { symbol, pe: null, eps: null, revenueGrowth: null, operatingMargin: null, dividendYield: null, priceToFreeCashFlow: null, debtToEquity: null, earningsRevision: null };

  let quote: QuoteResponse = defaultQuote;
  let metrics: StockMetrics = defaultMetrics;
  let profile: CompanyProfile = defaultProfile;
  let redditInsights: RedditInsightsResponse | null | undefined = undefined;
  let companyNews: CompanyNewsArticle[] = [];
  let insiderSummary: string | undefined = undefined;

  const fingerprintComponents: Record<string, string> = {};
  let profileFingerprint = fingerprint(defaultProfile, 'profile_default_v1');
  let metricsFingerprint = fingerprint(defaultMetrics, 'metrics_default_v1');
  let newsFingerprint = fingerprint(companyNews, 'company_news_empty_v1');
  let insiderFingerprint: string | undefined;

  try {
    if (env.finnhubApiKey) {
      const [q, metricsResult, profileResult] = await Promise.all([
        getQuote(symbol).catch(() => defaultQuote),
        getStockMetricsCached(symbol).catch(() => null),
        getCompanyProfileCached(symbol).catch(() => null),
      ]);
      quote = q;
      if (metricsResult) {
        metrics = metricsResult.data;
        metricsFingerprint = metricsResult.meta.fingerprint;
      } else {
        metricsFingerprint = fingerprint(metrics, 'metrics_fallback_v1');
      }
      if (profileResult) {
        profile = profileResult.data;
        profileFingerprint = profileResult.meta.fingerprint;
      } else {
        profileFingerprint = fingerprint(profile, 'profile_fallback_v1');
      }

      const toDate = new Date();
      const fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - 7);
      const newsResult = await getCompanyNewsCached(symbol, fromDate, toDate).catch(() => null);
      if (newsResult) {
        companyNews = newsResult.data;
        newsFingerprint = newsResult.meta.fingerprint;
      } else {
        newsFingerprint = fingerprint(companyNews, 'company_news_fallback_v1');
      }

      // Insider transactions (last ~90 days)
      try {
        const insFrom = new Date(toDate);
        insFrom.setDate(insFrom.getDate() - 90);
        const tx = await getInsiderTransactions(symbol, insFrom, toDate).catch(() => []);
        if (tx.length) {
          const lines = tx
            .slice(0, 12)
            .map((t: InsiderTransactionItem) => `• ${t.transactionDate} ${t.name} (${t.transactionCode}) @ ${t.transactionPrice ?? 'N/A'} | Change ${t.change ?? 'N/A'} | Shares ${t.share ?? 'N/A'}`);
          insiderSummary = ['Recent insider transactions (90d):', ...lines].join('\n');
          insiderFingerprint = fingerprint(tx, 'insider_tx_v1');
        }
      } catch {}
      // Also attempt to fetch Google News for global/company context (basic scraping)
      try {
        const start = fromDate.toISOString().slice(0, 10);
        const end = toDate.toISOString().slice(0, 10);
        const g = await getGoogleNews(symbol, start, end).catch(() => []);
        const gFormatted = g.slice(0, 20).map((it) => `### ${it.title} (source: ${it.source})\n\n${it.snippet}`).join('\n\n');
        if (gFormatted) {
          companyNews.push(...[]);
        }
        (globalThis as any)._la_gnews = gFormatted;
      } catch (e) {
        // ignore google news failures
      }
    }
  } catch {}

  try { redditInsights = await getRedditInsights(symbol).catch(() => undefined); } catch {}

  const market = buildMarketSummary(quote, metrics, profile);
  // Compute technical indicators from Alpha Vantage daily candles (last ~365 days) and append to technical report
  try {
    const end = new Date();
    const start = new Date(end); start.setDate(start.getDate() - 365);
    const candles = await getAlphaDailyCandles(symbol, start, end);
    if (candles && candles.close.length > 250) {
      const indicatorsText = buildIndicatorsSummary({
        close: candles.close,
        high: candles.high,
        low: candles.low,
        open: candles.open,
        volume: candles.volume,
      });
      // Append beneath the existing textual summary
      market.technical = `${market.technical}\n\nCalculated indicators (daily):\n${indicatorsText}`;
    }
  } catch {}
  const social = buildSocialSummary(redditInsights);
  const news = buildNewsSummary(companyNews);

  // if google news formatted content exists, prefer appending it to global
  const gnews = (globalThis as any)._la_gnews as string | undefined;
  const news_global_final = gnews && gnews.length ? `${gnews}\n\n${news.global}` : news.global;

  const decisionDate = new Date().toISOString().slice(0, 10);

  const contextBase: AgentsContext = {
    market_price_history: market.priceHistory,
    market_technical_report: market.technical,
    social_stock_news: social.stockNews,
    social_reddit_summary: social.redditSummary,
    news_company: news.company,
    news_reddit: news.reddit,
    news_global: news_global_final,
    fundamentals_summary: `See metrics: P/E ${formatNumber(metrics.pe)}, EPS ${formatNumber(metrics.eps)}, Rev Growth ${formatPercent(metrics.revenueGrowth, 2)}, Op Margin ${formatPercent(metrics.operatingMargin, 2)}`,
    fundamentals_balance_sheet: 'Detailed statement data not ingested via TradingAgents bridge.',
    fundamentals_cashflow: 'Detailed statement data not ingested via TradingAgents bridge.',
    fundamentals_income_stmt: 'Detailed statement data not ingested via TradingAgents bridge.',
  };
  if (insiderSummary) {
    contextBase.fundamentals_insider_transactions = insiderSummary;
  }

  const quoteFingerprint = fingerprint(quote, 'quote_snapshot_v1');
  const redditFingerprint = fingerprint(redditInsights ?? null, 'reddit_insights_v1');
  const marketFingerprint = fingerprint(market, 'market_summary_v1');
  const socialFingerprint = fingerprint(social, 'social_summary_v1');
  const newsSummaryFingerprint = fingerprint(news, 'news_summary_v1');
  const contextFingerprint = fingerprint(contextBase, 'context_v1');

  fingerprintComponents.profile = profileFingerprint;
  fingerprintComponents.metrics = metricsFingerprint;
  fingerprintComponents.companyNews = newsFingerprint;
  fingerprintComponents.quote = quoteFingerprint;
  fingerprintComponents.market = marketFingerprint;
  fingerprintComponents.social = socialFingerprint;
  fingerprintComponents.newsText = newsSummaryFingerprint;
  fingerprintComponents.context = contextFingerprint;
  fingerprintComponents.reddit = redditFingerprint;
  if (insiderFingerprint) {
    fingerprintComponents.insider = insiderFingerprint;
  } else if (insiderSummary) {
    fingerprintComponents.insider = fingerprint(insiderSummary, 'insider_summary_text_v1');
  }

  const sortedAnalysts = [...analysts].sort();
  const assessmentInputFingerprint = fingerprint(
    {
      symbol,
      modelId,
      analysts: sortedAnalysts,
      components: fingerprintComponents,
    },
    'assessment_input_v1',
  );
  const agentVersion = env.tradingAgentVersion;
  const assessmentCacheKey = `assessment:${agentVersion}:${symbol}:${assessmentInputFingerprint}`;
  const cacheCheckTime = new Date();
  const cachedAssessment = await fetchAssessmentCache<TradingAgentsDecision>(assessmentCacheKey);
  if (cachedAssessment && cachedAssessment.expiresAt > cacheCheckTime) {
    recordAssessmentCacheEvent('hit', {
      key: assessmentCacheKey,
      symbol,
      source: 'assessment_cache',
      meta: { agentVersion, fingerprint: assessmentInputFingerprint },
    });
    return { ...cachedAssessment.result };
  }
  recordAssessmentCacheEvent('miss', {
    key: assessmentCacheKey,
    symbol,
    source: 'assessment_cache',
    meta: {
      agentVersion,
      fingerprint: assessmentInputFingerprint,
      hadCache: Boolean(cachedAssessment),
    },
  });

  const payload: TradingAgentsPayload = {
    symbol,
    tradeDate: decisionDate,
    context: contextBase,
    modelId,
    analysts,
    cacheFingerprint: assessmentInputFingerprint,
    cacheFingerprintComponents: fingerprintComponents,
  };

  const orchestratorOptions = {
    modelId,
    analysts,
    ...(options?.runId ? { runId: options.runId } : {}),
  } satisfies { runId?: string; modelId: string; analysts: TradingAnalystId[] };

  const decision = (await orchestrator.run(payload, orchestratorOptions)) as TradingAgentsDecision;

  try {
    const expiresAt = new Date(Date.now() + ASSESSMENT_CACHE_TTL_SECONDS * 1000);
    await upsertAssessmentCache({
      key: assessmentCacheKey,
      inputFingerprint: assessmentInputFingerprint,
      result: decision,
      expiresAt,
      agentVersion,
    });
    recordAssessmentCacheEvent('store', {
      key: assessmentCacheKey,
      symbol,
      source: 'assessment_cache',
      meta: { agentVersion, expiresAt: expiresAt.toISOString() },
    });
  } catch (error) {
    recordAssessmentCacheEvent('error', {
      key: assessmentCacheKey,
      symbol,
      source: 'assessment_cache',
      meta: { agentVersion, error: (error as Error).message },
    });
    console.warn(
      `[tradingAgentsEngineService] Failed to cache assessment for ${symbol}: ${
        (error as Error).message
      }`,
    );
  }

  return decision;
};






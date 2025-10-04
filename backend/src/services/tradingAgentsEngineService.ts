import { env } from '../config/env.js';
import { TradingOrchestrator } from '../taEngine/graph/orchestrator.js';
import type { TradingAgentsDecision, TradingAgentsPayload, AgentsContext } from '../taEngine/types.js';
import {
  type QuoteResponse,
  type StockMetrics,
  type CompanyProfile,
  type CompanyNewsArticle,
  type InsiderTransactionItem,
  getQuote,
  getStockMetrics,
  getCompanyProfile,
  getCompanyNews,
  getFinancialsReported,
  getInsiderTransactions,
} from './finnhubService.js';
import { getRedditInsights, type RedditInsightsResponse } from './redditService.js';
import { getGoogleNews } from './googleNewsService.js';
import { getAlphaDailyCandles } from './alphaVantageService.js';
import { buildIndicatorsSummary } from './indicatorsService.js';

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
    `Market cap: ${formatCurrency(profile.marketCapitalization * 1_000_000, currency)} | Shares outstanding: ${formatNumber(profile.shareOutstanding)}`,
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

export const requestTradingAgentsDecisionInternal = async (symbol: string): Promise<TradingAgentsDecision> => {
  const orchestrator = new TradingOrchestrator();

  // Defaults
      // Fetch reported financials (Finnhub "Financials As Reported") and extract last 3 annual filings
      try {
        const finReports = await getFinancialsReported(symbol).catch(() => []);
        if (Array.isArray(finReports) && finReports.length > 0) {
          // The structure varies; attempt to locate filings with 'report' or 'filing' data
          // We'll attempt to pick the most recent annual reports by year
          const annual = finReports
            .filter((r: any) => r?.report && r.report.length)
            .sort((a: any, b: any) => (b?.report?.[0]?.filingDate || '').localeCompare(a?.report?.[0]?.filingDate));
          const chosen = annual.slice(0, 3);
          // format simple excerpts
          const bsArr: string[] = [];
          const cfArr: string[] = [];
          const isArr: string[] = [];
          chosen.forEach((rep: any) => {
            const year = rep.report?.[0]?.filingDate ? rep.report[0].filingDate.slice(0, 4) : 'n/a';
            const balance = JSON.stringify(rep.report[0].balanceSheet || rep.report[0].balanceSheetTotal || rep, null, 2).slice(0, 2000);
            const cash = JSON.stringify(rep.report[0].cashflow || rep.report[0].cashFlow || rep, null, 2).slice(0, 2000);
            const inc = JSON.stringify(rep.report[0].incomeStatement || rep.report[0].income || rep, null, 2).slice(0, 2000);
            bsArr.push(`### ${year} Balance (excerpt)\n${balance}`);
            cfArr.push(`### ${year} Cashflow (excerpt)\n${cash}`);
            isArr.push(`### ${year} Income Statement (excerpt)\n${inc}`);
          });

          // temporary attach to context variables below
          (globalThis as any)._la_fin_bs = bsArr.join('\n\n');
          (globalThis as any)._la_fin_cf = cfArr.join('\n\n');
          (globalThis as any)._la_fin_is = isArr.join('\n\n');
        }
      } catch (e) {
        // ignore financials failure
      }
  const defaultQuote: QuoteResponse = { symbol, current: 0, high: 0, low: 0, open: 0, previousClose: 0, timestamp: 0 };
  const defaultProfile: CompanyProfile = { symbol, name: symbol, exchange: '', currency: 'USD', ipo: '', marketCapitalization: 0, shareOutstanding: 0, logo: '', weburl: '' };
  const defaultMetrics: StockMetrics = { symbol, pe: null, eps: null, revenueGrowth: null, operatingMargin: null, dividendYield: null, priceToFreeCashFlow: null, debtToEquity: null, earningsRevision: null };

  let quote: QuoteResponse = defaultQuote;
  let metrics: StockMetrics = defaultMetrics;
  let profile: CompanyProfile = defaultProfile;
  let redditInsights: RedditInsightsResponse | null | undefined = undefined;
  let companyNews: CompanyNewsArticle[] = [];
  let insiderSummary: string | undefined = undefined;

  try {
    if (env.finnhubApiKey) {
      const [q, m, p] = await Promise.all([
        getQuote(symbol).catch(() => defaultQuote),
        getStockMetrics(symbol).catch(() => defaultMetrics),
        getCompanyProfile(symbol).catch(() => defaultProfile),
      ]);
      quote = q; metrics = m; profile = p;
      const toDate = new Date();
      const fromDate = new Date(toDate); fromDate.setDate(fromDate.getDate() - 7);
      companyNews = await getCompanyNews(symbol, fromDate, toDate).catch(() => []);
      // Insider transactions (last ~90 days)
      try {
        const insFrom = new Date(toDate); insFrom.setDate(insFrom.getDate() - 90);
        const tx = await getInsiderTransactions(symbol, insFrom, toDate).catch(() => []);
        if (tx.length) {
          const lines = tx
            .slice(0, 12)
            .map((t: InsiderTransactionItem) => `• ${t.transactionDate} ${t.name} (${t.transactionCode}) @ ${t.transactionPrice ?? 'N/A'} | Change ${t.change ?? 'N/A'} | Shares ${t.share ?? 'N/A'}`);
          insiderSummary = ['Recent insider transactions (90d):', ...lines].join('\n');
        }
      } catch {}
      // Also attempt to fetch Google News for global/company context (basic scraping)
      try {
  const start = fromDate.toISOString().slice(0, 10);
  const end = toDate.toISOString().slice(0, 10);
  const g = await getGoogleNews(symbol, start, end).catch(() => []);
        // format into a single string similar to Python get_google_news
        const gFormatted = g.slice(0, 20).map((it) => `### ${it.title} (source: ${it.source})\n\n${it.snippet}`).join('\n\n');
        // if found, add as global news placeholder appended to existing news
        if (gFormatted) {
          companyNews.push(...[]); // keep companyNews as-is for company-specific articles
        }
        // attach the formatted global feed to a local variable used below
        // We'll set news_global based on this gFormatted later
        // store in a temporary variable on this scope
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
    fundamentals_balance_sheet: (globalThis as any)._la_fin_bs ?? 'Not provided by internal engine at this time.',
    fundamentals_cashflow: (globalThis as any)._la_fin_cf ?? 'Not provided by internal engine at this time.',
    fundamentals_income_stmt: (globalThis as any)._la_fin_is ?? 'Not provided by internal engine at this time.',
  };
  if (insiderSummary) {
    contextBase.fundamentals_insider_transactions = insiderSummary;
  }

  const payload: TradingAgentsPayload = {
    symbol,
    tradeDate: decisionDate,
    context: contextBase,
  };

  return orchestrator.run(payload);
};

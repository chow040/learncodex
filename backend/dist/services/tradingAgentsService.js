import axios from 'axios';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { getQuote, getStockMetrics, getCompanyProfile, getCompanyNews, } from './finnhubService.js';
import { getRedditInsights } from './redditService.js';
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const TA_SERVER_URL = process.env.TA_SERVER_URL ?? 'http://127.0.0.1:8000';
const formatNumber = (value, fractionDigits = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return 'N/A';
    }
    return Number(value).toFixed(fractionDigits);
};
const formatPercent = (value, fractionDigits = 1) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return 'N/A';
    }
    return `${Number(value).toFixed(fractionDigits)}%`;
};
const formatCurrency = (value, currency = 'USD') => {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return 'N/A';
    }
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            maximumFractionDigits: 2,
        }).format(value);
    }
    catch (_error) {
        return value.toFixed(2);
    }
};
const buildMarketSummary = (quote, metrics, profile) => {
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
    return {
        priceHistory: summaryLines.join('\n'),
        technical: technicalLines.join('\n'),
    };
};
const buildSocialSummary = (reddit) => {
    if (!reddit) {
        const placeholder = 'No Reddit or social data available for this symbol in the requested window.';
        return {
            stockNews: placeholder,
            redditSummary: placeholder,
        };
    }
    const topSubreddits = reddit.topSubreddits
        .map((item) => `r/${item.name}: ${item.mentions} mentions`)
        .join('\n');
    const topPosts = reddit.posts
        .slice(0, 5)
        .map((post) => `� [${post.title}](${post.url}) � Score ${post.score.toLocaleString('en-US')} | Comments ${post.comments.toLocaleString('en-US')}`)
        .join('\n');
    const stockNews = [
        `Social buzz for ${reddit.ticker} (search: ${reddit.query})`,
        `Total posts (7d): ${reddit.totalPosts.toLocaleString('en-US')} | Upvotes: ${reddit.totalUpvotes.toLocaleString('en-US')} | Avg comments: ${reddit.averageComments}`,
        'Most active subreddits:',
        topSubreddits || 'No subreddit activity observed.',
    ].join('\n');
    const redditSummary = [
        stockNews,
        '',
        'Top linked posts:',
        topPosts || 'No trending Reddit posts were captured for this symbol.',
    ].join('\n');
    return {
        stockNews,
        redditSummary,
    };
};
const buildNewsSummary = (articles) => {
    if (!articles.length) {
        const placeholder = 'No recent company news retrieved in the past week.';
        return { company: placeholder, reddit: placeholder, global: 'Global macro summary unavailable.' };
    }
    const topArticles = articles
        .slice(0, 6)
        .map((article) => {
        const timestamp = new Date(article.datetime * 1000).toISOString().slice(0, 10);
        const headline = article.headline || 'Untitled';
        const summary = article.summary ? ` � ${article.summary}` : '';
        return `� [${headline}](${article.url || '#'}) (${timestamp}, ${article.source})${summary}`;
    })
        .join('\n');
    return {
        company: `Company news highlights (last 7 days):\n${topArticles}`,
        reddit: 'Reddit news feed delegated to dedicated social summary provided separately.',
        global: 'Global macro feed not supplied via TradingAgents integration; use internal macro dashboard as needed.',
    };
};
const buildFundamentalsSummary = (profile, metrics) => {
    const lines = [
        `Fundamentals overview for ${profile.name || profile.symbol} (${profile.symbol})`,
        `Exchange: ${profile.exchange} | Currency: ${profile.currency || 'USD'} | IPO: ${profile.ipo || 'n/a'}`,
        `Market cap: ${formatCurrency(profile.marketCapitalization * 1_000_000, profile.currency || 'USD')} | Shares outstanding: ${formatNumber(profile.shareOutstanding)}`,
        `P/E: ${formatNumber(metrics.pe)} | EPS: ${formatNumber(metrics.eps)} | Revenue growth (YoY): ${formatPercent(metrics.revenueGrowth, 2)}`,
        `Operating margin: ${formatPercent(metrics.operatingMargin, 2)} | Dividend yield: ${formatPercent(metrics.dividendYield, 2)}`,
        `Debt/Equity: ${formatNumber(metrics.debtToEquity)} | Price/FCF: ${formatNumber(metrics.priceToFreeCashFlow)}`,
    ];
    const detailPlaceholder = 'Detailed statement data not ingested via TradingAgents bridge; refer to internal fundamentals service.';
    return {
        summary: lines.join('\n'),
        balance: detailPlaceholder,
        cashflow: detailPlaceholder,
        income: detailPlaceholder,
    };
};
const buildPayload = async (symbol) => {
    // Defaults so we can proceed even if external APIs are unavailable
    const defaultQuote = {
        symbol,
        current: 0,
        high: 0,
        low: 0,
        open: 0,
        previousClose: 0,
        timestamp: 0,
    };
    const defaultProfile = {
        symbol,
        name: symbol,
        exchange: '',
        currency: 'USD',
        ipo: '',
        marketCapitalization: 0,
        shareOutstanding: 0,
        logo: '',
        weburl: '',
    };
    const defaultMetrics = {
        symbol,
        pe: null,
        eps: null,
        revenueGrowth: null,
        operatingMargin: null,
        dividendYield: null,
        priceToFreeCashFlow: null,
        debtToEquity: null,
        earningsRevision: null,
    };
    // Try to fetch data, but tolerate missing FINNHUB/Reddit environment or network failures
    let quote = defaultQuote;
    let metrics = defaultMetrics;
    let profile = defaultProfile;
    let redditInsights = undefined;
    let companyNews = [];
    // Finance + Reddit calls: only attempt if keys are present; each wrapped in try/catch
    try {
        if (env.finnhubApiKey) {
            const [q, m, p] = await Promise.all([
                getQuote(symbol).catch(() => defaultQuote),
                getStockMetrics(symbol).catch(() => defaultMetrics),
                getCompanyProfile(symbol).catch(() => defaultProfile),
            ]);
            quote = q;
            metrics = m;
            profile = p;
            // company news (separate timing window)
            const toDate = new Date();
            const fromDate = new Date(toDate);
            fromDate.setDate(fromDate.getDate() - 7);
            companyNews = await getCompanyNews(symbol, fromDate, toDate).catch(() => []);
        }
    }
    catch {
        // Hard fallback to defaults already set above
    }
    try {
        redditInsights = await getRedditInsights(symbol).catch(() => undefined);
    }
    catch {
        redditInsights = undefined;
    }
    const market = buildMarketSummary(quote, metrics, profile);
    const social = buildSocialSummary(redditInsights);
    const news = buildNewsSummary(companyNews);
    const fundamentals = buildFundamentalsSummary(profile, metrics);
    const toDate = new Date();
    const decisionDate = toDate.toISOString().slice(0, 10);
    const context = {
        market_price_history: market.priceHistory,
        market_technical_report: market.technical,
        social_stock_news: social.stockNews,
        social_reddit_summary: social.redditSummary,
        news_company: news.company,
        news_reddit: news.reddit,
        news_global: news.global,
        fundamentals_summary: fundamentals.summary,
        fundamentals_balance_sheet: fundamentals.balance,
        fundamentals_cashflow: fundamentals.cashflow,
        fundamentals_income_stmt: fundamentals.income,
    };
    return {
        payload: {
            symbol,
            tradeDate: decisionDate,
            context,
        },
        decisionDate,
    };
};
const invokeTradingAgentsRunner = async (payload) => {
    const url = `${TA_SERVER_URL}/propagate`;
    const timeoutMs = env.tradingAgentsTimeoutMs;
    console.log(`[TA] POST ${url} with timeout ${timeoutMs}ms`);
    try {
        const resp = await axios.post(url, payload, {
            timeout: timeoutMs,
            headers: { 'Content-Type': 'application/json' },
        });
        return resp.data;
    }
    catch (err) {
        // normalize error messages
        if (axios.isAxiosError(err)) {
            const msg = err.response?.data ?? err.message;
            throw new Error(`TradingAgents HTTP runner error: ${JSON.stringify(msg)}`);
        }
        throw err;
    }
};
export const requestTradingAgentsDecision = async (symbol) => {
    const { payload, decisionDate } = await buildPayload(symbol);
    const decision = await invokeTradingAgentsRunner(payload);
    return {
        ...decision,
        tradeDate: decision.tradeDate ?? decisionDate,
        symbol: decision.symbol ?? symbol,
    };
};
//# sourceMappingURL=tradingAgentsService.js.map
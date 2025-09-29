import axios from 'axios';

import { env } from '../config/env.js';

const ensureApiKey = () => {
  if (!env.finnhubApiKey) {
    throw new Error('FINNHUB_API_KEY is not configured.');
  }
};

const formatDateParam = (date: Date): string => date.toISOString().slice(0, 10);

const http = axios.create({
  baseURL: env.finnhubBaseUrl,
  timeout: 15_000,
});

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export interface QuoteResponse {
  symbol: string;
  current: number; // Current price
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
}

export interface CompanyProfile {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  ipo: string;
  marketCapitalization: number;
  shareOutstanding: number;
  logo: string;
  weburl: string;
}

export interface StockMetrics {
  symbol: string;
  pe: number | null;
  eps: number | null;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  dividendYield: number | null;
  priceToFreeCashFlow: number | null;
  debtToEquity: number | null;
  earningsRevision: number | null;
}
export interface CompanyNewsArticle {
  datetime: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
}

export const getQuote = async (symbol: string): Promise<QuoteResponse> => {
  ensureApiKey();

  const { data } = await http.get('/quote', {
    params: {
      symbol,
      token: env.finnhubApiKey,
    },
  });

  return {
    symbol,
    current: data.c ?? 0,
    high: data.h ?? 0,
    low: data.l ?? 0,
    open: data.o ?? 0,
    previousClose: data.pc ?? 0,
    timestamp: data.t ?? 0,
  } satisfies QuoteResponse;
};

export const getCompanyProfile = async (symbol: string): Promise<CompanyProfile> => {
  ensureApiKey();

  const { data } = await http.get('/stock/profile2', {
    params: {
      symbol,
      token: env.finnhubApiKey,
    },
  });

  return {
    symbol: data.ticker ?? symbol,
    name: data.name ?? '',
    exchange: data.exchange ?? '',
    currency: data.currency ?? '',
    ipo: data.ipo ?? '',
    marketCapitalization: Number(data.marketCapitalization ?? 0),
    shareOutstanding: Number(data.shareOutstanding ?? 0),
    logo: data.logo ?? '',
    weburl: data.weburl ?? '',
  } satisfies CompanyProfile;
};

export const getStockMetrics = async (symbol: string): Promise<StockMetrics> => {
  ensureApiKey();

  const { data } = await http.get('/stock/metric', {
    params: {
      symbol,
      metric: 'all',
      token: env.finnhubApiKey,
    },
  });

  const metrics = (data?.metric ?? {}) as Record<string, unknown>;

  return {
    symbol,
    pe: toNumberOrNull(metrics.peNormalizedAnnual ?? metrics.peTTM ?? metrics.peAnnual),
    eps: toNumberOrNull(metrics.epsNormalizedAnnual ?? metrics.epsTTM ?? metrics.epsAnnual),
    revenueGrowth: toNumberOrNull(metrics.revenueGrowthTTMYoy ?? metrics.revenueGrowth3Y ?? metrics.revenueGrowth5Y),
    operatingMargin: toNumberOrNull(metrics.operatingMarginTTM ?? metrics.operatingMarginAnnual ?? metrics.operatingMargin5Y),
    dividendYield: toNumberOrNull(metrics.dividendYieldIndicatedAnnual ?? metrics.currentDividendYieldTTM ?? metrics.dividendYieldTTM),
    priceToFreeCashFlow: toNumberOrNull(metrics.pfcfShareTTM ?? metrics['currentEv/freeCashFlowTTM']),
    debtToEquity: toNumberOrNull(metrics['totalDebt/totalEquityQuarterly'] ?? metrics['totalDebt/totalEquityAnnual']),
    earningsRevision: toNumberOrNull(metrics.epsGrowthTTMYoy ?? metrics.epsGrowthQuarterlyYoy ?? metrics.epsGrowth5Y),
  } satisfies StockMetrics;
};



export const getCompanyNews = async (
  symbol: string,
  from: Date,
  to: Date,
): Promise<CompanyNewsArticle[]> => {
  ensureApiKey();

  const { data } = await http.get('/company-news', {
    params: {
      symbol,
      from: formatDateParam(from),
      to: formatDateParam(to),
      token: env.finnhubApiKey,
    },
  });

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => ({
      datetime:
        typeof item.datetime === 'number'
          ? item.datetime
          : Number.parseInt(item.datetime ?? '0', 10) || 0,
      headline: typeof item.headline === 'string' ? item.headline : '',
      summary: typeof item.summary === 'string' ? item.summary : '',
      source: typeof item.source === 'string' ? item.source : '',
      url: typeof item.url === 'string' ? item.url : '',
    }))
    .filter((article) => article.headline || article.summary || article.url);
};

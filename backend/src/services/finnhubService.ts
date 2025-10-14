import axios from 'axios';

import { env } from '../config/env.js';
import { toArray, withServiceError } from './utils/serviceHelpers.js';

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

export interface InsiderTransactionItem {
  symbol: string;
  name: string;
  transactionDate: string; // yyyy-mm-dd
  transactionPrice: number | null;
  change: number | null; // number of shares change
  share: number | null; // total shares after
  transactionCode: string;
}

export interface InsiderSentimentItem {
  symbol: string;
  year: number;
  month: number;
  change: number | null;
  mspr: number | null;
}

export interface CandleResponse {
  c: number[]; // close
  h: number[]; // high
  l: number[]; // low
  o: number[]; // open
  v: number[]; // volume
  t: number[]; // timestamps (unix seconds)
  s: 'ok' | 'no_data';
}

export interface Candles {
  close: number[];
  high: number[];
  low: number[];
  open: number[];
  volume: number[];
  time: number[]; // epoch seconds
}

export const getQuote = async (symbol: string): Promise<QuoteResponse> =>
  withServiceError('finnhub', 'getQuote', async () => {
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
  });

export const getInsiderTransactions = async (
  symbol: string,
  from: Date,
  to: Date,
): Promise<InsiderTransactionItem[]> =>
  withServiceError('finnhub', 'getInsiderTransactions', async () => {
    ensureApiKey();
    const fromStr = formatDateParam(from);
    const toStr = formatDateParam(to);
    const { data } = await http.get('/stock/insider-transactions', {
      params: { symbol, from: fromStr, to: toStr, token: env.finnhubApiKey },
    });
    return toArray<any>(data?.data).map((it) => ({
      symbol: String(it.symbol ?? symbol),
      name: String(it.name ?? ''),
      transactionDate: String(it.transactionDate ?? ''),
      transactionPrice: toNumberOrNull(it.transactionPrice),
      change: toNumberOrNull(it.change),
      share: toNumberOrNull(it.share),
      transactionCode: String(it.transactionCode ?? ''),
    }));
  });

export const getInsiderSentiment = async (
  symbol: string,
  from: Date,
  to: Date,
): Promise<InsiderSentimentItem[]> =>
  withServiceError('finnhub', 'getInsiderSentiment', async () => {
    ensureApiKey();
    const { data } = await http.get('/stock/insider-sentiment', {
      params: {
        symbol,
        from: formatDateParam(from),
        to: formatDateParam(to),
        token: env.finnhubApiKey,
      },
    });
    return toArray<any>(data?.data).map((entry) => ({
      symbol: String(entry.symbol ?? symbol),
      year: Number.parseInt(entry.year ?? '0', 10) || 0,
      month: Number.parseInt(entry.month ?? '0', 10) || 0,
      change: toNumberOrNull(entry.change),
      mspr: toNumberOrNull(entry.mspr),
    }));
  });

export const getCompanyProfile = async (symbol: string): Promise<CompanyProfile> =>
  withServiceError('finnhub', 'getCompanyProfile', async () => {
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
  });

export const getStockMetrics = async (symbol: string): Promise<StockMetrics> =>
  withServiceError('finnhub', 'getStockMetrics', async () => {
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
  });



export const getCompanyNews = async (
  symbol: string,
  from: Date,
  to: Date,
): Promise<CompanyNewsArticle[]> =>
  withServiceError('finnhub', 'getCompanyNews', async () => {
    ensureApiKey();

    const { data } = await http.get('/company-news', {
      params: {
        symbol,
        from: formatDateParam(from),
        to: formatDateParam(to),
        token: env.finnhubApiKey,
      },
    });

    return toArray<any>(data)
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
  });

export const getCandles = async (
  symbol: string,
  from: Date,
  to: Date,
  resolution: 'D' | 'W' | 'M' = 'D',
): Promise<Candles | null> =>
  withServiceError('finnhub', 'getCandles', async () => {
    ensureApiKey();

    const fromEpoch = Math.floor(from.getTime() / 1000);
    const toEpoch = Math.floor(to.getTime() / 1000);

    const { data } = await http.get('/stock/candle', {
      params: {
        symbol,
        resolution,
        from: fromEpoch,
        to: toEpoch,
        token: env.finnhubApiKey,
      },
    });

    const resp = data as CandleResponse;
    if (!resp || resp.s !== 'ok' || !Array.isArray(resp.c) || resp.c.length === 0) {
      return null;
    }
    return {
      close: resp.c,
      high: resp.h,
      low: resp.l,
      open: resp.o,
      volume: resp.v,
      time: resp.t,
    };
  });

export const getFinancialsReported = async (
  symbol: string,
  freq: string = 'quarterly',
): Promise<any[]> =>
  withServiceError('finnhub', 'getFinancialsReported', async () => {
    ensureApiKey();

    const { data } = await http.get('/stock/financials-reported', {
      params: {
        symbol,
        freq,
        token: env.finnhubApiKey,
      },
    });

    // Finnhub may return an object with a `data` array or an array directly
    return Array.isArray(data) ? data : toArray<any>(data?.data);
  });

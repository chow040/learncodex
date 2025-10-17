import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';

import { env } from '../config/env.js';
import {
  buildHttpCacheKey,
  fetchWithHttpCache,
  getCachePolicy,
  type CacheDataType,
  type CachedFetchMeta,
  type CachedAxiosRequestOptions,
} from './cache/index.js';
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

export interface CachedFundamentalsResult<T> {
  data: T;
  meta: CachedFetchMeta;
  raw: unknown;
}

interface FinnhubCachedFetchOptions<Payload, Result> {
  symbol: string;
  dataType: CacheDataType;
  schemaVersion: string;
  requestConfig: AxiosRequestConfig;
  transform: (payload: Payload) => Result;
  qualifier?: string;
  asOfExtractor?: (payload: Payload) => string | null | undefined;
  fingerprintSalt?: string;
  ttlOverrideSeconds?: number;
}

const fetchFinnhubCached = async <Payload = unknown, Result = Payload>(
  options: FinnhubCachedFetchOptions<Payload, Result>,
): Promise<CachedFundamentalsResult<Result>> => {
  const {
    symbol,
    dataType,
    schemaVersion,
    requestConfig,
    transform,
    qualifier,
    asOfExtractor,
    fingerprintSalt,
    ttlOverrideSeconds,
  } = options;

  const ttlSeconds = ttlOverrideSeconds ?? getCachePolicy(dataType).ttlSeconds;
  const keyParts = {
    vendor: 'finnhub',
    dataType,
    symbol: symbol.toUpperCase(),
  } satisfies Parameters<typeof buildHttpCacheKey>[0];
  const cacheKey = buildHttpCacheKey(
    qualifier ? { ...keyParts, qualifier } : keyParts,
  );
  const requestOptions: CachedAxiosRequestOptions<Payload> = {
    axios: http,
    requestConfig,
    cacheKey,
    schemaVersion,
    ttlSeconds,
    dataType,
  };
  if (asOfExtractor) {
    requestOptions.asOfExtractor = asOfExtractor;
  }
  if (fingerprintSalt) {
    requestOptions.fingerprintSalt = fingerprintSalt;
  }
  const { data, meta } = await fetchWithHttpCache<Payload>(requestOptions);
  return {
    data: transform(data),
    meta,
    raw: data as unknown,
  };
};
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

export const getCompanyProfileCached = async (
  symbol: string,
): Promise<CachedFundamentalsResult<CompanyProfile>> =>
  withServiceError('finnhub', 'getCompanyProfile', async () => {
    ensureApiKey();

    return fetchFinnhubCached<Record<string, any>, CompanyProfile>({
      symbol,
      dataType: 'profile',
      schemaVersion: 'finnhub_profile_v1',
      requestConfig: {
        url: '/stock/profile2',
        method: 'GET',
        params: {
          symbol,
          token: env.finnhubApiKey,
        },
      },
      transform: (payload) => ({
        symbol: String(payload?.ticker ?? symbol),
        name: String(payload?.name ?? ''),
        exchange: String(payload?.exchange ?? ''),
        currency: String(payload?.currency ?? ''),
        ipo: String(payload?.ipo ?? ''),
        marketCapitalization: Number(payload?.marketCapitalization ?? 0),
        shareOutstanding: Number(payload?.shareOutstanding ?? 0),
        logo: String(payload?.logo ?? ''),
        weburl: String(payload?.weburl ?? ''),
      }),
    });
  });

export const getCompanyProfile = async (symbol: string): Promise<CompanyProfile> => {
  const result = await getCompanyProfileCached(symbol);
  return result.data;
};

export const getStockMetricsCached = async (
  symbol: string,
): Promise<CachedFundamentalsResult<StockMetrics>> =>
  withServiceError('finnhub', 'getStockMetrics', async () => {
    ensureApiKey();

    return fetchFinnhubCached<Record<string, any>, StockMetrics>({
      symbol,
      dataType: 'metrics',
      schemaVersion: 'finnhub_metrics_v1',
      qualifier: 'metric:all',
      requestConfig: {
        url: '/stock/metric',
        method: 'GET',
        params: {
          symbol,
          metric: 'all',
          token: env.finnhubApiKey,
        },
      },
      transform: (payload) => {
        const metrics = (payload?.metric ?? {}) as Record<string, unknown>;
        return {
          symbol,
          pe: toNumberOrNull(metrics.peNormalizedAnnual ?? metrics.peTTM ?? metrics.peAnnual),
          eps: toNumberOrNull(metrics.epsNormalizedAnnual ?? metrics.epsTTM ?? metrics.epsAnnual),
          revenueGrowth: toNumberOrNull(
            metrics.revenueGrowthTTMYoy ?? metrics.revenueGrowth3Y ?? metrics.revenueGrowth5Y,
          ),
          operatingMargin: toNumberOrNull(
            metrics.operatingMarginTTM ?? metrics.operatingMarginAnnual ?? metrics.operatingMargin5Y,
          ),
          dividendYield: toNumberOrNull(
            metrics.dividendYieldIndicatedAnnual ?? metrics.currentDividendYieldTTM ?? metrics.dividendYieldTTM,
          ),
          priceToFreeCashFlow: toNumberOrNull(metrics.pfcfShareTTM ?? metrics['currentEv/freeCashFlowTTM']),
          debtToEquity: toNumberOrNull(
            metrics['totalDebt/totalEquityQuarterly'] ?? metrics['totalDebt/totalEquityAnnual'],
          ),
          earningsRevision: toNumberOrNull(
            metrics.epsGrowthTTMYoy ?? metrics.epsGrowthQuarterlyYoy ?? metrics.epsGrowth5Y,
          ),
        };
      },
    });
  });

export const getStockMetrics = async (symbol: string): Promise<StockMetrics> => {
  const result = await getStockMetricsCached(symbol);
  return result.data;
};



export const getCompanyNewsCached = async (
  symbol: string,
  from: Date,
  to: Date,
): Promise<CachedFundamentalsResult<CompanyNewsArticle[]>> =>
  withServiceError('finnhub', 'getCompanyNews', async () => {
    ensureApiKey();
    const fromStr = formatDateParam(from);
    const toStr = formatDateParam(to);

    return fetchFinnhubCached<any[], CompanyNewsArticle[]>({
      symbol,
      dataType: 'news',
      schemaVersion: 'finnhub_company_news_v1',
      qualifier: `${fromStr}:${toStr}`,
      requestConfig: {
        url: '/company-news',
        method: 'GET',
        params: {
          symbol,
          from: fromStr,
          to: toStr,
          token: env.finnhubApiKey,
        },
      },
      asOfExtractor: (payload) => {
        if (!Array.isArray(payload) || payload.length === 0) return toStr;
        const timestamps = payload
          .map((item) => (typeof item?.datetime === 'number' ? item.datetime : Number(item?.datetime)))
          .filter((value) => Number.isFinite(value));
        if (!timestamps.length) return toStr;
        const latest = Math.max(...timestamps);
        return new Date(latest * 1000).toISOString();
      },
      transform: (payload) =>
        toArray<any>(payload)
          .map((item) => ({
            datetime:
              typeof item?.datetime === 'number'
                ? item.datetime
                : Number.parseInt(item?.datetime ?? '0', 10) || 0,
            headline: typeof item?.headline === 'string' ? item.headline : '',
            summary: typeof item?.summary === 'string' ? item.summary : '',
            source: typeof item?.source === 'string' ? item.source : '',
            url: typeof item?.url === 'string' ? item.url : '',
          }))
          .filter((article) => article.headline || article.summary || article.url),
    });
  });

export const getCompanyNews = async (
  symbol: string,
  from: Date,
  to: Date,
): Promise<CompanyNewsArticle[]> => {
  const result = await getCompanyNewsCached(symbol, from, to);
  return result.data;
};

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

export const getFinancialsReportedCached = async (
  symbol: string,
  freq: string = 'quarterly',
): Promise<CachedFundamentalsResult<any[]>> =>
  withServiceError('finnhub', 'getFinancialsReported', async () => {
    ensureApiKey();

    return fetchFinnhubCached<any, any[]>({
      symbol,
      dataType: 'statements',
      schemaVersion: 'finnhub_financials_reported_v1',
      qualifier: freq,
      requestConfig: {
        url: '/stock/financials-reported',
        method: 'GET',
        params: {
          symbol,
          freq,
          token: env.finnhubApiKey,
        },
      },
      asOfExtractor: (payload) => {
        const rows = Array.isArray(payload) ? payload : toArray<any>(payload?.data);
        if (!rows.length) return null;
        const first = rows[0] ?? {};
        const candidates = [
          typeof first?.endDate === 'string' ? first.endDate : null,
          typeof first?.reportDate === 'string' ? first.reportDate : null,
          typeof first?.fiscalDate === 'string' ? first.fiscalDate : null,
        ];
        return candidates.find((value) => value && value.length > 0) ?? null;
      },
      transform: (payload) => (Array.isArray(payload) ? payload : toArray<any>(payload?.data)),
    });
  });

export const getFinancialsReported = async (
  symbol: string,
  freq: string = 'quarterly',
): Promise<any[]> => {
  const result = await getFinancialsReportedCached(symbol, freq);
  return result.data;
};

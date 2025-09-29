import axios from 'axios';
import { env } from '../config/env.js';
const ensureApiKey = () => {
    if (!env.finnhubApiKey) {
        throw new Error('FINNHUB_API_KEY is not configured.');
    }
};
const formatDateParam = (date) => date.toISOString().slice(0, 10);
const http = axios.create({
    baseURL: env.finnhubBaseUrl,
    timeout: 15_000,
});
const toNumberOrNull = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};
export const getQuote = async (symbol) => {
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
    };
};
export const getCompanyProfile = async (symbol) => {
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
    };
};
export const getStockMetrics = async (symbol) => {
    ensureApiKey();
    const { data } = await http.get('/stock/metric', {
        params: {
            symbol,
            metric: 'all',
            token: env.finnhubApiKey,
        },
    });
    const metrics = (data?.metric ?? {});
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
    };
};
export const getCompanyNews = async (symbol, from, to) => {
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
        datetime: typeof item.datetime === 'number'
            ? item.datetime
            : Number.parseInt(item.datetime ?? '0', 10) || 0,
        headline: typeof item.headline === 'string' ? item.headline : '',
        summary: typeof item.summary === 'string' ? item.summary : '',
        source: typeof item.source === 'string' ? item.source : '',
        url: typeof item.url === 'string' ? item.url : '',
    }))
        .filter((article) => article.headline || article.summary || article.url);
};
//# sourceMappingURL=finnhubService.js.map
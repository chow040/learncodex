import { Router } from 'express';

import {
  requestEquityAssessment,
  type AssessmentContext,
  type AssessmentInput,
} from '../services/openaiService.js';
import {
  getCompanyNews,
  getCompanyProfile,
  getQuote,
  getStockMetrics,
} from '../services/finnhubService.js';

export const assessmentRouter = Router();

const createAssessmentContext = async (symbol: string): Promise<AssessmentContext> => {
  const now = new Date();
  const from = new Date(now);
  from.setFullYear(now.getFullYear() - 1);

  const [quoteResult, profileResult, metricsResult, newsResult] = await Promise.allSettled([
    getQuote(symbol),
    getCompanyProfile(symbol),
    getStockMetrics(symbol),
    getCompanyNews(symbol, from, now),
  ]);

  const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
  const quote = quoteResult.status === 'fulfilled' ? quoteResult.value : null;
  const metrics = metricsResult.status === 'fulfilled' ? metricsResult.value : null;
  const news = newsResult.status === 'fulfilled' ? newsResult.value : [];

  const currency = profile?.currency ?? 'USD';

  return {
    ...(profile
      ? {
          profile: {
            name: profile.name,
            exchange: profile.exchange,
            currency,
            marketCapitalization: profile.marketCapitalization,
            shareOutstanding: profile.shareOutstanding,
            ipo: profile.ipo,
            weburl: profile.weburl,
          },
        }
      : {}),
    ...(quote
      ? {
          quote: {
            current: quote.current,
            high: quote.high,
            low: quote.low,
            open: quote.open,
            previousClose: quote.previousClose,
            timestamp: quote.timestamp,
            currency,
          },
        }
      : {}),
    ...(metrics ? { metrics } : {}),
    ...(news.length
      ? {
          news: news
            .filter((item) => item.headline || item.summary)
            .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
            .slice(0, 20),
        }
      : {}),
  } satisfies AssessmentContext;
};

assessmentRouter.post('/', async (req, res, next) => {
  const payload = req.body as Partial<AssessmentInput>;

  const symbol = payload?.symbol?.trim().toUpperCase();

  if (!symbol) {
    return res.status(400).json({
      error: 'symbol is required',
    });
  }

  const assessmentInput: AssessmentInput = {
    symbol,
    ...(payload.timeframe ? { timeframe: payload.timeframe } : {}),
    ...(payload.strategyFocus ? { strategyFocus: payload.strategyFocus } : {}),
    ...(payload.additionalContext
      ? { additionalContext: payload.additionalContext }
      : {}),
  };

  try {
    const context = await createAssessmentContext(symbol);
    const assessment = await requestEquityAssessment(assessmentInput, context);
    res.json(assessment);
  } catch (error) {
    next(error);
  }
});

import { Router } from 'express';

import { getRedditInsights } from '../services/redditService.js';

export const socialRouter = Router();

socialRouter.get('/reddit', async (req, res, next) => {
  const symbolParam = typeof req.query.symbol === 'string' ? req.query.symbol : undefined;
  const tickerParam = typeof req.query.ticker === 'string' ? req.query.ticker : undefined;
  const symbol = (symbolParam ?? tickerParam ?? '').trim();

  if (!symbol) {
    return res.status(400).json({ error: 'symbol query parameter is required' });
  }

  try {
    const insights = await getRedditInsights(symbol);
    res.json(insights);
  } catch (error) {
    next(error);
  }
});

import { Router } from 'express';

import { requestTradingAgentsDecision } from '../services/tradingAgentsService.js';

export const tradingRouter = Router();

tradingRouter.post('/decision', async (req, res, next) => {
  const rawSymbol = req.body?.symbol ?? req.query?.symbol;
  const symbol = typeof rawSymbol === 'string' ? rawSymbol.trim().toUpperCase() : '';

  if (!symbol) {
    return res.status(400).json({ error: 'symbol is required' });
  }

  try {
    const decision = await requestTradingAgentsDecision(symbol);
    res.json(decision);
  } catch (error) {
    next(error);
  }
});

import { Router } from 'express';
import { requestTradingAgentsDecision } from '../services/tradingAgentsService.js';
import { requestTradingAgentsDecisionInternal } from '../services/tradingAgentsEngineService.js';
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
    }
    catch (error) {
        next(error);
    }
});
// New internal orchestrator (no Python server required)
tradingRouter.post('/decision/internal', async (req, res, next) => {
    const rawSymbol = req.body?.symbol ?? req.query?.symbol;
    const symbol = typeof rawSymbol === 'string' ? rawSymbol.trim().toUpperCase() : '';
    if (!symbol) {
        return res.status(400).json({ error: 'symbol is required' });
    }
    try {
        const decision = await requestTradingAgentsDecisionInternal(symbol);
        res.json(decision);
    }
    catch (error) {
        next(error);
    }
});
// Optional: GET handler for simple browser testing or curl without a JSON body
tradingRouter.get('/decision/internal', async (req, res, next) => {
    const rawSymbol = req.query?.symbol;
    const symbol = typeof rawSymbol === 'string' ? rawSymbol.trim().toUpperCase() : '';
    if (!symbol) {
        return res.status(400).json({ error: 'symbol is required' });
    }
    try {
        const decision = await requestTradingAgentsDecisionInternal(symbol);
        res.json(decision);
    }
    catch (error) {
        next(error);
    }
});
//# sourceMappingURL=tradingRoutes.js.map
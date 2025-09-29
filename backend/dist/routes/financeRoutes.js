import { Router } from 'express';
import { getCompanyProfile, getQuote, getStockMetrics } from '../services/finnhubService.js';
export const financeRouter = Router();
financeRouter.get('/quote', async (req, res, next) => {
    const symbol = String(req.query.symbol ?? '').toUpperCase();
    if (!symbol) {
        return res.status(400).json({ error: 'symbol query parameter is required' });
    }
    try {
        const quote = await getQuote(symbol);
        res.json(quote);
    }
    catch (error) {
        next(error);
    }
});
financeRouter.get('/profile', async (req, res, next) => {
    const symbol = String(req.query.symbol ?? '').toUpperCase();
    if (!symbol) {
        return res.status(400).json({ error: 'symbol query parameter is required' });
    }
    try {
        const profile = await getCompanyProfile(symbol);
        res.json(profile);
    }
    catch (error) {
        next(error);
    }
});
financeRouter.get('/metrics', async (req, res, next) => {
    const symbol = String(req.query.symbol ?? '').toUpperCase();
    if (!symbol) {
        return res.status(400).json({ error: 'symbol query parameter is required' });
    }
    try {
        const metrics = await getStockMetrics(symbol);
        res.json(metrics);
    }
    catch (error) {
        next(error);
    }
});
//# sourceMappingURL=financeRoutes.js.map
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { fetchDashboard } from '../services/dashboardService.js';
import type { DashboardFilters } from '../types/dashboard.js';

export const dashboardRouter = Router();

dashboardRouter.get('/dashboard', requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const filters: DashboardFilters = {
    reportsPage: Number(req.query.reportsPage) || 1,
    reportsPageSize: Number(req.query.reportsPageSize) || 20,
    reportsStatus: typeof req.query.reportsStatus === 'string' ? req.query.reportsStatus : undefined,
    reportsType: typeof req.query.reportsType === 'string' ? req.query.reportsType : undefined,
    bookmarksPage: Number(req.query.bookmarksPage) || 1,
    bookmarksPageSize: Number(req.query.bookmarksPageSize) || 20,
    activityLimit: Number(req.query.activityLimit) || 50
  };

  try {
    const { dashboard, errors } = await fetchDashboard(userId, filters);
    return res.json({ dashboard, errors });
  } catch (err: any) {
    req.log?.error({ message: 'dashboard.fetch.failed', err, userId });
    return res.status(500).json({ error: 'Failed to load dashboard', correlationId: req.correlationId });
  }
});

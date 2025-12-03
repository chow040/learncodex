import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getReportById } from '../services/reportDetailService.js';
import { createReport, listReportsPageByUser } from '../services/reportService.js';
import { validateReportSave, clampPagination } from '../utils/validation.js';
import { DEFAULT_PAGE_SIZE } from '../config/limits.js';

export const reportsRouter = Router();

reportsRouter.get('/reports', requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const { page, pageSize } = clampPagination({
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || DEFAULT_PAGE_SIZE
  });

  const filters = {
    reportsPage: page,
    reportsPageSize: pageSize,
    reportsStatus: typeof req.query.status === 'string' ? req.query.status : undefined,
    reportsType: typeof req.query.type === 'string' ? req.query.type : undefined
  };

  try {
    const result = await listReportsPageByUser(userId, filters);
    return res.json(result);
  } catch (err: any) {
    req.log?.error({ message: 'reports.list.failed', err, userId });
    return res.status(500).json({ error: 'Failed to list reports', correlationId: req.correlationId });
  }
});

reportsRouter.get('/reports/:id', requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const { id } = req.params;
  try {
    const { report, status } = await getReportById(userId, id);
    if (!report && status === 403) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    return res.json({ report });
  } catch (err: any) {
    req.log?.error({ message: 'reports.fetch.failed', err, userId, reportId: id });
    return res.status(500).json({ error: 'Failed to fetch report', correlationId: req.correlationId });
  }
});

reportsRouter.post('/reports', requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const validation = validateReportSave(req.body || {});
  if (!validation.ok) {
    req.log?.warn({
      message: 'reports.create.validation_failed',
      reason: validation.message,
      contentLength: req.headers['content-length'],
      hasBody: !!req.body,
      keys: req.body ? Object.keys(req.body) : []
    });
    return res.status(validation.status || 400).json({
      error: validation.message,
      receivedKeys: req.body ? Object.keys(req.body) : [],
      contentLength: req.headers['content-length'] || null
    });
  }
  const { title, ticker, status, type, payload } = validation.data!;
  try {
    const reportId = await createReport(userId, { title, ticker, status, type, payload });
    return res.status(201).json({ reportId });
  } catch (err: any) {
    req.log?.error({ message: 'reports.create.failed', err, userId, ticker });
    return res.status(500).json({ error: 'Failed to save report', correlationId: req.correlationId });
  }
});

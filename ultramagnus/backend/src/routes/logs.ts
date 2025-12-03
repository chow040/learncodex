import { Router } from 'express';
import { logger } from '../utils/logger.js';

const allowedLevels = new Set(['error', 'warn', 'info', 'debug']);

export const logRouter = Router();

logRouter.post('/', (req, res) => {
  const body = req.body;
  const entries = Array.isArray(body)
    ? body
    : Array.isArray(body?.logs)
      ? body.logs
      : [];

  if (!entries.length) {
    return res.status(400).json({ error: 'Log payload required' });
  }

  entries.slice(0, 100).forEach((entry: any) => {
    const level = typeof entry?.level === 'string' && allowedLevels.has(entry.level)
      ? entry.level
      : 'info';

    logger.log({
      level,
      message: entry?.message || 'frontend.log',
      correlationId: entry?.correlationId || entry?.requestId,
      userId: entry?.userId || entry?.user?.id || null,
      meta: {
        frontend: true,
        source: entry?.source || 'moonshot-fe',
        sessionId: entry?.sessionId,
        route: entry?.route,
        browser: entry?.browser,
        context: entry?.context || entry
      }
    });
  });

  return res.status(202).json({ accepted: Math.min(entries.length, 100) });
});

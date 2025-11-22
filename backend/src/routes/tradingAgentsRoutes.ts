import { Router, type Response } from 'express';
import { ZodError } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  executeAgentRun,
  getAgentRunDetail,
  getTradingAgentDetail,
  listAgentRunsForUser,
  listPublicTradingAgents,
  TradingAgentsUserError,
} from '../services/tradingAgentsUserService.js';
import { executeAgentRunSchema, listRunsQuerySchema } from '../validators/tradingAgentRuns.js';

export const tradingAgentsRouter = Router();

const sendError = (res: Response, error: Error): void => {
  if (error instanceof TradingAgentsUserError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: error.message || 'Unexpected error' });
};

tradingAgentsRouter.use(requireAuth);

tradingAgentsRouter.get('/', async (_req, res, next) => {
  try {
    const agents = await listPublicTradingAgents();
    res.json(agents);
  } catch (error) {
    next(error);
  }
});

tradingAgentsRouter.get('/:agentId', async (req: AuthenticatedRequest, res, next) => {
  try {
    const agentId = req.params.agentId;
    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }
    const detail = await getTradingAgentDetail(agentId, req.user!.id);
    res.json(detail);
  } catch (error) {
    if (error instanceof TradingAgentsUserError) {
      return sendError(res, error);
    }
    next(error);
  }
});

tradingAgentsRouter.post('/:agentId/run', async (req: AuthenticatedRequest, res, next) => {
  try {
    const agentId = req.params.agentId;
    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }
    const payload = executeAgentRunSchema.parse(req.body ?? {});
    const result = await executeAgentRun({
      agentId,
      userId: req.user!.id,
      tickers: payload.tickers,
      ...(payload.question ? { question: payload.question } : {}),
      ...(payload.modelId ? { modelId: payload.modelId } : {}),
      ...(payload.useMockData !== undefined ? { useMockData: payload.useMockData } : {}),
    });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid payload', issues: error.issues });
    }
    if (error instanceof TradingAgentsUserError) {
      return sendError(res, error);
    }
    next(error);
  }
});

tradingAgentsRouter.get('/:agentId/runs', async (req: AuthenticatedRequest, res, next) => {
  try {
    const agentId = req.params.agentId;
    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }
    const query = listRunsQuerySchema.parse({
      limit: typeof req.query.limit === 'string' ? req.query.limit : undefined,
      ticker: typeof req.query.ticker === 'string' ? req.query.ticker : undefined,
    });
    const runs = await listAgentRunsForUser(agentId, req.user!.id, {
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.ticker ? { ticker: query.ticker } : {}),
    });
    res.json(runs);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid query', issues: error.issues });
    }
    if (error instanceof TradingAgentsUserError) {
      return sendError(res, error);
    }
    next(error);
  }
});

tradingAgentsRouter.get('/:agentId/runs/:runId', async (req: AuthenticatedRequest, res, next) => {
  try {
    const agentId = req.params.agentId;
    const runId = req.params.runId;
    if (!agentId || !runId) {
      return res.status(400).json({ error: 'agentId and runId are required' });
    }
    const run = await getAgentRunDetail(agentId, runId, req.user!.id);
    res.json(run);
  } catch (error) {
    if (error instanceof TradingAgentsUserError) {
      return sendError(res, error);
    }
    next(error);
  }
});

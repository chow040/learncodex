import { Router } from 'express';
import multer from 'multer';

import {
  analyzeChartImage,
  MAX_CHART_IMAGE_BYTES,
  SUPPORTED_CHART_IMAGE_MIME_TYPES,
  type ChartAnalysisInput,
} from '../services/chartAnalysisService.js';
import {
  analyzeChartDebate,
  MAX_CHART_DEBATE_IMAGE_BYTES,
  type ChartDebateInput,
} from '../services/chartDebateService.js';
import {
  appendJobStep,
  completeJob,
  createDebateJob,
  failJob,
  getJobSnapshot,
  markJobRunning,
} from '../services/chartDebateJobService.js';
import {
  getTradingAssessmentByRunId,
  getTradingAssessments,
} from '../services/tradingAssessmentsService.js';
import { requestTradingAgentsDecisionInternal } from '../services/tradingAgentsEngineService.js';
import {
  attachProgressStream,
  generateRunId,
  initializeProgress,
  publishCompletion,
  publishError,
  publishProgressEvent,
} from '../services/tradingProgressService.js';
import { env } from '../config/env.js';
import {
  TICKER_REGEX,
  validateTradingAgentsRequest,
  TradingAgentsValidationError,
  type TradingAgentsRequestInput,
} from '../validators/tradingAgents.js';
import type { TradingAnalystId } from '../constants/tradingAgents.js';

export const tradingRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(MAX_CHART_IMAGE_BYTES, MAX_CHART_DEBATE_IMAGE_BYTES) },
  fileFilter(_req, file, callback) {
    if (SUPPORTED_CHART_IMAGE_MIME_TYPES.has(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error('Unsupported image format. Please upload PNG, JPEG, or WEBP charts.'));
    }
  },
});

const normalizeAnalystsInput = (value: unknown): unknown => {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value : [value];
};

const asQueryString = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return typeof value === 'string' ? value : undefined;
};

const parseLimitQuery = (value: unknown): number | undefined => {
  const raw = asQueryString(value);
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error('limit must be an integer');
  }
  return parsed;
};

const requireHistoryEnabled = () => {
  if (!env.tradingAssessmentHistoryEnabled) {
    const error = new Error('Trading assessment history is disabled');
    error.name = 'HistoryDisabledError';
    throw error;
  }
  if (!env.databaseUrl) {
    const error = new Error('Database is not configured');
    error.name = 'HistoryUnavailableError';
    throw error;
  }
};

tradingRouter.get('/assessments', async (req, res, next) => {
  try {
    requireHistoryEnabled();
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'HistoryDisabledError') {
        return res.status(404).json({ error: 'Not found' });
      }
      if (error.name === 'HistoryUnavailableError') {
        return res.status(503).json({ error: 'Trading assessment history is unavailable' });
      }
    }
    return next(error);
  }

  const symbolRaw = asQueryString(req.query.symbol)?.trim().toUpperCase() ?? '';
  if (!symbolRaw) {
    return res.status(400).json({ error: 'symbol query parameter is required', field: 'symbol' });
  }
  if (!TICKER_REGEX.test(symbolRaw)) {
    return res.status(400).json({ error: 'symbol must be 1-5 uppercase letters', field: 'symbol' });
  }

  let limit: number | undefined;
  try {
    limit = parseLimitQuery(req.query.limit);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid limit', field: 'limit' });
  }

  const cursorRaw = asQueryString(req.query.cursor);
  const cursor = cursorRaw && cursorRaw.trim().length > 0 ? cursorRaw.trim() : undefined;

  try {
    const result = await getTradingAssessments(symbolRaw, {
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor ? { cursor } : {}),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

tradingRouter.get('/assessments/:runId', async (req, res, next) => {
  try {
    requireHistoryEnabled();
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'HistoryDisabledError') {
        return res.status(404).json({ error: 'Not found' });
      }
      if (error.name === 'HistoryUnavailableError') {
        return res.status(503).json({ error: 'Trading assessment history is unavailable' });
      }
    }
    return next(error);
  }

  const runId = typeof req.params.runId === 'string' ? req.params.runId.trim() : '';
  if (!runId) {
    return res.status(400).json({ error: 'runId is required', field: 'runId' });
  }
  if (runId.length > 128) {
    return res.status(400).json({ error: 'runId is too long', field: 'runId' });
  }

  try {
    const assessment = await getTradingAssessmentByRunId(runId);
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    res.json(assessment);
  } catch (error) {
    next(error);
  }
});

tradingRouter.post('/decision/internal', async (req, res, next) => {
  let runId: string;
  let modelId: string;
  let analysts: TradingAnalystId[];
  let symbol: string;
  let useMockData: boolean;

  try {
    const requestInput: TradingAgentsRequestInput = {
      symbol: req.body?.symbol ?? req.query?.symbol,
      runId: req.body?.runId,
      modelId: req.body?.modelId,
      analysts: normalizeAnalystsInput(req.body?.analysts),
      useMockData: req.body?.useMockData ?? req.body?.mode,
    };
    const validated = validateTradingAgentsRequest(requestInput, {
      allowedModels: env.tradingAllowedModels,
      defaultModel: env.openAiModel,
    });
    symbol = validated.symbol;
    modelId = validated.modelId;
    analysts = validated.analysts;
    runId = validated.runId ?? generateRunId();
    useMockData = validated.useMockData ?? env.tradingAgentsMockMode;
  } catch (error) {
    if (error instanceof TradingAgentsValidationError) {
      return res.status(400).json({ error: error.message, field: error.field });
    }
    return next(error);
  }

  initializeProgress(runId);
  publishProgressEvent(runId, {
    runId,
    stage: 'queued',
    label: 'Queued',
    percent: 0,
    modelId,
    analysts,
    mode: useMockData ? 'mock' : 'live',
  });

  try {
    const decision = await requestTradingAgentsDecisionInternal(symbol, {
      runId,
      modelId,
      analysts,
      useMockData,
    });
    publishCompletion(runId, decision);
    res.json({ runId, ...decision });
  } catch (error) {
    publishError(runId, error instanceof Error ? error.message : 'Unknown error');
    next(error);
  }
});

tradingRouter.post('/trade-ideas/:tradeIdeaId/chart-analysis', upload.single('image'), async (req, res, next) => {
  const tradeIdeaId = req.params?.tradeIdeaId ?? null;
  const tickerRaw = req.body?.ticker ?? req.query?.ticker;
  const timeframeRaw = req.body?.timeframe ?? req.query?.timeframe;
  const notesRaw = req.body?.notes ?? req.query?.notes;

  const ticker = typeof tickerRaw === 'string' ? tickerRaw.trim().toUpperCase() : undefined;
  const timeframe = typeof timeframeRaw === 'string' ? timeframeRaw.trim() : undefined;
  const notes = typeof notesRaw === 'string' ? notesRaw : undefined;
  // debate round params are not used in simple chart-analysis route

  const imageFile = req.file;
  if (!imageFile || !imageFile.buffer) {
    return res.status(400).json({ error: 'image is required (multipart field name "image")' });
  }

  try {
    const chartInput: ChartAnalysisInput = {
      buffer: imageFile.buffer,
      mimeType: imageFile.mimetype,
    };

    if (ticker) {
      chartInput.ticker = ticker;
    }
    if (timeframe) {
      chartInput.timeframe = timeframe;
    }
    if (notes) {
      chartInput.notes = notes;
    }

    const analysis = await analyzeChartImage(chartInput);

    res.json({
      tradeIdeaId,
      ticker,
      timeframe,
      analysis,
    });
  } catch (error) {
    next(error);
  }
});

// New: Dual-agent debate pipeline (Agent A, Agent B, Referee)
tradingRouter.post('/trade-ideas/:tradeIdeaId/chart-debate', upload.single('image'), async (req, res, next) => {
  const tradeIdeaId = req.params?.tradeIdeaId ?? null;
  const tickerRaw = req.body?.ticker ?? req.query?.ticker;
  const timeframeRaw = req.body?.timeframe ?? req.query?.timeframe;
  const notesRaw = req.body?.notes ?? req.query?.notes;
  const aRoundsRaw = req.body?.aRounds ?? req.query?.aRounds;
  const bRoundsRaw = req.body?.bRounds ?? req.query?.bRounds;

  const ticker = typeof tickerRaw === 'string' ? tickerRaw.trim().toUpperCase() : undefined;
  const timeframe = typeof timeframeRaw === 'string' ? timeframeRaw.trim() : undefined;
  const notes = typeof notesRaw === 'string' ? notesRaw : undefined;
  const agentARounds = typeof aRoundsRaw === 'string' ? Number.parseInt(aRoundsRaw, 10) : (typeof aRoundsRaw === 'number' ? aRoundsRaw : undefined);
  const agentBRounds = typeof bRoundsRaw === 'string' ? Number.parseInt(bRoundsRaw, 10) : (typeof bRoundsRaw === 'number' ? bRoundsRaw : undefined);

  const imageFile = req.file;
  if (!imageFile || !imageFile.buffer) {
    return res.status(400).json({ error: 'image is required (multipart field name "image")' });
  }

  try {
    const debateInput: ChartDebateInput = {
      buffer: imageFile.buffer,
      mimeType: imageFile.mimetype,
      ...(ticker ? { ticker } : {}),
      ...(timeframe ? { timeframe } : {}),
      ...(notes ? { notes } : {}),
      ...(typeof agentARounds === 'number' && !Number.isNaN(agentARounds) ? { agentARounds } : {}),
      ...(typeof agentBRounds === 'number' && !Number.isNaN(agentBRounds) ? { agentBRounds } : {}),
    };

    const job = createDebateJob({ tradeIdeaId, ticker, timeframe });
    res.status(202).json({ jobId: job.jobId });

    void (async () => {
      try {
        markJobRunning(job.jobId);
        const debate = await analyzeChartDebate(debateInput, (event) => appendJobStep(job.jobId, event));
        appendJobStep(job.jobId, { step: 'completed', message: 'Debate completed' });
        completeJob(job.jobId, debate);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Debate failed';
        appendJobStep(job.jobId, { step: 'failed', message: message });
        failJob(job.jobId, message);
      }
    })();
  } catch (error) {
    next(error);
  }
});

tradingRouter.get('/trade-ideas/chart-debate/jobs/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required' });
  }

  const job = getJobSnapshot(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

// Optional: GET handler for simple browser testing or curl without a JSON body
tradingRouter.get('/decision/internal', async (req, res, next) => {
  let runId: string;
  let modelId: string;
  let analysts: TradingAnalystId[];
  let symbol: string;
  let useMockData: boolean;

  try {
    const requestInput: TradingAgentsRequestInput = {
      symbol: req.query?.symbol,
      runId: req.query?.runId,
      modelId: req.query?.modelId,
      analysts: normalizeAnalystsInput(req.query?.analysts),
      useMockData: req.query?.useMockData ?? req.query?.mode,
    };
    const validated = validateTradingAgentsRequest(requestInput, {
      allowedModels: env.tradingAllowedModels,
      defaultModel: env.openAiModel,
    });
    symbol = validated.symbol;
    modelId = validated.modelId;
    analysts = validated.analysts;
    runId = validated.runId ?? generateRunId();
    useMockData = validated.useMockData ?? env.tradingAgentsMockMode;
  } catch (error) {
    if (error instanceof TradingAgentsValidationError) {
      return res.status(400).json({ error: error.message, field: error.field });
    }
    return next(error);
  }

  initializeProgress(runId);
  publishProgressEvent(runId, {
    runId,
    stage: 'queued',
    label: 'Queued',
    percent: 0,
    modelId,
    analysts,
    mode: useMockData ? 'mock' : 'live',
  });

  try {
    const decision = await requestTradingAgentsDecisionInternal(symbol, {
      runId,
      modelId,
      analysts,
      useMockData,
    });
    publishCompletion(runId, decision);
    res.json({ runId, ...decision });
  } catch (error) {
    publishError(runId, error instanceof Error ? error.message : 'Unknown error');
    next(error);
  }
});

tradingRouter.get('/decision/internal/events/:runId', (req, res) => {
  const runId = req.params.runId?.trim();
  if (!runId) {
    return res.status(400).json({ error: 'runId is required' });
  }
  attachProgressStream(runId, res);
});

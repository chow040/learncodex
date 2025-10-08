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
import { requestTradingAgentsDecision } from '../services/tradingAgentsService.js';
import { requestTradingAgentsDecisionInternal } from '../services/tradingAgentsEngineService.js';

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
  } catch (error) {
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
  const rawSymbol = req.query?.symbol;
  const symbol = typeof rawSymbol === 'string' ? rawSymbol.trim().toUpperCase() : '';

  if (!symbol) {
    return res.status(400).json({ error: 'symbol is required' });
  }

  try {
    const decision = await requestTradingAgentsDecisionInternal(symbol);
    res.json(decision);
  } catch (error) {
    next(error);
  }
});

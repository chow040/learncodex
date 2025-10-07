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

  const ticker = typeof tickerRaw === 'string' ? tickerRaw.trim().toUpperCase() : undefined;
  const timeframe = typeof timeframeRaw === 'string' ? timeframeRaw.trim() : undefined;
  const notes = typeof notesRaw === 'string' ? notesRaw : undefined;

  const imageFile = req.file;
  if (!imageFile || !imageFile.buffer) {
    return res.status(400).json({ error: 'image is required (multipart field name "image")' });
  }

  try {
    const debateInput: ChartDebateInput = {
      buffer: imageFile.buffer,
      mimeType: imageFile.mimetype,
      ticker,
      timeframe,
      notes,
    };

    const debate = await analyzeChartDebate(debateInput);

    res.json({
      tradeIdeaId,
      ticker,
      timeframe,
      debate,
    });
  } catch (error) {
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
  } catch (error) {
    next(error);
  }
});

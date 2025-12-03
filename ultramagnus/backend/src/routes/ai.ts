import { Router } from 'express';
import { getGenAiClient } from '../clients/genai.js';
import { logger } from '../utils/logger.js';
import { logAIFailure } from '../utils/aiLogger.js';
import { requireAuth } from '../middleware/auth.js';
import {
  appendMessage,
  ConversationError,
  getConversation,
  summarizeIfNeeded
} from '../services/conversationService.js';

const REPORT_PROMPT = (ticker: string) => `
  Generate a comprehensive professional equity research report for ${ticker}.
  
  You MUST search for the latest real-time data including:
  1. Current Price, Day's Range, 52-Week Range, Market Cap, PE Ratio.
  2. Recent News (last 30 days) and Upcoming Events (Catalysts).
  3. Financial Statements (last 4 years if possible).
  4. Insider Activity and Institutional Sentiment.
  5. Analyst ratings and price targets (current and historical trend).
  6. Price History (Monthly closes for last 12 months).

  Then, act as a senior hedge fund analyst ("Ultramagnus") and synthesize this into a JSON object.
  
  CRITICAL: Return ONLY valid JSON. No introductory text. No Markdown formatting.
  
  JSON Structure to match:
  {
    "companyName": "String",
    "ticker": "String",
    "reportDate": "String (Today's date)",
    "currentPrice": "String (e.g. $150.20)",
    "priceChange": "String (e.g. +2.5%)",
    "marketCap": "String",
    "peRatio": "String",
    "dayHigh": "String",
    "dayLow": "String",
    "week52High": "String",
    "week52Low": "String",
    "priceTarget": "String",
    "priceTargetRange": "String",
    "priceTargetModel": { "estimatedEPS": "String", "targetPE": "String", "growthRate": "String", "logic": "String" },
    "scenarioAnalysis": {
      "bear": { "label": "Bear", "price": "String", "logic": "String", "probability": "String" },
      "base": { "label": "Base", "price": "String", "logic": "String", "probability": "String" },
      "bull": { "label": "Bull", "price": "String", "logic": "String", "probability": "String" }
    },
    "summary": "String (Executive summary)",
    "rocketScore": Number (0-100),
    "rocketReason": "String",
    "financialHealthScore": Number (0-100),
    "financialHealthReason": "String",
    "momentumScore": Number (0-100, based on technical trend, volume, RSI),
    "momentumReason": "String",
    "moatAnalysis": { "moatRating": "Wide/Narrow/None", "moatSource": "String", "rationale": "String" },
    "managementQuality": { "executiveTenure": "String", "insiderOwnership": "String", "trackRecord": "String", "governanceRedFlags": "String", "verdict": "String" },
    "history": { "previousDate": "String", "previousVerdict": "BUY/HOLD/SELL", "changeRationale": ["String"] },
    "shortTermFactors": { "positive": [{"title": "String", "detail": "String"}], "negative": [{"title": "String", "detail": "String"}] },
    "longTermFactors": { "positive": [{"title": "String", "detail": "String"}], "negative": [{"title": "String", "detail": "String"}] },
    "financials": [
       { "year": "String", "revenue": Number, "grossProfit": Number, "operatingIncome": Number, "netIncome": Number, "eps": Number, "cashAndEquivalents": Number, "totalDebt": Number, "shareholderEquity": Number, "operatingCashFlow": Number, "capitalExpenditure": Number, "freeCashFlow": Number }
    ],
    "priceHistory": [ { "month": "String", "price": Number } ] (Last 12 months roughly),
    "analystPriceTargets": [ { "month": "String", "averageTarget": Number } ] (Last 12 months average analyst target matching priceHistory months),
    "peers": [ { "ticker": "String", "name": "String", "marketCap": "String", "peRatio": "String", "revenueGrowth": "String", "netMargin": "String" } ],
    "upcomingEvents": [ { "date": "String", "event": "String", "impact": "High/Medium/Low" } ],
    "recentNews": [ { "headline": "String", "date": "String" } ],
    "earningsCallAnalysis": { "sentiment": "Bullish/Neutral/Bearish", "summary": "String", "keyTakeaways": ["String"] },
    "overallSentiment": { "score": Number, "label": "String", "summary": "String" },
    "insiderActivity": [ { "insiderName": "String", "role": "String", "transactionDate": "String", "transactionType": "Buy/Sell", "shares": "String", "value": "String" } ],
    "riskMetrics": { "beta": "String", "shortInterestPercentage": "String", "shortInterestRatio": "String", "volatility": "High/Medium/Low" },
    "institutionalSentiment": "String",
    "tags": ["String"],
    "valuation": "String",
    "verdict": "BUY/HOLD/SELL",
    "verdictReason": "String",
    "sources": [ { "title": "String", "uri": "String" } ]
  }
  `;

export const aiRouter = Router();

const MODEL_NAME = 'gemini-3-pro-preview';

const ensureClient = () => {
  try {
    return getGenAiClient();
  } catch (err) {
    throw new Error('Gemini is not configured. Set GEMINI_API_KEY.');
  }
};

const describeGenAiError = (err: any) => {
  if (!err) return {};
  const providerMsg = err?.error?.message || err?.message || err?.toString?.();
  const status = err?.error?.status || err?.status;
  const code = err?.error?.code || err?.code;
  const body = err?.response?.data || err?.error;
  return {
    providerMessage: providerMsg,
    providerStatus: status,
    providerCode: code,
    providerBody: typeof body === 'string' ? body : body ? JSON.stringify(body) : null
  };
};

aiRouter.post('/chat', requireAuth, async (req, res) => {
  const log = req.log || logger;
  const { report, reportId: reportIdBody, messageHistory, userNotes, userThesis } = req.body || {};
  const reportId = report?.id || reportIdBody;
  const userId = (req as any).userId as string | undefined;

  if (!report || !messageHistory) {
    return res.status(400).json({ error: 'Report and messageHistory are required.' });
  }
  if (!reportId) {
    return res.status(400).json({ error: 'reportId is required to persist chat.' });
  }
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let client;
  try {
    client = ensureClient();
  } catch (err: any) {
    return res.status(503).json({ error: err.message });
  }

  const contextSummary = `
    STOCK ANALYSIS CONTEXT:
    Company: ${report.companyName} (${report.ticker})
    Price: ${report.currentPrice} (${report.priceChange})
    Verdict: ${report.verdict}
    Moonshot Score: ${report.rocketScore}/100
    Summary: ${report.summary}
    Bull Case: ${report.scenarioAnalysis?.bull?.price}
    Bear Case: ${report.scenarioAnalysis?.bear?.price}
    Short Term Factors: ${(report.shortTermFactors?.positive || []).map((f: any) => f.title).join(', ')}
    Risks: ${(report.shortTermFactors?.negative || []).map((f: any) => f.title).join(', ')}
    
    USER'S NOTES:
    "${userNotes || 'No notes yet.'}"

    USER'S INVESTMENT THESIS:
    "${userThesis || 'No thesis defined yet.'}"
  `;

  const systemInstruction = `
  You are 'Ultramagnus', an elite Wall Street equity research assistant. 
  Your goal is to help the user understand the stock report for ${report.ticker}.
  
  RULES:
  1. Use the provided STOCK ANALYSIS CONTEXT to answer questions.
  2. If the user asks about their notes or thesis, refer to the USER'S NOTES section.
  3. Keep answers concise, punchy, and professional (financial analyst persona).
  4. If asked for real-time news not in the report, use the googleSearch tool.
  5. Do not hallucinate data not present in the context or found via search.
  6. Format responses with clean Markdown (bolding key figures).
  `;

  const normalizedHistory = Array.isArray(messageHistory)
    ? messageHistory.map((m: any) => {
        const role = m?.role === 'assistant' ? 'model' : m?.role === 'user' ? 'user' : 'user';
        return { role, text: m?.text || '' };
      })
    : [];

  const contents = [
    { role: 'user', parts: [{ text: `System Context:\n${contextSummary}\n\n${systemInstruction}` }] },
    ...normalizedHistory.map((m: any) => ({ role: m.role, parts: [{ text: m.text }] }))
  ];

  const promptTextSize = (() => {
    const base = contextSummary.length + systemInstruction.length;
    const history = Array.isArray(messageHistory)
      ? messageHistory.reduce((sum: number, m: any) => sum + (m?.text?.length || 0), 0)
      : 0;
    return base + history;
  })();

  log.info({
    message: 'ai.chat.request',
    ticker: report?.ticker || null,
    reportId,
    userId,
    historyLength: Array.isArray(messageHistory) ? messageHistory.length : 0,
    promptTextSize,
    correlationId: req.correlationId
  });

  try {
    const ai = client;
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    const text = response.text || "I couldn't generate a response.";

    // Persist the latest user message (if present) and the assistant reply
    const latestUserMessage = Array.isArray(messageHistory)
      ? [...messageHistory].reverse().find((m: any) => m?.role === 'user' && typeof m?.text === 'string')
      : null;

    try {
      if (latestUserMessage?.text) {
        await appendMessage({
          reportId,
          userId,
          role: 'user',
          content: latestUserMessage.text,
          model: 'gemini-3-pro-preview'
        });
      }

      const { messageId, sessionId } = await appendMessage({
        reportId,
        userId,
        role: 'assistant',
        content: text,
        model: 'gemini-3-pro-preview'
      });

      const summaryResult = await summarizeIfNeeded(reportId, userId);
      const conversation = await getConversation(reportId, userId);

      return res.json({ text, messageId, sessionId, summaryResult, conversation });
    } catch (persistErr: any) {
      const status = persistErr instanceof ConversationError ? persistErr.status || 400 : 500;
      const code = persistErr?.code;
      if (status >= 500) {
        log.error({ message: 'ai.chat.persist_failed', err: persistErr, userId, reportId });
      } else {
        log.warn({ message: 'ai.chat.persist_blocked', err: persistErr, userId, reportId });
      }
      return res.status(status).json({ error: persistErr.message || 'Failed to persist chat', code, text });
    }
  } catch (err: any) {
    const providerDetails = describeGenAiError(err);
    log.error({
      message: 'ai.chat.failed',
      err,
      ticker: report?.ticker || null,
      reportId,
      providerDetails,
      correlationId: req.correlationId
    });
    return res.status(502).json({
      error: 'AI provider is temporarily unavailable. Please retry in a moment.',
      code: 'genai_upstream_error',
      correlationId: req.correlationId,
      providerDetails
    });
  }
});

const flushStreamingHeaders = (res: any) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.removeHeader('Content-Length');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
};

const streamText = async (
  res: any,
  iterable: AsyncIterable<string>,
  onChunk?: (chunk: string) => void
) => {
  let wrote = false;
  for await (const chunk of iterable) {
    if (!chunk) continue;
    wrote = true;
    res.write(chunk);
    onChunk?.(chunk);
  }
  return wrote;
};

aiRouter.post('/ai/stream-report', async (req, res) => {
  const { ticker } = req.body || {};
  const log = req.log || logger;
  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ error: 'Ticker is required' });
  }

  let client;
  try {
    client = ensureClient();
  } catch (err: any) {
    return res.status(503).json({ error: err.message || 'AI client unavailable' });
  }

  try {
    const startedAt = Date.now();
    const stream = await client.models.generateContentStream({
      model: MODEL_NAME,
      contents: [{ role: 'user', parts: [{ text: REPORT_PROMPT(ticker) }] }],
      config: { tools: [{ googleSearch: {} }] }
    });

    if (!stream) {
      throw new Error('Stream initialization failed');
    }

    flushStreamingHeaders(res);

    let wrote = false;
    const iterable = {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of stream) {
          const c = chunk as any;
          const textPart = typeof c.text === 'function' ? c.text() : c.text;
          if (textPart) {
            wrote = true;
            yield textPart;
          }
        }
      }
    };

    const streamed = await streamText(res, iterable as AsyncIterable<string>);
    if (!wrote && !streamed) {
      if (!res.headersSent) {
        return res.status(502).end('Stream produced no content');
      }
    }
    res.end();

    const durationMs = Date.now() - startedAt;
    log.info({ message: 'ai.stream.report.completed', ticker, durationMs });
  } catch (err: any) {
    const providerDetails = describeGenAiError(err);
    log.error({ message: 'ai.stream.report.failed', err: providerDetails, ticker });
    logAIFailure({
      operation: 'ai.stream.report',
      model: MODEL_NAME,
      ticker,
      error: err,
      providerStatus: providerDetails.providerStatus,
      providerCode: providerDetails.providerCode,
      providerMessage: providerDetails.providerMessage,
      providerBody: providerDetails.providerBody,
      correlationId: (req as any).correlationId
    });
    if (!res.headersSent) {
      res.status(502).json({ error: 'Failed to stream report', providerDetails });
    } else {
      res.end();
    }
  }
});

aiRouter.post('/chat/stream', requireAuth, async (req, res) => {
  const { report, reportId, messageHistory, userNotes, userThesis } = req.body || {};
  const log = req.log || logger;
  const userId = (req as any).userId as string | undefined;
  if (!report || !messageHistory) {
    return res.status(400).json({ error: 'Report and messageHistory are required.' });
  }
  if (!reportId) {
    return res.status(400).json({ error: 'reportId is required.' });
  }
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let client;
  try {
    client = ensureClient();
  } catch (err: any) {
    return res.status(503).json({ error: err.message || 'AI client unavailable' });
  }

  const contextSummary = `
    STOCK ANALYSIS CONTEXT:
    Company: ${report.companyName} (${report.ticker})
    Price: ${report.currentPrice} (${report.priceChange})
    Verdict: ${report.verdict}
    Moonshot Score: ${report.rocketScore}/100
    Summary: ${report.summary}
    Bull Case: ${report.scenarioAnalysis?.bull?.price}
    Bear Case: ${report.scenarioAnalysis?.bear?.price}
    Short Term Factors: ${(report.shortTermFactors?.positive || []).map((f: any) => f.title).join(', ')}
    Risks: ${(report.shortTermFactors?.negative || []).map((f: any) => f.title).join(', ')}
    
    USER'S NOTES:
    "${userNotes || 'No notes yet.'}"

    USER'S INVESTMENT THESIS:
    "${userThesis || 'No thesis defined yet.'}"
  `;

  const systemInstruction = `
  You are 'Ultramagnus', an elite Wall Street equity research assistant. 
  Use the STOCK ANALYSIS CONTEXT to answer. Keep answers concise, punchy, and professional.
  `;

  const rawHistory = Array.isArray(messageHistory)
    ? messageHistory.slice(-12).map((m: any) => ({
        role: m?.role === 'assistant' ? 'model' : 'user',
        text: m?.text || ''
      }))
    : [];

  const systemMsgText = `System Context:\n${contextSummary}\n\n${systemInstruction}`;
  const mergedContents: { role: string; parts: { text: string }[] }[] = [
    { role: 'user', parts: [{ text: systemMsgText }] }
  ];

  for (const msg of rawHistory) {
    const lastMsg = mergedContents[mergedContents.length - 1];
    if (lastMsg.role === msg.role) {
      lastMsg.parts[0].text += `\n\n---\n\n${msg.text}`;
    } else {
      mergedContents.push({ role: msg.role, parts: [{ text: msg.text }] });
    }
  }

  if (mergedContents[mergedContents.length - 1].role === 'model') {
    mergedContents.push({ role: 'user', parts: [{ text: 'Please continue.' }] });
  }

  flushStreamingHeaders(res);

  try {
    const stream = await client.models.generateContentStream({
      model: MODEL_NAME,
      contents: mergedContents
    });

    let wrote = false;
    const iterable = {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of stream) {
          const c = chunk as any;
          const textPart = typeof c.text === 'function' ? c.text() : c.text;
          if (textPart) {
            wrote = true;
            yield textPart;
          }
        }
      }
    };

    const streamed = await streamText(res, iterable as AsyncIterable<string>);
    if (!wrote && !streamed) {
      if (!res.headersSent) {
        return res.status(502).end('Stream produced no content');
      }
    }
    res.end();
  } catch (err: any) {
    const providerDetails = describeGenAiError(err);
    log.warn({
      message: 'ai.stream.chat.failed',
      providerDetails,
      errorString: err?.message || err?.toString?.(),
      reportId,
      userId
    });
    if (!res.headersSent) {
      res.status(502).json({ error: 'Failed to stream chat', providerDetails });
    } else {
      res.end();
    }
  }
});

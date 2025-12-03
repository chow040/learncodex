import { Router } from 'express';
import { getGenAiClient } from '../clients/genai.ts';
import { logger } from '../utils/logger.ts';
import { logAIFailure } from '../utils/aiLogger.ts';
import { requireAuth } from '../middleware/auth.ts';

const MODEL_NAME = 'gemini-3-pro-preview';

const describeGenAiError = (err: any) => {
  if (!err) return { providerMessage: 'unknown_error' };
  const providerMsg = err?.error?.message || err?.message || err?.toString?.() || 'unknown_error';
  const status = err?.error?.status || err?.status || err?.response?.status || null;
  const code = err?.error?.code || err?.code || null;
  const body = err?.response?.data || err?.error;
  return {
    providerMessage: providerMsg,
    providerStatus: status,
    providerCode: code,
    providerBody: typeof body === 'string' ? body : body ? JSON.stringify(body) : null
  };
};

export const aiStreamRouter = Router();

const streamText = async (res: any, iterable: AsyncIterable<string>) => {
  for await (const chunk of iterable) {
    res.write(chunk);
  }
  res.end();
};

aiStreamRouter.post('/ai/stream-report', async (req, res) => {
  const { ticker } = req.body || {};
  const log = req.log || logger;
  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ error: 'Ticker is required' });
  }

  const prompt = `
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

  let client;
  try {
    client = getGenAiClient();
  } catch (err: any) {
    return res.status(503).json({ error: err.message || 'AI client unavailable' });
  }

  try {
    const startedAt = Date.now();
    const stream = await client.models.generateContentStream({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    if (!stream) {
      throw new Error('Stream initialization failed');
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.removeHeader('Content-Length');
    res.flushHeaders();

    const iterable = {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of stream) {
          const c = chunk as any;
          const textPart = typeof c.text === 'function' ? c.text() : c.text;
          if (textPart) {
            yield textPart;
          }
        }
      }
    };

    await streamText(res, iterable as AsyncIterable<string>);

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

aiStreamRouter.post('/chat/stream', requireAuth, async (req, res) => {
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
    client = getGenAiClient();
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

  // 1. Normalize roles from DB (assistant -> model)
  const rawHistory = Array.isArray(messageHistory)
    ? messageHistory.slice(-12).map((m: any) => ({
        role: m?.role === 'assistant' ? 'model' : m?.role === 'user' ? 'user' : 'user',
        text: m?.text || ''
      }))
    : [];

  // 2. Build the initial System Message (as User)
  const systemMsgText = `System Context:\n${contextSummary}\n\n${systemInstruction}`;
  
  // 3. Construct the conversation with strict alternation enforcement
  // Start with the System Message
  const mergedContents: { role: string; parts: { text: string }[] }[] = [
    { role: 'user', parts: [{ text: systemMsgText }] }
  ];

  // Iterate through history and append, merging if role matches previous
  for (const msg of rawHistory) {
    const lastMsg = mergedContents[mergedContents.length - 1];
    
    if (lastMsg.role === msg.role) {
      // Merge with previous message to prevent User-User or Model-Model violation
      lastMsg.parts[0].text += `\n\n---\n\n${msg.text}`;
    } else {
      // Alternate role, push new message
      mergedContents.push({ role: msg.role, parts: [{ text: msg.text }] });
    }
  }

  // 4. Ensure the last message is NOT from the model (Gemini expects to respond to a User)
  // If the history ends with 'model', we must append a dummy user prompt or let the user know.
  // However, in a chat flow, the last message from frontend should be the User's new input.
  // If for some reason it ends with model, we append a "continue" prompt.
  if (mergedContents[mergedContents.length - 1].role === 'model') {
    mergedContents.push({ role: 'user', parts: [{ text: "Please continue." }] });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.removeHeader('Content-Length');
  res.flushHeaders();

  const writeFullText = async (text: string) => {
    res.write(text);
    res.end();
  };

  try {
    const stream = await client.models.generateContentStream({
      model: 'gemini-3-pro-preview',
      contents: mergedContents
    });

    const iterable = {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of stream) {
          const c = chunk as any;
          const textPart = typeof c.text === 'function' ? c.text() : c.text;
          if (textPart) {
            yield textPart;
          }
        }
      }
    };

    await streamText(res, iterable as AsyncIterable<string>);
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

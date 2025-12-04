import { Router } from 'express';
import { getGenAiClient } from '../clients/genai.js';
import { logger } from '../utils/logger.js';
import { requireAuth } from '../middleware/auth.js';

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
    body: typeof body === 'string' ? body : body ? JSON.stringify(body) : null
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

  let client;
  try {
    client = getGenAiClient();
  } catch (err: any) {
    return res.status(503).json({ error: err.message || 'AI client unavailable' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.removeHeader('Content-Length');
  res.flushHeaders();

  try {
    const stream = await client.models.generateContentStream({
      model: 'gemini-3-pro-preview',
      contents: [
        { role: 'user', parts: [{ text: `Generate a comprehensive equity research report JSON for ${ticker}. Include current price, financials, and technical analysis. Return ONLY valid JSON.` }] }
      ]
    });

    if (!stream) {
      throw new Error('Stream initialization failed');
    }

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
    log.error({ message: 'ai.stream.report.failed', err: describeGenAiError(err), ticker });
    if (!res.headersSent) {
      res.status(502).json({ error: 'Failed to stream report', providerDetails: describeGenAiError(err) });
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

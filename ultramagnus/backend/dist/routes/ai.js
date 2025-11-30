import { Router } from 'express';
import { getGenAiClient } from '../clients/genai.ts';
import { logger } from '../utils/logger.ts';
export const aiRouter = Router();
const ensureClient = () => {
    try {
        return getGenAiClient();
    }
    catch (err) {
        throw new Error('Gemini is not configured. Set GEMINI_API_KEY.');
    }
};
aiRouter.post('/reports', async (req, res) => {
    const log = req.log || logger;
    const { ticker } = req.body || {};
    if (!ticker || typeof ticker !== 'string') {
        return res.status(400).json({ error: 'Ticker is required.' });
    }
    let client;
    try {
        client = ensureClient();
    }
    catch (err) {
        return res.status(503).json({ error: err.message });
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
    try {
        const ai = client;
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });
        const text = response.text || '{}';
        let jsonStr = text.replace(/```json\n?|```/g, '');
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }
        let data;
        try {
            data = JSON.parse(jsonStr);
        }
        catch (err) {
            log.error({ message: 'ai.reports.parse_error', err, ticker });
            return res.status(500).json({ error: 'Failed to parse AI response.', correlationId: req.correlationId });
        }
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (groundingChunks) {
            const sources = groundingChunks
                .map((chunk) => (chunk.web?.uri ? { title: chunk.web.title || 'Source', uri: chunk.web.uri } : null))
                .filter(Boolean);
            if (sources.length > 0) {
                data.sources = sources;
            }
        }
        return res.json(data);
    }
    catch (err) {
        log.error({ message: 'ai.reports.generate_failed', err, ticker });
        return res.status(500).json({ error: err.message || 'Report generation failed.', correlationId: req.correlationId });
    }
});
aiRouter.post('/chat', async (req, res) => {
    const log = req.log || logger;
    const { report, messageHistory, userNotes, userThesis } = req.body || {};
    if (!report || !messageHistory) {
        return res.status(400).json({ error: 'Report and messageHistory are required.' });
    }
    let client;
    try {
        client = ensureClient();
    }
    catch (err) {
        return res.status(503).json({ error: err.message });
    }
    const contextSummary = `
    STOCK ANALYSIS CONTEXT:
    Company: ${report.companyName} (${report.ticker})
    Price: ${report.currentPrice} (${report.priceChange})
    Verdict: ${report.verdict}
    Rocket Score: ${report.rocketScore}/100
    Summary: ${report.summary}
    Bull Case: ${report.scenarioAnalysis?.bull?.price}
    Bear Case: ${report.scenarioAnalysis?.bear?.price}
    Short Term Factors: ${(report.shortTermFactors?.positive || []).map((f) => f.title).join(', ')}
    Risks: ${(report.shortTermFactors?.negative || []).map((f) => f.title).join(', ')}
    
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
    const contents = [
        { role: 'user', parts: [{ text: `System Context:\n${contextSummary}\n\n${systemInstruction}` }] },
        ...(Array.isArray(messageHistory)
            ? messageHistory.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
            : [])
    ];
    try {
        const ai = client;
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });
        const text = response.text || "I couldn't generate a response.";
        return res.json({ text });
    }
    catch (err) {
        log.error({ message: 'ai.chat.failed', err, ticker: report?.ticker || null });
        return res.status(500).json({ error: err.message || 'Chat failed.', correlationId: req.correlationId });
    }
});


import { GoogleGenAI } from "@google/genai";
import { EquityReport } from "../types";

// Helper to get the best available API key
const getApiKey = () => {
  const storedKey = localStorage.getItem('ultramagnus_user_api_key');
  return storedKey || process.env.API_KEY || '';
};

export const chatWithGemini = async (
  report: EquityReport, 
  messageHistory: { role: 'user' | 'model', text: string }[],
  userNotes?: string, 
  userThesis?: string
): Promise<string> => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return "API Key is missing. Please add your Gemini API Key in Settings.";
  }
  
  // Initialize AI with the specific key for this request to ensure it uses the latest
  const ai = new GoogleGenAI({ apiKey });

  const contextSummary = `
    STOCK ANALYSIS CONTEXT:
    Company: ${report.companyName} (${report.ticker})
    Price: ${report.currentPrice} (${report.priceChange})
    Verdict: ${report.verdict}
    Rocket Score: ${report.rocketScore}/100
    Summary: ${report.summary}
    Bull Case: ${report.scenarioAnalysis?.bull.price}
    Bear Case: ${report.scenarioAnalysis?.bear.price}
    Short Term Factors: ${report.shortTermFactors.positive.map(f => f.title).join(', ')}
    Risks: ${report.shortTermFactors.negative.map(f => f.title).join(', ')}
    
    USER'S NOTES (The user has written this in their scratchpad):
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

  // Map history to the API format
  const contents = [
    { role: 'user', parts: [{ text: `System Context:\n${contextSummary}\n\n${systemInstruction}` }] },
    ...messageHistory.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }))
  ];

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: contents,
      config: {
        tools: [{googleSearch: {}}],
      }
    });

    return response.text || "I couldn't generate a response.";
  } catch (error) {
    console.error("Chat Error:", error);
    return "Connection error. Please try again. If using a custom API key, ensure it is valid.";
  }
};

export const generateEquityReport = async (ticker: string, onChunk?: (text: string) => void): Promise<EquityReport> => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error("API Key is missing. Please add your Gemini API Key in Settings.");
  }
  
  // Initialize AI with the specific key for this request
  const ai = new GoogleGenAI({ apiKey });

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

  try {
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{googleSearch: {}}],
      }
    });

    let fullText = '';
    let allGroundingChunks: any[] = [];

    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        fullText += text;
        if (onChunk) onChunk(text);
      }
      const chunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        allGroundingChunks = [...allGroundingChunks, ...chunks];
      }
    }

    const text = fullText || "{}";
    
    // Robust extraction: Find the outer-most braces to ignore conversational intro/outro text
    let jsonStr = text.replace(/```json\n?|```/g, ''); // Strip markdown
    
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }
    
    let data;
    try {
        data = JSON.parse(jsonStr);
    } catch (e) {
        console.error("JSON Parse Error:", e, jsonStr);
        throw new Error("Failed to parse report data. The model response was not valid JSON.");
    }
    
    // Inject grounding sources if available
    if (allGroundingChunks.length > 0) {
      // Remove duplicates based on URI
      const uniqueSources = new Map();
      allGroundingChunks.forEach((chunk: any) => {
          if (chunk.web?.uri) {
              uniqueSources.set(chunk.web.uri, { title: chunk.web.title || "Source", uri: chunk.web.uri });
          }
      });
      
      const sources = Array.from(uniqueSources.values());
      if (sources.length > 0) {
        data.sources = sources;
      }
    }

    return data as EquityReport;

  } catch (error) {
    console.error("Report Generation Error:", error);
    throw new Error("Failed to generate report. Check your API key or try again.");
  }
};

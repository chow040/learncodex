import OpenAI from 'openai';

import { env } from '../config/env.js';

type RiskRating = 'low' | 'medium' | 'high';

export interface AssessmentInput {
  symbol: string;
  timeframe?: string;
  strategyFocus?: string;
  additionalContext?: string;
}

export interface AssessmentContext {
  profile?: {
    name: string;
    exchange: string;
    currency: string;
    marketCapitalization: number;
    shareOutstanding: number;
    ipo: string;
    weburl: string;
  };
  quote?: {
    current: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
    timestamp: number;
    currency: string;
  };
  metrics?: {
    pe: number | null;
    eps: number | null;
    revenueGrowth: number | null;
    operatingMargin: number | null;
    dividendYield: number | null;
    priceToFreeCashFlow: number | null;
    debtToEquity: number | null;
    earningsRevision: number | null;
  };
  news?: Array<{
    datetime: number;
    headline: string;
    summary: string;
    source: string;
    url: string;
  }>;
}

export interface AssessmentPayload {
  summary: string;
  riskRating: RiskRating;
  opportunities: string[];
  watchItems: string[];
  nextSteps: string[];
  rawText: string;
}

let cachedClient: OpenAI | null = null;

const getClient = (): OpenAI => {
  if (!env.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: env.openAiApiKey,
    });
  }

  return cachedClient;
};

export const getOpenAIClient = (): OpenAI => getClient();

const coerceJson = (text: string): string => {
  try {
    JSON.parse(text);
    return text;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start !== -1 && end !== -1 && end > start) {
      return text.slice(start, end + 1);
    }

    throw new Error('No JSON object found in OpenAI response.');
  }
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const formatNumber = (value: number | null | undefined, decimals = 2): string => {
  if (!isFiniteNumber(value ?? null)) {
    return 'N/A';
  }

  return (value as number).toFixed(decimals);
};

const formatPercent = (value: number | null | undefined, decimals = 1): string => {
  if (!isFiniteNumber(value ?? null)) {
    return 'N/A';
  }

  return `${((value as number) * 100).toFixed(decimals)}%`;
};

const formatDateFromUnix = (timestamp: number | null | undefined): string => {
  if (!timestamp) {
    return 'N/A';
  }

  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return date.toISOString();
};

const truncate = (text: string, max = 320): string =>
  text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;

const buildSupplementalContext = (context?: AssessmentContext): string | null => {
  if (!context) {
    return null;
  }

  const sections: string[] = [];

  if (context.quote) {
    const { quote } = context;
    const currency = quote.currency || 'USD';
    const priceLine = `Last price: ${formatNumber(quote.current)} ${currency} (Open ${formatNumber(quote.open)}, High ${formatNumber(quote.high)}, Low ${formatNumber(quote.low)}, Prev Close ${formatNumber(quote.previousClose)})`;
    const timestampLine = `Quote timestamp: ${formatDateFromUnix(quote.timestamp)}`;
    sections.push([priceLine, timestampLine].join('\n'));
  }

  if (context.metrics) {
    const { metrics } = context;
    const metricLines = [
      `P/E ratio: ${formatNumber(metrics.pe)}`,
      `EPS (TTM): ${formatNumber(metrics.eps)}`,
      `Revenue growth YoY: ${formatPercent(metrics.revenueGrowth)} (percentage already scaled)` ,
      `Operating margin: ${formatPercent(metrics.operatingMargin)} (percentage already scaled)` ,
      `Dividend yield: ${formatPercent(metrics.dividendYield)} (percentage already scaled)` ,
      `Price to free cash flow: ${formatNumber(metrics.priceToFreeCashFlow)}`,
      `Debt to equity: ${formatNumber(metrics.debtToEquity)}`,
      `Earnings revision trend: ${formatPercent(metrics.earningsRevision)} (percentage already scaled)` ,
    ];
    sections.push(`Key financial metrics (Finnhub Basic Financials):\n${metricLines.join('\n')}\nAll percentages above are already calculated—do not multiply or rescale them.`);
  }

  if (context.profile) {
    const { profile } = context;
    const profileLines = [
      `Company name: ${profile.name || 'Unknown'}`,
      `Exchange: ${profile.exchange || 'N/A'}`,
      `Market cap: ${formatNumber(profile.marketCapitalization, 0)} ${context.quote?.currency ?? profile.currency ?? 'USD'}`,
      `Shares outstanding: ${formatNumber(profile.shareOutstanding, 0)}`,
      `IPO date: ${profile.ipo || 'N/A'}`,
      profile.weburl ? `Website: ${profile.weburl}` : null,
    ].filter(Boolean) as string[];
    sections.push(`Company profile (Finnhub):\n${profileLines.join('\n')}`);
  }

  if (context.news?.length) {
    const sorted = [...context.news]
      .filter((article) => article.headline || article.summary)
      .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
      .slice(0, 8);

    if (sorted.length) {
      const newsLines = sorted.map((article) => {
        const date = formatDateFromUnix(article.datetime);
        const summary = article.summary ? truncate(article.summary, 220) : 'No summary provided.';
        const source = article.source ? `Source: ${article.source}` : 'Source unspecified';
        const url = article.url ? `Link: ${article.url}` : '';
        return `- ${date} | ${article.headline || 'Headline unavailable'} (${source})\n  ${summary}${url ? `\n  ${url}` : ''}`;
      });
      sections.push(`Recent company news (latest ${sorted.length} of ${context.news.length} fetched from Finnhub over the past year):\n${newsLines.join('\n')}`);
    }
  }

  if (sections.length === 0) {
    return null;
  }

  return sections.join('\n\n');
};

export const requestEquityAssessment = async (
  input: AssessmentInput,
  context?: AssessmentContext,
): Promise<{ assessment: AssessmentPayload; prompt: string; systemPrompt: string }> => {
  const client = getClient();
  const { symbol, timeframe, strategyFocus, additionalContext } = input;
  const supplementalContext = buildSupplementalContext(context);

  const userContentLines = [
    `Create an equity assessment for ${symbol}.`,
    `Timeframe: ${timeframe ?? 'not specified'}`,
    `Strategy focus: ${strategyFocus ?? 'general overview'}`,
    `Additional user context: ${additionalContext ?? 'n/a'}`,
  ];

  if (supplementalContext) {
    userContentLines.push('');
    userContentLines.push('Incorporate the following verified data from Finnhub into your assessment:');
    userContentLines.push(supplementalContext);
  }

  const systemPrompt = `You are an equity analyst who produces concise, actionable insights.
Respond only in JSON with the schema:
{
  "summary": string,
  "riskRating": "low" | "medium" | "high",
  "opportunities": string[],
  "watchItems": string[],
  "nextSteps": string[]
}`;
  const prompt = userContentLines.join('\n').trim();

  const response = await client.responses.create({
    model: env.openAiModel,
    input: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const responseText = response.output_text?.trim();
  if (!responseText) {
    throw new Error('Empty response received from OpenAI.');
  }

  const jsonPayload = coerceJson(responseText);

  try {
    const parsed = JSON.parse(jsonPayload) as Omit<AssessmentPayload, 'rawText'>;

    return {
      assessment: {
        ...parsed,
        rawText: responseText,
      } satisfies AssessmentPayload,
      prompt,
      systemPrompt,
    };
  } catch (error) {
    throw new Error(`Unable to parse OpenAI response: ${responseText}`);
  }
};












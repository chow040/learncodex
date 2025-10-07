import { env } from '../config/env.js';
import type { ResponseCreateParams } from 'openai/resources/responses/responses';
import { getOpenAIClient } from './openaiService.js';

type ResponseUsage = {
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
};

export interface ChartAnalysisInput {
  buffer: Buffer;
  mimeType: string;
  ticker?: string;
  timeframe?: string;
  notes?: string;
}

export type ChartAnalysisAnnotations = Record<string, unknown>;

export interface ChartAnalysisResult {
  rawText: string;
  sections: Record<string, string>;
  annotations: ChartAnalysisAnnotations | null;
  usage?: ResponseUsage;
}

const SUPPORTED_IMAGE_MIME_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_OUTPUT_TOKENS = 5_500;

const resolvedMaxImageBytes = Number.parseInt(
  process.env.CHART_ANALYSIS_MAX_IMAGE_BYTES ?? `${DEFAULT_MAX_IMAGE_BYTES}`,
  10,
);
export const MAX_CHART_IMAGE_BYTES = Number.isNaN(resolvedMaxImageBytes)
  ? DEFAULT_MAX_IMAGE_BYTES
  : resolvedMaxImageBytes;

export const SUPPORTED_CHART_IMAGE_MIME_TYPES = SUPPORTED_IMAGE_MIME_TYPES;

const resolvedMaxOutputTokens = Number.parseInt(
  process.env.CHART_ANALYSIS_MAX_OUTPUT_TOKENS ?? `${DEFAULT_MAX_OUTPUT_TOKENS}`,
  10,
);
const MAX_OUTPUT_TOKENS = Number.isNaN(resolvedMaxOutputTokens)
  ? DEFAULT_MAX_OUTPUT_TOKENS
  : resolvedMaxOutputTokens;

const temperatureConfig = process.env.CHART_ANALYSIS_TEMPERATURE;
const TEMPERATURE = temperatureConfig !== undefined
  ? Number.parseFloat(temperatureConfig)
  : undefined;

const technicalAnalystPersona = `Persona:
You are a professional swing trader specializing in technical analysis and price action trading.
Your goal is to analyze charts objectively and produce clear, concise, and executable trade assessments — like a professional trading desk note.

You focus on:
- Candlestick and chart pattern recognition
- Trend structure and momentum shifts
- Support / resistance
- Risk-reward balance and timing

You speak in decisive, trader-style language, not academic prose.
Use short, clear sentences. Avoid uncertainty unless warranted.
Emphasize what matters for trade execution (entry, stop, target).

Always prioritize capital preservation and risk control over prediction.
If there is no clear setup, write: No trade — setup unclear.`;

const analysisInstructions = `Follow these directives:

- Keep the narrative under 150 words total (excluding the JSON block).
- Stick to observable information from the chart. If indicators or volume are unclear, say so.
- Default to risk control.

Structure the markdown response with these exact headings, each separated by a blank line:

### Pattern(s)
Summarize notable candlestick or chart patterns. Mention formation stage if incomplete.

### Trend
State trend direction (uptrend / downtrend / consolidation) and whether momentum is strengthening or fading.

### Key Levels
List support and resistance zones that matter for execution.

### Volume / Indicator Confirmation
Highlight confirming or contradicting signals from visible volume or indicators (MA, RSI, MACD).

### Trade Plan
Lay out each line exactly once:
Direction: long / short / wait
Entry: price or range
Stop Loss: price
Take Profit: price or zone
Risk/Reward: ratio (e.g., 1:2)

### Bias Summary
Deliver a one-line bias such as, "Bias: Bullish continuation — buy breakout above 18.20 with stops below 17.60."

Finish with "### System JSON" on its own line followed by a valid JSON object for system use. The object must include keys for ticker, timeframe, trend, patterns (array), support_levels (array), resistance_levels (array), trade_plan (with direction, entry, stop_loss, take_profit, risk_reward_ratio), and bias_summary. Values must reflect the analysis and use numbers where appropriate. Do not wrap the JSON in prose.`;

const buildUserPrompt = (ticker?: string, timeframe?: string, notes?: string): string => {
  const promptLines = [
    `Analyze the attached candlestick chart for ticker ${ticker ?? 'N/A'} on the ${timeframe ?? 'unspecified'} timeframe.`,
    '',
    analysisInstructions,
  ];

  if (notes && notes.trim().length > 0) {
    promptLines.push('', `Trader notes: ${notes.trim()}`);
  }

  return promptLines.join('\n');
};

const toDataUrl = (buffer: Buffer, mimeType: string): string => {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
};

const parseSections = (text: string): Record<string, string> => {
  const sections: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentHeading) {
      sections[currentHeading] = currentLines.join('\n').trim();
    }
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = /^###\s+(.+)$/.exec(line.trim());
    if (headingMatch) {
      flush();
      const heading = headingMatch[1]?.trim();
      currentHeading = heading && heading.length > 0 ? heading : null;
      continue;
    }

    if (currentHeading) {
      currentLines.push(line);
    }
  }

  flush();
  return sections;
};

const extractAnnotations = (sections: Record<string, string>): ChartAnalysisAnnotations | null => {
  const annotationKey = Object.keys(sections).find((key) => key.toLowerCase().includes('annotation'));
  if (!annotationKey) {
    return null;
  }

  const payload = sections[annotationKey];
  if (!payload) {
    return null;
  }

  try {
    const trimmed = payload
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();

    if (!trimmed) {
      return null;
    }

    return JSON.parse(trimmed) as ChartAnalysisAnnotations;
  } catch (error) {
    console.warn('Failed to parse annotation JSON from chart analysis:', error);
    return null;
  }
};

export const analyzeChartImage = async (
  input: ChartAnalysisInput,
): Promise<ChartAnalysisResult> => {
  if (!SUPPORTED_CHART_IMAGE_MIME_TYPES.has(input.mimeType)) {
    throw new Error('Unsupported image format. Please upload PNG, JPEG, or WEBP charts.');
  }

  if (!input.buffer || input.buffer.length === 0) {
    throw new Error('Chart image is empty.');
  }

  if (input.buffer.length > MAX_CHART_IMAGE_BYTES) {
    const sizeMb = (MAX_CHART_IMAGE_BYTES / (1024 * 1024)).toFixed(1);
    throw new Error(`Chart image exceeds the maximum size of ${sizeMb} MB.`);
  }

  const client = getOpenAIClient();
  const dataUrl = toDataUrl(input.buffer, input.mimeType);
  const userPrompt = buildUserPrompt(input.ticker, input.timeframe, input.notes);

  const request: ResponseCreateParams = {
    model: env.openAiModel,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [
      {
        role: 'system',
        content: technicalAnalystPersona,
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: userPrompt },
          { type: 'input_image', image_url: dataUrl, detail: 'low' },
        ],
      },
    ],
  };

  if (typeof TEMPERATURE === 'number' && !Number.isNaN(TEMPERATURE)) {
    request.temperature = TEMPERATURE;
  }

  const response = await client.responses.create(request);

  const rawText = response.output_text?.trim();
  if (!rawText) {
    throw new Error('No analysis was produced for the uploaded chart.');
  }

  const sections = parseSections(rawText);
  const annotations = extractAnnotations(sections);

  const payload: ChartAnalysisResult = {
    rawText,
    sections,
    annotations,
  };

  if (response.usage) {
    const usage = response.usage as Record<string, any>;
    payload.usage = {
      total_tokens: usage.total_tokens,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      reasoning_tokens:
        usage.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens,
    };
  }

  return payload;
};


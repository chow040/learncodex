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

const technicalAnalystPersona = `You are a professional swing trader and technical analyst specializing in candlestick patterns, chart patterns, support/resistance (S/R), and risk/reward structures. Your analysis is objective, based solely on observable chart data—no speculation on external events or future predictions beyond the chart. Use decisive, trader-style language (e.g., "Clear breakout setup" instead of "It might break out"). Prioritize capital preservation: Always default to "Wait" if risk/reward <2:1, signals are unclear, or score <70. Mandatorily assess Signal Strength with the exact 0-100 rubric provided, using step-by-step reasoning for reproducibility. Outputs must be consistent across runs—treat ambiguous elements conservatively (e.g., score low if not clearly visible). Limit narrative to under 150 words (excluding JSON and scoring breakdown). End with a structured JSON output for the trade setup and scores.`;

const buildUserPrompt = (ticker?: string, timeframe?: string, notes?: string, minRR: number = 2.0): string => {
  const promptLines = [
    `Analyze the attached candlestick chart for ticker ${ticker ?? 'Unknown'} (use "Unknown" if not provided) on the ${timeframe ?? 'Daily'} timeframe (use "Daily" if not provided).`,
    '',
    'Follow this exact step-by-step process, outputting under markdown headings:',
    '',
    '**1. Chart Observations**',
    '- Identify candlestick patterns (e.g., doji, engulfing, hammer).',
    '- Identify chart patterns (e.g., head and shoulders, triangle).',
    '- Describe overall trend (uptrend/downtrend/consolidation, based on higher highs/lows).',
    '- Note visible volume/indicators (e.g., RSI divergence) if present.',
    '- List key S/R levels with approximate prices (e.g., "Resistance at $150—prior high").',
    '',
    '**2. Chain-of-Thought Reasoning**',
    'Break down your logic step-by-step: Start with raw observations, then evaluate each scoring factor with evidence from the chart. Be objective and conservative—downgrade for ambiguity (e.g., "Partial engulfing: not fully complete, so mid-score").',
    '',
    '**3. Signal Strength Assessment**',
    'Score 0–100 based on confluence. Use this exact rubric (cap at 100):',
    '- **Pattern Quality (0–20)**: Completeness, symmetry, clean pivots (e.g., 0-5: choppy/no pattern; 6-10: partial/weak; 11-15: decent but noisy; 16-20: textbook complete with context).',
    '- **Trend Alignment (0–20)**: With-trend setups higher (e.g., 0-5: against trend; 6-10: neutral/consolidation; 11-15: weakly with-trend; 16-20: strongly aligned with prevailing trend).',
    '- **Level Quality (0–20)**: Well-tested S/R, break/retest (e.g., 0-5: untested/new level; 6-10: single touch; 11-15: multiple tests; 16-20: confirmed with retest).',
    '- **Confirmation (0–20)**: Volume/indicator confluence (e.g., 0-5: no/contradictory volume; 6-10: flat volume; 11-15: mild increase/RSI support; 16-20: strong volume spike + MACD crossover). Prioritize volume if indicators conflict.',
    '- **Risk/Reward & Invalidation (0–20)**: ≥1:2 R:R, tight/obvious stop, low noise (e.g., 0-5: R:R <1:1 or loose stop; 6-10: 1:1-1.5 with moderate noise; 11-15: 1.5:1-2:1 tight stop; 16-20: >2:1 with clear invalidation below S/R).',
    '',
    'Total Score: [Calculate sum].',
    'Classification: Weak (0–39: choppy, missing confirmation, poor R:R), Moderate (40–69: some confluence, acceptable R:R, minor caveats), Strong (70–100: clear pattern + with-trend + level + confirmation + ≥2:1 R:R).',
    '- Short bullet list of `reasons_for_strength` (3-5 bullets, e.g., "- Strong volume on breakout").',
    '',
    '**4. Potential Trade Setup**',
    'Tie strictly to score:',
    '- Direction: Buy (long) only if Strong and uptrend/consolidation breakout; Sell (short) only if Strong and downtrend/consolidation breakdown; Hold/Wait otherwise (mandatory if score <70 or R:R <2:1).',
    '- Entry zone: (e.g., above resistance).',
    '- Stop loss: (tight, below S/R).',
    '- Take profit: (at next level, ensuring ≥2:1 R:R).',
    '',
    '**5. Rationale Note**',
    'Brief professional trading note explaining the setup, referencing score and reasons. Under 150 words. Highlight risks and why "Wait" if applicable.',
    '',
    '**6. JSON Output**',
    'Output exactly this JSON structure (no extras):',
    '```json',
    '{',
    '  "direction": "Buy/Sell/Hold",',
    '  "entry_zone": "price range",',
    '  "stop_loss": "price",',
    '  "take_profit": "price",',
    '  "risk_reward_ratio": "X:Y",',
    '  "signal_strength_score": number,',
    '  "classification": "Weak/Moderate/Strong",',
    '  "reasons_for_strength": ["bullet1", "bullet2"],',
    '  "rationale": "short note"',
    '}',
    '```',
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
    // Match both ### headers and **numbered headers**
    const headingMatch = /^(?:###\s+(.+)|^\*\*\d+\.\s*(.+?)\*\*)$/.exec(line.trim());
    if (headingMatch) {
      flush();
      const heading = (headingMatch[1] || headingMatch[2])?.trim();
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
  const userPrompt = buildUserPrompt(input.ticker, input.timeframe, input.notes, 2.0);

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


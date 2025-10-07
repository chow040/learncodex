import type { ResponseCreateParams } from 'openai/resources/responses/responses';
import path from 'path';
import fs from 'fs/promises';

import { env } from '../config/env.js';
import { getOpenAIClient } from './openaiService.js';

type ResponseUsage = {
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
};

export interface ChartDebateInput {
  buffer: Buffer;
  mimeType: string;
  ticker?: string;
  timeframe?: string;
  notes?: string;
}

export interface DebateTurn {
  role: 'agentA' | 'agentB' | 'referee';
  system: string;
  user: string | Array<{ type: 'input_text' } | { type: 'input_image'; image_url: string; detail?: 'low' | 'high' }>;
  output: string;
  usage?: ResponseUsage;
}

export interface ChartDebateResult {
  agentA: { rawText: string; sections: Record<string, string>; usage?: ResponseUsage };
  agentB: { rawText: string; sections: Record<string, string>; usage?: ResponseUsage };
  referee: {
    rawText: string;
    sections: Record<string, string>;
    consensusJson?: Record<string, unknown> | null;
    usage?: ResponseUsage;
  };
  logFile?: string;
}

const SUPPORTED_IMAGE_MIME_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const resolvedMaxImageBytes = Number.parseInt(
  process.env.CHART_ANALYSIS_MAX_IMAGE_BYTES ?? `${DEFAULT_MAX_IMAGE_BYTES}`,
  10,
);
export const MAX_CHART_DEBATE_IMAGE_BYTES = Number.isNaN(resolvedMaxImageBytes)
  ? DEFAULT_MAX_IMAGE_BYTES
  : resolvedMaxImageBytes;

const DEFAULT_MAX_OUTPUT_TOKENS = 5_500;
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

const extractSystemJson = (sections: Record<string, string>): Record<string, unknown> | null => {
  const key = Object.keys(sections).find((k) => k.toLowerCase().includes('system') && k.toLowerCase().includes('json'));
  if (!key) return null;
  const payload = sections[key]?.trim();
  if (!payload) return null;
  const trimmed = payload
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const agentAPersona = `You are Agent A: a professional swing trader and technical analyst specializing in candlestick patterns, chart patterns, S/R, and risk/reward. Be objective and decisive, using only information visible in the chart. Default to Wait if R:R < 2:1 or signals are unclear. Keep narrative under 150 words. End with a "System JSON" block as defined previously.`;

const agentBPersona = `You are Agent B: a seasoned risk manager. Your job is to challenge Agent A's chart-based proposal. Identify risks, unclear invalidation, poor R:R, alternative chart interpretations, missing confirmations, and execution pitfalls. Ask targeted questions only if needed; otherwise be concise. Conclude with a structured "Decision" (Proceed / Reduce Size / Wait) and explicit risk controls. Use markdown headings: \n\n### Risk Critique\n- Bulleted, concrete critique points\n\n### Questions\n- Only if essential to proceed; otherwise say None\n\n### Risk Controls\n- Stop placement, size guidance, invalidation criteria\n\n### Decision\n- One line: Proceed / Reduce Size / Wait and why.`;

const refereePersona = `You are the Referee: a pragmatic trading desk lead. Synthesize Agent A and Agent B into a consensus plan. If risk concerns invalidate the edge, choose Wait. If proceeding, refine entry, stop, targets to meet or exceed 2:1 R:R with clear invalidation. Output two parts:\n\n### Consensus Summary\nShort, decisive narrative (<=80 words).\n\n### System JSON\nA single JSON object consistent with the chart analysis schema (direction, entry, stop_loss, take_profit, risk_reward_ratio, signal_strength with score/class/reasons_for_strength, and bias_summary). Use conservative, realistic numbers.`;

export const analyzeChartDebate = async (input: ChartDebateInput): Promise<ChartDebateResult> => {
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(input.mimeType)) {
    throw new Error('Unsupported image format. Please upload PNG, JPEG, or WEBP charts.');
  }
  if (!input.buffer || input.buffer.length === 0) {
    throw new Error('Chart image is empty.');
  }
  if (input.buffer.length > MAX_CHART_DEBATE_IMAGE_BYTES) {
    const sizeMb = (MAX_CHART_DEBATE_IMAGE_BYTES / (1024 * 1024)).toFixed(1);
    throw new Error(`Chart image exceeds the maximum size of ${sizeMb} MB.`);
  }

  const client = getOpenAIClient();
  const dataUrl = toDataUrl(input.buffer, input.mimeType);
  const ticker = input.ticker ?? 'Unknown';
  const timeframe = input.timeframe ?? 'Daily';
  const notes = input.notes?.trim();

  const baseUserPrompt = [
    `Analyze the attached candlestick chart for ${ticker} on the ${timeframe} timeframe.`,
    notes ? `Trader notes: ${notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const debateTurns: DebateTurn[] = [];

  // Agent A
  const agentARequest: ResponseCreateParams = {
    model: env.openAiModel,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [
      { role: 'system', content: agentAPersona },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: baseUserPrompt },
          { type: 'input_image', image_url: dataUrl, detail: 'low' },
        ],
      },
    ],
  };
  if (typeof TEMPERATURE === 'number' && !Number.isNaN(TEMPERATURE)) {
    agentARequest.temperature = TEMPERATURE;
  }
  const agentAResp = await client.responses.create(agentARequest);
  const agentAText = agentAResp.output_text?.trim() || '';
  const agentASections = parseSections(agentAText);
  debateTurns.push({
    role: 'agentA',
    system: agentAPersona,
    user: [{ type: 'input_text' }, { type: 'input_image', image_url: dataUrl, detail: 'low' }],
    output: agentAText,
    usage: agentAResp.usage as ResponseUsage,
  });

  // Agent B (Risk Manager)
  const agentBUser = [
    `You will critique a swing trading plan produced from the same chart.`,
    '',
    '=== Agent A Proposal (verbatim) ===',
    agentAText,
    '',
    baseUserPrompt,
  ].join('\n');

  const agentBRequest: ResponseCreateParams = {
    model: env.openAiModel,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [
      { role: 'system', content: agentBPersona },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: agentBUser },
          { type: 'input_image', image_url: dataUrl, detail: 'low' },
        ],
      },
    ],
  };
  if (typeof TEMPERATURE === 'number' && !Number.isNaN(TEMPERATURE)) {
    agentBRequest.temperature = TEMPERATURE;
  }
  const agentBResp = await client.responses.create(agentBRequest);
  const agentBText = agentBResp.output_text?.trim() || '';
  const agentBSections = parseSections(agentBText);
  debateTurns.push({
    role: 'agentB',
    system: agentBPersona,
    user: [{ type: 'input_text' }, { type: 'input_image', image_url: dataUrl, detail: 'low' }],
    output: agentBText,
    usage: agentBResp.usage as ResponseUsage,
  });

  // Referee
  const refereeUser = [
    `Synthesize the two agents into a consensus plan for ${ticker} (${timeframe}).`,
    '',
    '=== Agent A (Swing Trader) ===',
    agentAText,
    '',
    '=== Agent B (Risk Manager) ===',
    agentBText,
  ].join('\n');

  const refereeRequest: ResponseCreateParams = {
    model: env.openAiModel,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [
      { role: 'system', content: refereePersona },
      { role: 'user', content: refereeUser },
    ],
  };
  if (typeof TEMPERATURE === 'number' && !Number.isNaN(TEMPERATURE)) {
    refereeRequest.temperature = TEMPERATURE;
  }
  const refereeResp = await client.responses.create(refereeRequest);
  const refereeText = refereeResp.output_text?.trim() || '';
  const refereeSections = parseSections(refereeText);
  const consensusJson = extractSystemJson(refereeSections);
  debateTurns.push({
    role: 'referee',
    system: refereePersona,
    user: [{ type: 'input_text' }],
    output: refereeText,
    usage: refereeResp.usage as ResponseUsage,
  });

  // Write log
  let logFile: string | undefined;
  try {
    const logsDir = path.resolve(process.cwd(), 'backend', 'logs');
    await fs.mkdir(logsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTicker = (ticker || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `chart_debate_${ts}_${safeTicker}_${Math.random().toString(36).slice(2, 8)}.json`;
    const filePath = path.join(logsDir, filename);
    const serializableTurns = debateTurns.map((t) => ({
      role: t.role,
      system: t.system,
      user: t.user,
      output: t.output,
      usage: t.usage ?? null,
    }));
    const out = {
      createdAt: new Date().toISOString(),
      ticker,
      timeframe,
      notes: notes ?? null,
      turns: serializableTurns,
      refereeConsensus: {
        sections: refereeSections,
        consensusJson: consensusJson ?? null,
      },
    };
    await fs.writeFile(filePath, JSON.stringify(out, null, 2), 'utf8');
    logFile = filePath;
  } catch {
    // ignore logging errors
  }

  return {
    agentA: {
      rawText: agentAText,
      sections: agentASections,
      usage: (agentAResp.usage as ResponseUsage) ?? undefined,
    },
    agentB: {
      rawText: agentBText,
      sections: agentBSections,
      usage: (agentBResp.usage as ResponseUsage) ?? undefined,
    },
    referee: {
      rawText: refereeText,
      sections: refereeSections,
      consensusJson,
      usage: (refereeResp.usage as ResponseUsage) ?? undefined,
    },
    logFile,
  };
};


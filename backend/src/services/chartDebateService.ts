import type { ResponseCreateParams } from 'openai/resources/responses/responses';
import path from 'path';
import fs from 'fs/promises';

import { env } from '../config/env.js';
import { getOpenAIClient } from './openaiService.js';
import type { DebateProgressEvent, DebateProgressStep } from './chartDebateProgress.js';

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
  // Optional: override default rounds (env-driven)
  agentARounds?: number; // total Agent A turns (>=1)
  agentBRounds?: number; // total Agent B turns (>=0)
}

export interface DebateTurn {
  role: 'agentA' | 'agentB' | 'referee';
  system: string;
  user: string | Array<{ type: 'input_text' } | { type: 'input_image'; image_url: string; detail?: 'low' | 'high' }>;
  output: string;
  usage?: ResponseUsage;
  round?: number; // for A/B iterative rounds
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

export const analyzeChartDebate = async (
  input: ChartDebateInput,
  progress?: (event: DebateProgressEvent) => void,
): Promise<ChartDebateResult> => {
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

  // Round configuration (defaults from env, overrides from input)
  const defaultARounds = Math.max(1, Number.isFinite(env.chartDebateARounds) ? env.chartDebateARounds : 1);
  const defaultBRounds = Math.max(0, Number.isFinite(env.chartDebateBRounds) ? env.chartDebateBRounds : 1);
  const aRounds = Math.max(1, input.agentARounds ?? defaultARounds);
  const bRounds = Math.max(0, input.agentBRounds ?? defaultBRounds);

  const baseUserPrompt = [
    `Analyze the attached candlestick chart for ${ticker} on the ${timeframe} timeframe.`,
    notes ? `Trader notes: ${notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const debateTurns: DebateTurn[] = [];
  const emittedSteps = new Set<DebateProgressStep>();
  const emitProgress = (step: DebateProgressStep, message: string): void => {
    if (!progress || emittedSteps.has(step)) {
      return;
    }
    emittedSteps.add(step);
    progress({ step, message });
  };

  emitProgress('trader_analyzing', 'Trader analyzing chart');

  // Agent A (initial)
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
  let agentAText = agentAResp.output_text?.trim() || '';
  let agentASections = parseSections(agentAText);
  debateTurns.push({
    role: 'agentA',
    system: agentAPersona,
    user: [{ type: 'input_text' }, { type: 'input_image', image_url: dataUrl, detail: 'low' }],
    output: agentAText,
    usage: agentAResp.usage as ResponseUsage,
    round: 1,
  });
  emitProgress('trader_to_risk_manager', 'Trader sent assessment to risk manager');
  
  // Iterative debate between B (critique) and A (revision)
  let lastBText = '';
  let lastBSections: Record<string, string> | null = null;
  let remainingA = Math.max(0, aRounds - 1); // we've already done A round 1
  let remainingB = bRounds;
  let aRoundIndex = 1;
  let bRoundIndex = 0;

  while (remainingB > 0 || remainingA > 0) {
    // B critiques latest A
    if (remainingB > 0) {
      emitProgress('risk_manager_reviewing', 'Risk manager reviewing trader assessment');
      const agentBUser = [
        `You will critique a swing trading plan produced from the same chart.`,
        '',
        '=== Latest Agent A Plan (verbatim) ===',
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
      lastBText = agentBResp.output_text?.trim() || '';
      lastBSections = parseSections(lastBText);
      bRoundIndex += 1;
      debateTurns.push({
        role: 'agentB',
        system: agentBPersona,
        user: [{ type: 'input_text' }, { type: 'input_image', image_url: dataUrl, detail: 'low' }],
        output: lastBText,
        usage: agentBResp.usage as ResponseUsage,
        round: bRoundIndex,
      });
      remainingB -= 1;
      emitProgress('risk_manager_feedback', 'Risk manager provided feedback to trader');
    }

    // A revises addressing B's critique
    if (remainingA > 0) {
      emitProgress('trader_reassessing', 'Trader reassessing chart with feedback');
      const agentAUser = [
        `Revise your swing trade plan based strictly on the chart and address the Risk Manager's critique below. Maintain objective, conservative tone. Ensure R:R ≥ 2:1, clear invalidation, and end with a System JSON block as before.`,
        '',
        '=== Risk Manager Critique (verbatim) ===',
        lastBText || 'None',
        '',
        baseUserPrompt,
      ].join('\n');

      const agentARebuttalRequest: ResponseCreateParams = {
        model: env.openAiModel,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        input: [
          { role: 'system', content: agentAPersona },
          {
            role: 'user',
            content: [
              { type: 'input_text', text: agentAUser },
              { type: 'input_image', image_url: dataUrl, detail: 'low' },
            ],
          },
        ],
      };
      if (typeof TEMPERATURE === 'number' && !Number.isNaN(TEMPERATURE)) {
        agentARebuttalRequest.temperature = TEMPERATURE;
      }
      const agentARebuttalResp = await client.responses.create(agentARebuttalRequest);
      agentAText = agentARebuttalResp.output_text?.trim() || '';
      agentASections = parseSections(agentAText);
      aRoundIndex += 1;
      debateTurns.push({
        role: 'agentA',
        system: agentAPersona,
        user: [{ type: 'input_text' }, { type: 'input_image', image_url: dataUrl, detail: 'low' }],
        output: agentAText,
        usage: agentARebuttalResp.usage as ResponseUsage,
        round: aRoundIndex,
      });
      remainingA -= 1;
    }
  }

  // Referee
  emitProgress('referee_merging', 'Referee merging final plan');
  const refereeUser = [
    `Synthesize the two agents into a consensus plan for ${ticker} (${timeframe}).`,
    '',
    '=== Final Agent A (Swing Trader) ===',
    agentAText,
    '',
    '=== Final Agent B (Risk Manager) ===',
    lastBText || 'No separate critique provided.',
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
    const configuredDir = env.chartDebateLogDir?.trim();
    const logsDir = configuredDir && configuredDir.length > 0
      ? path.resolve(configuredDir)
      : path.resolve(process.cwd(), 'backend', 'chartlogs');
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
    agentA: (() => {
      const lastAUsage = debateTurns.filter(t => t.role === 'agentA').slice(-1)[0]?.usage;
      return {
        rawText: agentAText,
        sections: agentASections,
        ...(lastAUsage ? { usage: lastAUsage } as { usage?: ResponseUsage } : {}),
      };
    })(),
    agentB: (() => {
      const lastBUsage = debateTurns.filter(t => t.role === 'agentB').slice(-1)[0]?.usage;
      return {
        rawText: lastBText,
        sections: lastBSections ?? {},
        ...(lastBUsage ? { usage: lastBUsage } as { usage?: ResponseUsage } : {}),
      };
    })(),
    referee: {
      rawText: refereeText,
      sections: refereeSections,
      consensusJson,
      ...(refereeResp.usage ? { usage: refereeResp.usage as ResponseUsage } : {}),
    },
    ...(logFile ? { logFile } as { logFile?: string } : {}),
  };
};

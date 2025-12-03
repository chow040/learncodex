import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.resolve(__dirname, '..', '..', 'logs');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const aiLogFile = path.join(logDir, 'ai_failures.jsonl');

interface AIFailureContext {
  operation: string;
  model?: string;
  ticker?: string;
  reportId?: string;
  userId?: string;
  correlationId?: string;
  promptLength?: number;
  promptPreview?: string;
  historyLength?: number;
  rawResponse?: string;
  providerStatus?: number | string | null;
  providerCode?: string | number | null;
  providerMessage?: string | null;
  providerBody?: string | null;
  durationMs?: number;
  error?: any;
  extra?: Record<string, unknown>;
}

const truncate = (value: string | undefined | null, max = 4000) => {
  if (!value) return value;
  return value.length > max ? `${value.slice(0, max)}...[truncated ${value.length - max}]` : value;
};

export const logAIFailure = (context: AIFailureContext) => {
  const errorObj = context.error instanceof Error ? context.error : null;

  const entry = {
    timestamp: new Date().toISOString(),
    operation: context.operation,
    model: context.model,
    ticker: context.ticker,
    reportId: context.reportId,
    userId: context.userId,
    correlationId: context.correlationId,
    promptLength: context.promptLength,
    promptPreview: truncate(context.promptPreview),
    historyLength: context.historyLength,
    rawResponse: truncate(context.rawResponse),
    providerStatus: context.providerStatus,
    providerCode: context.providerCode,
    providerMessage: context.providerMessage,
    providerBody: truncate(context.providerBody),
    durationMs: context.durationMs,
    errorName: errorObj?.name,
    errorMessage: errorObj?.message || (typeof context.error === 'string' ? context.error : undefined),
    errorStack: errorObj?.stack,
    errorCause: (errorObj as any)?.cause ? String((errorObj as any).cause) : undefined,
    extra: context.extra
  };

  const line = JSON.stringify(entry) + '\n';

  try {
    fs.appendFileSync(aiLogFile, line, 'utf8');
  } catch (err) {
    console.error('Failed to write to AI failure log:', err);
  }
};

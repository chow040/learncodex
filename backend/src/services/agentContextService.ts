import { and, desc, eq } from 'drizzle-orm';

import { db } from '../db/client.js';
import { agentRuns } from '../db/schema.js';
import type { AgentContextPolicyConfig } from '../types/adminDashboard.js';
import type { AgentRunSummary } from '../types/tradingAgentsUser.js';

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
};

export const mapAgentRunRow = (row: typeof agentRuns.$inferSelect): AgentRunSummary => ({
  id: row.id,
  agentId: row.agentId,
  userId: row.userId ?? null,
  tickers: Array.isArray(row.tickers) ? [...row.tickers] : [],
  question: row.question ?? null,
  status: row.status,
  decisionSummary: row.decisionSummary ?? null,
  confidence: row.confidence ?? null,
  tokensPrompt: row.tokensPrompt ?? null,
  tokensCompletion: row.tokensCompletion ?? null,
  tokensTotal: row.tokensTotal ?? null,
  createdAt: toIsoString(row.createdAt),
  updatedAt: toIsoString(row.updatedAt),
});

const approximateTokenLimit = (maxTokens?: number | null): number => {
  if (!maxTokens || maxTokens <= 0) return 0;
  return maxTokens * 4;
};

const summarizeRun = (run: AgentRunSummary): string => {
  const lines = [
    `Run at ${run.createdAt}`,
    `Tickers: ${run.tickers.join(', ')}`,
    `Decision: ${run.decisionSummary ?? 'Pending'}`,
  ];
  if (run.question) {
    lines.push(`Question: ${run.question}`);
  }
  return lines.join('\n');
};

export interface ContextBlockResult {
  contextBlock?: string;
  runsIncluded: AgentRunSummary[];
}

export const buildContextBlockForAgent = async (
  agentId: string,
  userId: string,
  policy: AgentContextPolicyConfig | null | undefined,
): Promise<ContextBlockResult> => {
  if (!db || !policy || !policy.includePreviousAnalyses) {
    return { runsIncluded: [] };
  }

  const limit = Math.max(1, Math.min(policy.maxAnalyses ?? 3, 10));
  const rows = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.agentId, agentId), eq(agentRuns.userId, userId)))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit);

  if (!rows.length) {
    return { runsIncluded: [] };
  }

  const summaries = rows.map(mapAgentRunRow);
  const charLimit = approximateTokenLimit(policy.maxContextTokens ?? 500);
  const lines: string[] = ['## Historical Context'];
  let totalChars = 0;
  for (const summary of summaries) {
    const block = summarizeRun(summary);
    totalChars += block.length;
    if (charLimit > 0 && totalChars > charLimit) {
      break;
    }
    lines.push(block, '');
  }

  const result: ContextBlockResult = { runsIncluded: summaries };
  const contextText = lines.join('\n').trim();
  if (contextText) {
    result.contextBlock = contextText;
  }
  return result;
};

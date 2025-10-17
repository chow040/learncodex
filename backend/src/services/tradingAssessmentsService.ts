import { DEFAULT_TRADING_ANALYSTS } from '../constants/tradingAgents.js';
import type { TradingAnalystId } from '../constants/tradingAgents.js';
import {
  fetchTradingAssessmentByRunId,
  fetchTradingAssessmentsBySymbol,
  type FetchTradingAssessmentsOptions,
  type TradingAssessmentDetailRow,
  type TradingAssessmentSummaryRow,
} from '../db/taDecisionRepository.js';
import type { TradingAgentsPayload } from '../taEngine/types.js';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export interface TradingAssessmentsQueryOptions extends FetchTradingAssessmentsOptions {}

export interface TradingAssessmentSummary {
  runId: string;
  symbol: string;
  tradeDate: string;
  decision: string | null;
  modelId: string | null;
  analysts: TradingAnalystId[];
  createdAt: string;
  orchestratorVersion: string | null;
}

export interface TradingAssessmentsResult {
  items: TradingAssessmentSummary[];
  nextCursor?: string;
}

export interface TradingAssessmentDetail extends TradingAssessmentSummary {
  payload: TradingAgentsPayload | null;
  rawText: string | null;
  promptHash: string | null;
  logsPath: string | null;
}

const normalizeLimit = (limit?: number): number => {
  if (!limit) return DEFAULT_LIMIT;
  if (Number.isNaN(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
};

const normalizeAnalysts = (analysts?: TradingAnalystId[]): TradingAnalystId[] => {
  if (!analysts || analysts.length === 0) {
    return [...DEFAULT_TRADING_ANALYSTS];
  }
  return analysts;
};

const mapSummaryRow = (row: TradingAssessmentSummaryRow): TradingAssessmentSummary => ({
  runId: row.runId,
  symbol: row.symbol,
  tradeDate: row.tradeDate,
  decision: row.decisionToken,
  modelId: row.modelId,
  analysts: normalizeAnalysts(row.analysts),
  createdAt: row.createdAt,
  orchestratorVersion: row.orchestratorVersion ?? null,
});

const mapDetailRow = (row: TradingAssessmentDetailRow): TradingAssessmentDetail => ({
  ...mapSummaryRow(row),
  payload: row.payload,
  rawText: row.rawText,
  promptHash: row.promptHash,
  logsPath: row.logsPath,
});

export const getTradingAssessments = async (
  symbol: string,
  options: TradingAssessmentsQueryOptions = {},
): Promise<TradingAssessmentsResult> => {
  const normalizedLimit = normalizeLimit(options.limit);
  const repositoryOptions: FetchTradingAssessmentsOptions = {
    limit: normalizedLimit,
    ...(options.cursor ? { cursor: options.cursor } : {}),
  };
  const { items, nextCursor } = await fetchTradingAssessmentsBySymbol(symbol, repositoryOptions);
  return {
    items: items.map(mapSummaryRow),
    ...(nextCursor ? { nextCursor } : {}),
  };
};

export const getTradingAssessmentByRunId = async (
  runId: string,
): Promise<TradingAssessmentDetail | null> => {
  const row = await fetchTradingAssessmentByRunId(runId);
  if (!row) return null;
  return mapDetailRow(row);
};

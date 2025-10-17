import { Pool } from 'pg';
import { env } from '../config/env.js';
import { isTradingAnalystId } from '../constants/tradingAgents.js';
import type { TradingAnalystId } from '../constants/tradingAgents.js';
import type { TradingAgentsDecision, TradingAgentsPayload } from '../taEngine/types.js';

let pool: Pool | null = null;

const getPool = (): Pool | null => {
  if (!env.databaseUrl) return null;
  if (!pool) {
    pool = new Pool({ connectionString: env.databaseUrl, max: 5 });
    pool.on('error', (err) => console.error('[taDecisionRepository] PG pool error', err));
  }
  return pool;
};

export interface InsertTaDecisionInput {
  decision: TradingAgentsDecision;
  payload: TradingAgentsPayload;
  runId?: string;
  model?: string;
  promptHash?: string;
  orchestratorVersion?: string;
  logsPath?: string | null;
  rawText?: string | null;
  analysts?: TradingAnalystId[];
}

export interface TradingAssessmentSummaryRow {
  runId: string;
  symbol: string;
  tradeDate: string;
  decisionToken: string | null;
  modelId: string | null;
  analysts?: TradingAnalystId[];
  createdAt: string;
  orchestratorVersion: string | null;
}

export interface TradingAssessmentDetailRow extends TradingAssessmentSummaryRow {
  payload: TradingAgentsPayload | null;
  rawText: string | null;
  promptHash: string | null;
  logsPath: string | null;
}

export interface FetchTradingAssessmentsOptions {
  limit?: number;
  cursor?: string;
}

const parseAnalystsColumn = (value: unknown): TradingAnalystId[] | undefined => {
  if (!value) return undefined;
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        })()
      : null;
  if (!source) return undefined;
  const analysts = source.filter((entry): entry is TradingAnalystId => isTradingAnalystId(entry));
  return analysts.length > 0 ? analysts : undefined;
};

const toIsoDate = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value;
  return '';
};

const toIsoTimestamp = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return '';
};

const parseDecisionPayload = (value: unknown): TradingAgentsPayload | null => {
  if (!value) return null;
  const source =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return null;
          }
        })()
      : value;
  if (!source || typeof source !== 'object') return null;
  if ('payload' in source && typeof (source as { payload?: unknown }).payload === 'object') {
    return (source as { payload: TradingAgentsPayload }).payload ?? null;
  }
  return source as TradingAgentsPayload;
};

export const insertTaDecision = async (input: InsertTaDecisionInput): Promise<void> => {
  const pg = getPool();
  if (!pg) return; // DB optional; skip if not configured

  const runId = input.runId ?? Math.random().toString(36).slice(2, 12);
  const tradeDate = input.decision.tradeDate || new Date().toISOString().slice(0, 10);

  // Insert into ta_runs (best effort)
  try {
    await pg.query(
      `INSERT INTO ta_runs (run_id, symbol, trade_date, model, analysts, prompt_hash, orchestrator_version, logs_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (run_id) DO NOTHING`,
      [
        runId,
        input.decision.symbol,
        tradeDate,
        input.model ?? null,
        input.analysts ? JSON.stringify(input.analysts) : null,
        input.promptHash ?? null,
        input.orchestratorVersion ?? null,
        input.logsPath ?? null,
      ],
    );
  } catch (err) {
    console.warn('[taDecisionRepository] ta_runs insert failed (will continue):', (err as Error).message);
  }

  // Insert into ta_decisions (required for this feature)
  try {
    await pg.query(
      `INSERT INTO ta_decisions (
         run_id, symbol, trade_date, decision_token,
         investment_plan, trader_plan, risk_judge, payload, raw_text, model, analysts, prompt_hash, orchestrator_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        runId,
        input.decision.symbol,
        tradeDate,
        input.decision.finalTradeDecision ?? input.decision.decision,
        input.decision.investmentPlan ?? null,
        input.decision.traderPlan ?? null,
        input.decision.riskJudge ?? null,
        JSON.stringify({ payload: input.payload }),
        input.rawText ?? null,
        input.model ?? null,
        input.analysts ? JSON.stringify(input.analysts) : null,
        input.promptHash ?? null,
        input.orchestratorVersion ?? null,
      ],
    );
  } catch (err) {
    console.error('[taDecisionRepository] Failed to insert ta_decisions row', err);
  }
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

export const fetchTradingAssessmentsBySymbol = async (
  symbol: string,
  options: FetchTradingAssessmentsOptions = {},
): Promise<{ items: TradingAssessmentSummaryRow[]; nextCursor?: string }> => {
  const pg = getPool();
  if (!pg) return { items: [] };

  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
  const params: Array<string | number | Date> = [symbol];
  let cursorClause = '';
  if (options.cursor) {
    const cursorDate = new Date(options.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      params.push(cursorDate);
      cursorClause = `AND created_at < $${params.length}`;
    }
  }
  params.push(limit + 1);
  const limitParamIndex = params.length;

  const query = `
    SELECT run_id, symbol, trade_date, decision_token, model, analysts, created_at, orchestrator_version
    FROM ta_decisions
    WHERE symbol = $1
      AND run_id IS NOT NULL
      ${cursorClause}
    ORDER BY created_at DESC
    LIMIT $${limitParamIndex}
  `;

  const { rows } = await pg.query(query, params);
  const summaries: TradingAssessmentSummaryRow[] = [];

  for (const row of rows.slice(0, limit)) {
    const analysts = parseAnalystsColumn(row.analysts);
    const summary: TradingAssessmentSummaryRow = {
      runId: row.run_id,
      symbol: row.symbol,
      tradeDate: toIsoDate(row.trade_date),
      decisionToken: row.decision_token ?? null,
      modelId: row.model ?? null,
      createdAt: toIsoTimestamp(row.created_at),
      orchestratorVersion: row.orchestrator_version ?? null,
      ...(analysts ? { analysts } : {}),
    };
    summaries.push(summary);
  }

  const lastSummary = summaries.at(-1);
  const nextCursor = rows.length > limit && lastSummary ? lastSummary.createdAt : undefined;

  return {
    items: summaries,
    ...(nextCursor ? { nextCursor } : {}),
  };
};

export const fetchTradingAssessmentByRunId = async (
  runId: string,
): Promise<TradingAssessmentDetailRow | null> => {
  const pg = getPool();
  if (!pg) return null;

  const query = `
    SELECT
      d.run_id,
      d.symbol,
      d.trade_date,
      d.decision_token,
      d.model,
      d.analysts,
      d.payload,
      d.raw_text,
      d.created_at,
      d.orchestrator_version,
      d.prompt_hash,
      r.logs_path,
      COALESCE(r.orchestrator_version, d.orchestrator_version) AS combined_orchestrator_version
    FROM ta_decisions d
    LEFT JOIN ta_runs r ON r.run_id = d.run_id
    WHERE d.run_id = $1
    ORDER BY d.created_at DESC
    LIMIT 1
  `;

  const { rows } = await pg.query(query, [runId]);
  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const analysts = parseAnalystsColumn(row.analysts);
  return {
    runId: row.run_id,
    symbol: row.symbol,
    tradeDate: toIsoDate(row.trade_date),
    decisionToken: row.decision_token ?? null,
    modelId: row.model ?? null,
    createdAt: toIsoTimestamp(row.created_at),
    orchestratorVersion: row.combined_orchestrator_version ?? null,
    payload: parseDecisionPayload(row.payload),
    rawText: row.raw_text ?? null,
    promptHash: row.prompt_hash ?? null,
    logsPath: row.logs_path ?? null,
    ...(analysts ? { analysts } : {}),
  };
};

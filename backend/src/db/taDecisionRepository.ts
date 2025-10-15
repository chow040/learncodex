import { Pool } from 'pg';
import { env } from '../config/env.js';
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
}

export const insertTaDecision = async (input: InsertTaDecisionInput): Promise<void> => {
  const pg = getPool();
  if (!pg) return; // DB optional; skip if not configured

  const runId = input.runId ?? Math.random().toString(36).slice(2, 12);
  const tradeDate = input.decision.tradeDate || new Date().toISOString().slice(0, 10);

  // Insert into ta_runs (best effort)
  try {
    await pg.query(
      `INSERT INTO ta_runs (run_id, symbol, trade_date, model, prompt_hash, orchestrator_version, logs_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (run_id) DO NOTHING`,
      [
        runId,
        input.decision.symbol,
        tradeDate,
        input.model ?? null,
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
         investment_plan, trader_plan, risk_judge, payload, raw_text, model, prompt_hash, orchestrator_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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


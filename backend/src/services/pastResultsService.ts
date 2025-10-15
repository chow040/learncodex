import { Pool } from 'pg';
import { env } from '../config/env.js';

let pool: Pool | null = null;

const getPool = (): Pool => {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL not set');
  }
  if (!pool) {
    pool = new Pool({ connectionString: env.databaseUrl, max: 3 });
    pool.on('error', (e) => console.error('[pastResultsService] PG pool error', e));
  }
  return pool;
};

const iso = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.toISOString().slice(0, 10);
  return y;
};

const truncate = (s: string | null | undefined, n = 180): string => {
  const v = (s ?? '').trim();
  if (!v) return '';
  return v.length <= n ? v : v.slice(0, n).trimEnd() + '…';
};

export interface RoleSummaries {
  manager: string;
  trader: string;
  risk: string;
}

export async function getRoleSummaries(
  symbol: string,
  cutoffDate?: string | Date,
  limit = env.pastResultsMaxEntries,
): Promise<RoleSummaries> {
  const pg = getPool();
  const cutoff = cutoffDate ? new Date(cutoffDate) : new Date();

  const { rows } = await pg.query(
    `SELECT symbol, trade_date, decision_token, investment_plan, trader_plan, risk_judge
     FROM ta_decisions
     WHERE symbol = $1 AND trade_date <= $2
     ORDER BY trade_date DESC, created_at DESC
     LIMIT $3`,
    [symbol, iso(cutoff), Math.max(1, limit)],
  );

  const managerLines: string[] = [];
  const traderLines: string[] = [];
  const riskLines: string[] = [];

  for (const r of rows) {
    const date = iso(r.trade_date);
    if (r.investment_plan) {
      managerLines.push(`${date} Decision: ${r.decision_token} | ${truncate(r.investment_plan)}`);
    }
    if (r.trader_plan) {
      traderLines.push(`${date} Trader: ${truncate(r.trader_plan)}`);
    }
    if (r.risk_judge) {
      riskLines.push(`${date} Risk: ${truncate(r.risk_judge)} | Decision: ${r.decision_token}`);
    }
  }

  const manager = managerLines.join('\n');
  const trader = traderLines.join('\n');
  const risk = riskLines.join('\n');

  return { manager, trader, risk };
}


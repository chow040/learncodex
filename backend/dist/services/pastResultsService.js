import { Pool } from 'pg';
import { env } from '../config/env.js';
let pool = null;
const getPool = () => {
    if (!env.databaseUrl) {
        throw new Error('DATABASE_URL not set');
    }
    if (!pool) {
        pool = new Pool({ connectionString: env.databaseUrl, max: 3 });
        pool.on('error', (e) => console.error('[pastResultsService] PG pool error', e));
    }
    return pool;
};
const iso = (date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const y = d.toISOString().slice(0, 10);
    return y;
};
const truncate = (s, n = 180) => {
    const v = (s ?? '').trim();
    if (!v)
        return '';
    return v.length <= n ? v : v.slice(0, n).trimEnd() + '…';
};
export async function getRoleSummaries(symbol, cutoffDate, limit = env.pastResultsMaxEntries) {
    const pg = getPool();
    const cutoff = cutoffDate ? new Date(cutoffDate) : new Date();
    const { rows } = await pg.query(`SELECT symbol, trade_date, decision_token, investment_plan, trader_plan, risk_judge
     FROM ta_decisions
     WHERE symbol = $1 AND trade_date <= $2
     ORDER BY trade_date DESC, created_at DESC
     LIMIT $3`, [symbol, iso(cutoff), Math.max(1, limit)]);
    const managerLines = [];
    const traderLines = [];
    const riskLines = [];
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
//# sourceMappingURL=pastResultsService.js.map
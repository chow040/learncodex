import { DEFAULT_TRADING_ANALYSTS } from '../constants/tradingAgents.js';
import { fetchTradingAssessmentByRunId, fetchTradingAssessmentsBySymbol, } from '../db/taDecisionRepository.js';
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const normalizeLimit = (limit) => {
    if (!limit)
        return DEFAULT_LIMIT;
    if (Number.isNaN(limit) || limit <= 0)
        return DEFAULT_LIMIT;
    return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
};
const normalizeAnalysts = (analysts) => {
    if (!analysts || analysts.length === 0) {
        return [...DEFAULT_TRADING_ANALYSTS];
    }
    return analysts;
};
const ANALYST_REPORT_FIELDS = [
    { role: 'fundamental', field: 'fundamentalsReport' },
    { role: 'market', field: 'marketReport' },
    { role: 'news', field: 'newsReport' },
    { role: 'social', field: 'sentimentReport' },
];
const buildAnalystAssessments = (row) => ANALYST_REPORT_FIELDS.map(({ role, field }) => ({
    role,
    content: typeof row[field] === 'string' ? row[field] : row[field] ?? null,
}));
const mapSummaryRow = (row) => ({
    runId: row.runId,
    symbol: row.symbol,
    tradeDate: row.tradeDate,
    decision: row.decisionToken,
    modelId: row.modelId,
    analysts: normalizeAnalysts(row.analysts),
    createdAt: row.createdAt,
    orchestratorVersion: row.orchestratorVersion ?? null,
    executionMs: row.executionMs ?? null,
});
const mapDetailRow = (row) => ({
    ...mapSummaryRow(row),
    payload: row.payload,
    rawText: row.rawText,
    promptHash: row.promptHash,
    logsPath: row.logsPath,
    traderPlan: row.traderPlan,
    investmentPlan: row.investmentPlan,
    riskJudge: row.riskJudge,
    investmentDebate: row.investmentDebate ?? null,
    bullArgument: row.bullArgument ?? null,
    bearArgument: row.bearArgument ?? null,
    aggressiveArgument: row.aggressiveArgument ?? null,
    conservativeArgument: row.conservativeArgument ?? null,
    neutralArgument: row.neutralArgument ?? null,
    riskDebate: row.riskDebate ?? null,
    fundamentalsReport: row.fundamentalsReport ?? null,
    marketReport: row.marketReport ?? null,
    newsReport: row.newsReport ?? null,
    sentimentReport: row.sentimentReport ?? null,
    analystAssessments: buildAnalystAssessments(row),
});
export const getTradingAssessments = async (symbol, options = {}) => {
    const normalizedLimit = normalizeLimit(options.limit);
    const repositoryOptions = {
        limit: normalizedLimit,
        ...(options.cursor ? { cursor: options.cursor } : {}),
    };
    const { items, nextCursor } = await fetchTradingAssessmentsBySymbol(symbol, repositoryOptions);
    return {
        items: items.map(mapSummaryRow),
        ...(nextCursor ? { nextCursor } : {}),
    };
};
export const getTradingAssessmentByRunId = async (runId) => {
    const row = await fetchTradingAssessmentByRunId(runId);
    if (!row)
        return null;
    return mapDetailRow(row);
};
//# sourceMappingURL=tradingAssessmentsService.js.map
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
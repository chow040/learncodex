import { eq, inArray } from "drizzle-orm";
import { db } from "./client.js";
import { autoPortfolios, portfolioPositions, autotradeEvents, llmDecisionLogs, llmPromptPayloads, } from "./schema.js";
const toNumber = (value, fallback = 0) => {
    if (value === null || value === undefined)
        return fallback;
    if (typeof value === "number")
        return Number.isFinite(value) ? value : fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toNullableNumber = (value) => {
    if (value === null || value === undefined)
        return null;
    const parsed = toNumber(value, NaN);
    return Number.isFinite(parsed) ? parsed : null;
};
const toIsoString = (value) => {
    if (!value)
        return undefined;
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === "string")
        return value;
    return undefined;
};
const mapPositionRow = (row) => {
    const exitPlanRaw = row.exitPlan && typeof row.exitPlan === "object" ? row.exitPlan : {};
    return {
        symbol: row.symbol,
        quantity: toNumber(row.quantity),
        entryPrice: toNumber(row.avgCost),
        markPrice: toNumber(row.markPrice),
        leverage: toNumber(row.leverage, 0),
        pnl: toNumber(row.unrealizedPnl, 0),
        pnlPct: toNumber(row.unrealizedPnl, 0) !== 0 && toNumber(row.avgCost) !== 0
            ? (toNumber(row.unrealizedPnl, 0) / Math.max(toNumber(row.avgCost) * Math.max(toNumber(row.quantity), 1e-9), 1e-9)) * 100
            : 0,
        confidence: toNumber(row.confidence, 0),
        exitPlan: {
            profitTarget: toNumber(exitPlanRaw.profitTarget, toNumber(row.markPrice)),
            stopLoss: toNumber(exitPlanRaw.stopLoss, toNumber(row.markPrice)),
            invalidation: String(exitPlanRaw.invalidation ?? ""),
        },
    };
};
const mapEventRow = (row) => ({
    id: row.id,
    label: typeof row.payload?.label === "string" ? row.payload.label : row.eventType,
    timestamp: toIsoString(row.createdAt) ?? new Date().toISOString(),
});
const assembleDecision = (row, promptMap) => {
    const prompt = promptMap.get(row.promptRef ?? "");
    const cot = promptMap.get(row.cotRef ?? "");
    return {
        id: row.id,
        symbol: row.symbol,
        action: (row.action?.toLowerCase?.() ?? row.action ?? "hold"),
        sizePct: toNumber(row.sizePct, 0),
        confidence: toNumber(row.confidence, 0),
        rationale: row.rationale ?? "",
        createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
        prompt: {
            systemPrompt: prompt?.storageUri ?? "",
            userPayload: prompt?.storageUri ?? "",
            chainOfThought: cot?.storageUri ?? "",
            invalidations: [],
            observationWindow: "PT5M",
        },
    };
};
export const getLatestAutoTradePortfolio = async () => {
    if (!db)
        return null;
    const [portfolioRow] = await db.select().from(autoPortfolios).orderBy(autoPortfolios.updatedAt).limit(1);
    if (!portfolioRow) {
        return null;
    }
    const positionsRows = await db
        .select()
        .from(portfolioPositions)
        .where(eq(portfolioPositions.portfolioId, portfolioRow.id));
    const eventsRows = await db
        .select()
        .from(autotradeEvents)
        .where(eq(autotradeEvents.portfolioId, portfolioRow.id))
        .orderBy(autotradeEvents.createdAt);
    const decisionRows = await db
        .select()
        .from(llmDecisionLogs)
        .where(eq(llmDecisionLogs.portfolioId, portfolioRow.id))
        .orderBy(llmDecisionLogs.createdAt);
    const promptIds = new Set();
    for (const row of decisionRows) {
        if (row.promptRef)
            promptIds.add(row.promptRef);
        if (row.cotRef)
            promptIds.add(row.cotRef);
    }
    let promptMap = new Map();
    if (promptIds.size > 0) {
        const prompts = await db
            .select()
            .from(llmPromptPayloads)
            .where(inArray(llmPromptPayloads.id, Array.from(promptIds)));
        promptMap = new Map(prompts.map((p) => [p.id, p]));
    }
    const positions = positionsRows.map(mapPositionRow);
    const totalPositionsValue = positions.reduce((sum, position) => sum + position.markPrice * position.quantity, 0);
    const totalPnl = positions.reduce((sum, position) => sum + position.pnl, 0);
    const startingCapital = toNumber(portfolioRow.startingCapital, 0);
    const equity = toNumber(portfolioRow.currentCash, 0) + totalPositionsValue;
    const pnlPct = startingCapital > 0 ? (totalPnl / startingCapital) * 100 : 0;
    const decisions = decisionRows.map((row) => assembleDecision(row, promptMap));
    const events = eventsRows.map(mapEventRow);
    const closedPositions = [];
    const snapshot = {
        portfolioId: portfolioRow.id,
        automationEnabled: portfolioRow.automationEnabled ?? false,
        mode: "Paper trading",
        availableCash: toNumber(portfolioRow.currentCash, 0),
        equity,
        totalPnl,
        pnlPct,
        sharpe: toNumber(portfolioRow.sharpe, 0),
        drawdownPct: toNumber(portfolioRow.drawdownPct, 0),
        lastRunAt: toIsoString(portfolioRow.lastRunAt) ?? new Date().toISOString(),
        nextRunInMinutes: 5,
        positions,
        closedPositions,
        decisions,
        events,
    };
    return snapshot;
};
export const listAutoTradeDecisions = async (symbol) => {
    if (!db)
        return [];
    const rows = symbol
        ? await db
            .select()
            .from(llmDecisionLogs)
            .where(eq(llmDecisionLogs.symbol, symbol))
            .orderBy(llmDecisionLogs.createdAt)
        : await db.select().from(llmDecisionLogs).orderBy(llmDecisionLogs.createdAt);
    if (rows.length === 0) {
        return [];
    }
    const promptIds = new Set();
    for (const row of rows) {
        if (row.promptRef)
            promptIds.add(row.promptRef);
        if (row.cotRef)
            promptIds.add(row.cotRef);
    }
    let promptMap = new Map();
    if (promptIds.size > 0) {
        const prompts = await db
            .select()
            .from(llmPromptPayloads)
            .where(inArray(llmPromptPayloads.id, Array.from(promptIds)));
        promptMap = new Map(prompts.map((p) => [p.id, p]));
    }
    return rows.map((row) => assembleDecision(row, promptMap));
};
export const getAutoTradeDecisionById = async (decisionId) => {
    if (!db)
        return null;
    const [row] = await db.select().from(llmDecisionLogs).where(eq(llmDecisionLogs.id, decisionId)).limit(1);
    if (!row)
        return null;
    const promptIds = [row.promptRef, row.cotRef].filter((id) => Boolean(id));
    let promptMap = new Map();
    if (promptIds.length > 0) {
        const prompts = await db
            .select()
            .from(llmPromptPayloads)
            .where(inArray(llmPromptPayloads.id, promptIds));
        promptMap = new Map(prompts.map((p) => [p.id, p]));
    }
    return assembleDecision(row, promptMap);
};
//# sourceMappingURL=autoTradeRepository.js.map
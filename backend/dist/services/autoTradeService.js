import { isAxiosError } from "axios";
import { autoTradeMockPortfolio, getMockDecisionById } from "../mocks/autoTradeMock.js";
import { getLatestAutoTradePortfolio, listAutoTradeDecisions, getAutoTradeDecisionById } from "../db/autoTradeRepository.js";
import { getAutotradeHttpClient } from "./autotradeHttpClient.js";
import { withServiceError } from "./utils/serviceHelpers.js";
const SERVICE_NAME = "autotrade-python";
const pick = (obj, ...keys) => {
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null) {
            return obj[key];
        }
    }
    return undefined;
};
const mapExitPlan = (plan) => ({
    profitTarget: pick(plan, "profit_target", "profitTarget") ?? 0,
    stopLoss: pick(plan, "stop_loss", "stopLoss") ?? 0,
    invalidation: pick(plan, "invalidation", "invalidationCondition") ?? "",
});
const mapPosition = (position) => ({
    symbol: position.symbol,
    quantity: pick(position, "quantity") ?? 0,
    entryPrice: pick(position, "entry_price", "entryPrice") ?? 0,
    markPrice: pick(position, "mark_price", "markPrice") ?? 0,
    leverage: pick(position, "leverage") ?? 0,
    pnl: pick(position, "pnl") ?? 0,
    pnlPct: pick(position, "pnl_pct", "pnlPct") ?? 0,
    confidence: pick(position, "confidence") ?? 0,
    exitPlan: mapExitPlan((position.exit_plan ?? position.exitPlan) ?? {}),
});
const mapClosedPosition = (position) => ({
    symbol: position.symbol,
    quantity: pick(position, "quantity") ?? 0,
    entryPrice: pick(position, "entry_price", "entryPrice") ?? 0,
    exitPrice: pick(position, "exit_price", "exitPrice") ?? 0,
    entryTimestamp: ensureIso(pick(position, "entry_timestamp", "entryTimestamp")),
    exitTimestamp: ensureIso(pick(position, "exit_timestamp", "exitTimestamp")),
    realizedPnl: pick(position, "realized_pnl", "realizedPnl") ?? 0,
    realizedPnlPct: pick(position, "realized_pnl_pct", "realizedPnlPct") ?? 0,
    leverage: pick(position, "leverage") ?? 0,
    reason: pick(position, "reason") ?? "",
});
const mapDecisionPrompt = (prompt) => ({
    systemPrompt: pick(prompt, "system_prompt", "systemPrompt") ?? "",
    userPayload: pick(prompt, "user_payload", "userPayload") ?? "",
    chainOfThought: pick(prompt, "chain_of_thought", "chainOfThought") ?? "",
    invalidations: pick(prompt, "invalidations") ?? [],
    observationWindow: pick(prompt, "observation_window", "observationWindow") ?? "",
});
const ensureIso = (value) => {
    if (!value || typeof value !== "string") {
        return new Date().toISOString();
    }
    return value.endsWith("Z") ? value : `${value}Z`;
};
const mapDecision = (decision) => ({
    id: decision.id,
    symbol: decision.symbol,
    action: decision.action,
    sizePct: pick(decision, "size_pct", "sizePct") ?? 0,
    confidence: pick(decision, "confidence") ?? 0,
    rationale: pick(decision, "rationale") ?? "",
    createdAt: ensureIso(pick(decision, "created_at", "createdAt")),
    prompt: mapDecisionPrompt(decision.prompt),
});
const mapEvent = (event) => ({
    id: event.id,
    label: event.label,
    timestamp: ensureIso(pick(event, "timestamp")),
});
const mapPortfolio = (portfolio) => ({
    portfolioId: pick(portfolio, "portfolio_id", "portfolioId") ?? "unknown",
    automationEnabled: Boolean(pick(portfolio, "automation_enabled", "automationEnabled")),
    mode: pick(portfolio, "mode") === "Live trading" ? "Live trading" : "Paper trading",
    availableCash: pick(portfolio, "available_cash", "availableCash") ?? 0,
    equity: pick(portfolio, "equity") ?? 0,
    totalPnl: pick(portfolio, "total_pnl", "totalPnl") ?? 0,
    pnlPct: pick(portfolio, "pnl_pct", "pnlPct") ?? 0,
    sharpe: pick(portfolio, "sharpe") ?? 0,
    drawdownPct: pick(portfolio, "drawdown_pct", "drawdownPct") ?? 0,
    lastRunAt: ensureIso(pick(portfolio, "last_run_at", "lastRunAt")),
    nextRunInMinutes: pick(portfolio, "next_run_in_minutes", "nextRunInMinutes") ?? 0,
    positions: portfolio.positions.map(mapPosition),
    closedPositions: (portfolio.closed_positions ?? portfolio.closedPositions ?? []).map(mapClosedPosition),
    decisions: portfolio.decisions.map(mapDecision),
    events: portfolio.events.map(mapEvent),
});
export const fetchAutoTradePortfolio = async () => {
    try {
        const client = getAutotradeHttpClient();
        const data = await withServiceError(SERVICE_NAME, "portfolio", async () => {
            const response = await client.get("/internal/autotrade/v1/portfolio");
            return response.data;
        });
        return mapPortfolio(data.portfolio);
    }
    catch (error) {
        if (process.env.NODE_ENV !== "test") {
            console.warn("[autotrade] Falling back to DB/mock portfolio due to error:", error.message);
        }
        const snapshot = await getLatestAutoTradePortfolio();
        return snapshot ?? autoTradeMockPortfolio;
    }
};
export const fetchAutoTradeDecisions = async (symbol) => {
    try {
        const client = getAutotradeHttpClient();
        const data = await withServiceError(SERVICE_NAME, "decisions", async () => {
            const response = await client.get("/internal/autotrade/v1/decisions", {
                params: symbol ? { symbol } : undefined,
            });
            return response.data;
        });
        return data.items.map(mapDecision);
    }
    catch (error) {
        if (process.env.NODE_ENV !== "test") {
            console.warn("[autotrade] Falling back to DB/mock decisions due to error:", error.message);
        }
    }
    const rows = await listAutoTradeDecisions(symbol);
    if (rows.length > 0) {
        return rows;
    }
    if (symbol) {
        return autoTradeMockPortfolio.decisions.filter((decision) => decision.symbol === symbol);
    }
    return autoTradeMockPortfolio.decisions;
};
export const fetchAutoTradeDecisionById = async (decisionId) => {
    try {
        const client = getAutotradeHttpClient();
        const data = await withServiceError(SERVICE_NAME, "decision", async () => {
            const response = await client.get(`/internal/autotrade/v1/decisions/${decisionId}`);
            return response.data;
        });
        return mapDecision(data.decision);
    }
    catch (error) {
        if (isAxiosError(error) && error.response?.status === 404) {
            return null;
        }
        if (process.env.NODE_ENV !== "test") {
            console.warn("[autotrade] Falling back to DB/mock decision due to error:", error.message);
        }
    }
    const decision = await getAutoTradeDecisionById(decisionId);
    if (decision) {
        return decision;
    }
    return getMockDecisionById(decisionId) ?? null;
};
//# sourceMappingURL=autoTradeService.js.map
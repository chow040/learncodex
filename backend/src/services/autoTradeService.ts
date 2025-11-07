import { isAxiosError } from "axios"

import type {
  AutoTradeClosedPosition,
  AutoTradeDecision,
  AutoTradeEvent,
  AutoTradePortfolioSnapshot,
  AutoTradePosition,
} from "../types/autotrade.js"
import { autoTradeMockPortfolio, getMockDecisionById } from "../mocks/autoTradeMock.js"
import { getLatestAutoTradePortfolio, listAutoTradeDecisions, getAutoTradeDecisionById } from "../db/autoTradeRepository.js"
import { getAutotradeHttpClient } from "./autotradeHttpClient.js"
import { withServiceError } from "./utils/serviceHelpers.js"

type PythonExitPlan = {
  profit_target?: number
  profitTarget?: number
  stop_loss?: number
  stopLoss?: number
  invalidation?: string
  invalidationCondition?: string
}

type PythonPosition = {
  symbol: string
  quantity?: number
  entry_price?: number
  entryPrice?: number
  mark_price?: number
  markPrice?: number
  leverage?: number
  pnl?: number
  pnl_pct?: number
  pnlPct?: number
  confidence?: number
  exit_plan?: PythonExitPlan
  exitPlan?: PythonExitPlan
}

type PythonClosedPosition = {
  symbol: string
  quantity?: number
  entry_price?: number
  entryPrice?: number
  exit_price?: number
  exitPrice?: number
  entry_timestamp?: string
  entryTimestamp?: string
  exit_timestamp?: string
  exitTimestamp?: string
  realized_pnl?: number
  realizedPnl?: number
  realized_pnl_pct?: number
  realizedPnlPct?: number
  leverage?: number
  reason?: string
}

type PythonDecisionPrompt = {
  system_prompt?: string
  systemPrompt?: string
  user_payload?: string
  userPayload?: string
  chain_of_thought?: string
  chainOfThought?: string
  invalidations?: string[]
  observation_window?: string
  observationWindow?: string
}

type PythonDecision = {
  id: string
  symbol: string
  action: string
  size_pct?: number
  sizePct?: number
  confidence?: number
  rationale?: string
  created_at?: string
  createdAt?: string
  prompt: PythonDecisionPrompt
}

type PythonEvent = {
  id: string
  label: string
  timestamp?: string
}

type PythonPortfolio = {
  portfolio_id?: string
  portfolioId?: string
  automation_enabled?: boolean
  automationEnabled?: boolean
  mode?: string
  available_cash?: number
  availableCash?: number
  equity?: number
  total_pnl?: number
  totalPnl?: number
  pnl_pct?: number
  pnlPct?: number
  sharpe?: number
  drawdown_pct?: number
  drawdownPct?: number
  last_run_at?: string
  lastRunAt?: string
  next_run_in_minutes?: number
  nextRunInMinutes?: number
  positions: PythonPosition[]
  closed_positions?: PythonClosedPosition[]
  closedPositions?: PythonClosedPosition[]
  decisions: PythonDecision[]
  events: PythonEvent[]
}

type PythonPortfolioResponse = {
  portfolio: PythonPortfolio
}

type PythonDecisionListResponse = {
  items: PythonDecision[]
  next_cursor: string | null
}

type PythonDecisionResponse = {
  decision: PythonDecision
}

const SERVICE_NAME = "autotrade-python"

const pick = <T>(obj: Record<string, any>, ...keys: string[]): T => {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return obj[key] as T
    }
  }
  return undefined as unknown as T
}

const mapExitPlan = (plan: PythonExitPlan): AutoTradePosition["exitPlan"] => ({
  profitTarget: pick<number>(plan as Record<string, any>, "profit_target", "profitTarget") ?? 0,
  stopLoss: pick<number>(plan as Record<string, any>, "stop_loss", "stopLoss") ?? 0,
  invalidation: pick<string>(plan as Record<string, any>, "invalidation", "invalidationCondition") ?? "",
})

const mapPosition = (position: PythonPosition): AutoTradePosition => ({
  symbol: position.symbol,
  quantity: pick<number>(position as Record<string, any>, "quantity") ?? 0,
  entryPrice: pick<number>(position as Record<string, any>, "entry_price", "entryPrice") ?? 0,
  markPrice: pick<number>(position as Record<string, any>, "mark_price", "markPrice") ?? 0,
  leverage: pick<number>(position as Record<string, any>, "leverage") ?? 0,
  pnl: pick<number>(position as Record<string, any>, "pnl") ?? 0,
  pnlPct: pick<number>(position as Record<string, any>, "pnl_pct", "pnlPct") ?? 0,
  confidence: pick<number>(position as Record<string, any>, "confidence") ?? 0,
  exitPlan: mapExitPlan((position.exit_plan ?? position.exitPlan) ?? {}),
})

const mapClosedPosition = (position: PythonClosedPosition): AutoTradeClosedPosition => ({
  symbol: position.symbol,
  quantity: pick<number>(position as Record<string, any>, "quantity") ?? 0,
  entryPrice: pick<number>(position as Record<string, any>, "entry_price", "entryPrice") ?? 0,
  exitPrice: pick<number>(position as Record<string, any>, "exit_price", "exitPrice") ?? 0,
  entryTimestamp: ensureIso(pick<string>(position as Record<string, any>, "entry_timestamp", "entryTimestamp")),
  exitTimestamp: ensureIso(pick<string>(position as Record<string, any>, "exit_timestamp", "exitTimestamp")),
  realizedPnl: pick<number>(position as Record<string, any>, "realized_pnl", "realizedPnl") ?? 0,
  realizedPnlPct: pick<number>(position as Record<string, any>, "realized_pnl_pct", "realizedPnlPct") ?? 0,
  leverage: pick<number>(position as Record<string, any>, "leverage") ?? 0,
  reason: pick<string>(position as Record<string, any>, "reason") ?? "",
})

const mapDecisionPrompt = (prompt: PythonDecisionPrompt): AutoTradeDecision["prompt"] => ({
  systemPrompt: pick<string>(prompt as Record<string, any>, "system_prompt", "systemPrompt") ?? "",
  userPayload: pick<string>(prompt as Record<string, any>, "user_payload", "userPayload") ?? "",
  chainOfThought: pick<string>(prompt as Record<string, any>, "chain_of_thought", "chainOfThought") ?? "",
  invalidations: pick<string[]>(prompt as Record<string, any>, "invalidations") ?? [],
  observationWindow: pick<string>(prompt as Record<string, any>, "observation_window", "observationWindow") ?? "",
})

const ensureIso = (value?: string | null): string => {
  if (!value || typeof value !== "string") {
    return new Date().toISOString()
  }
  return value.endsWith("Z") ? value : `${value}Z`
}

const mapDecision = (decision: PythonDecision): AutoTradeDecision => ({
  id: decision.id,
  symbol: decision.symbol,
  action: decision.action as AutoTradeDecision["action"],
  sizePct: pick<number>(decision as Record<string, any>, "size_pct", "sizePct") ?? 0,
  confidence: pick<number>(decision as Record<string, any>, "confidence") ?? 0,
  rationale: pick<string>(decision as Record<string, any>, "rationale") ?? "",
  createdAt: ensureIso(pick<string>(decision as Record<string, any>, "created_at", "createdAt")),
  prompt: mapDecisionPrompt(decision.prompt),
})

const mapEvent = (event: PythonEvent): AutoTradeEvent => ({
  id: event.id,
  label: event.label,
  timestamp: ensureIso(pick<string>(event as Record<string, any>, "timestamp")),
})

const mapPortfolio = (portfolio: PythonPortfolio): AutoTradePortfolioSnapshot => ({
  portfolioId: pick<string>(portfolio as Record<string, any>, "portfolio_id", "portfolioId") ?? "unknown",
  automationEnabled: Boolean(pick<boolean>(portfolio as Record<string, any>, "automation_enabled", "automationEnabled")),
  mode: pick<string>(portfolio as Record<string, any>, "mode") === "Live trading" ? "Live trading" : "Paper trading",
  availableCash: pick<number>(portfolio as Record<string, any>, "available_cash", "availableCash") ?? 0,
  equity: pick<number>(portfolio as Record<string, any>, "equity") ?? 0,
  totalPnl: pick<number>(portfolio as Record<string, any>, "total_pnl", "totalPnl") ?? 0,
  pnlPct: pick<number>(portfolio as Record<string, any>, "pnl_pct", "pnlPct") ?? 0,
  sharpe: pick<number>(portfolio as Record<string, any>, "sharpe") ?? 0,
  drawdownPct: pick<number>(portfolio as Record<string, any>, "drawdown_pct", "drawdownPct") ?? 0,
  lastRunAt: ensureIso(pick<string>(portfolio as Record<string, any>, "last_run_at", "lastRunAt")),
  nextRunInMinutes: pick<number>(portfolio as Record<string, any>, "next_run_in_minutes", "nextRunInMinutes") ?? 0,
  positions: portfolio.positions.map(mapPosition),
  closedPositions: (portfolio.closed_positions ?? portfolio.closedPositions ?? []).map(mapClosedPosition),
  decisions: portfolio.decisions.map(mapDecision),
  events: portfolio.events.map(mapEvent),
})

export const fetchAutoTradePortfolio = async (): Promise<AutoTradePortfolioSnapshot> => {
  try {
    const client = getAutotradeHttpClient()
    const data = await withServiceError<PythonPortfolioResponse>(SERVICE_NAME, "portfolio", async () => {
      const response = await client.get<PythonPortfolioResponse>("/internal/autotrade/v1/portfolio")
      return response.data
    })
    return mapPortfolio(data.portfolio)
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[autotrade] Falling back to DB/mock portfolio due to error:", (error as Error).message)
    }
    const snapshot = await getLatestAutoTradePortfolio()
    return snapshot ?? autoTradeMockPortfolio
  }
}

export const fetchAutoTradeDecisions = async (symbol?: string): Promise<AutoTradeDecision[]> => {
  try {
    const client = getAutotradeHttpClient()
    const data = await withServiceError<PythonDecisionListResponse>(SERVICE_NAME, "decisions", async () => {
      const response = await client.get<PythonDecisionListResponse>("/internal/autotrade/v1/decisions", {
        params: symbol ? { symbol } : undefined,
      })
      return response.data
    })
    return data.items.map(mapDecision)
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[autotrade] Falling back to DB/mock decisions due to error:", (error as Error).message)
    }
  }

  const rows = await listAutoTradeDecisions(symbol)
  if (rows.length > 0) {
    return rows
  }
  if (symbol) {
    return autoTradeMockPortfolio.decisions.filter((decision) => decision.symbol === symbol)
  }
  return autoTradeMockPortfolio.decisions
}

export const fetchAutoTradeDecisionById = async (decisionId: string): Promise<AutoTradeDecision | null> => {
  try {
    const client = getAutotradeHttpClient()
    const data = await withServiceError<PythonDecisionResponse>(SERVICE_NAME, "decision", async () => {
      const response = await client.get<PythonDecisionResponse>(`/internal/autotrade/v1/decisions/${decisionId}`)
      return response.data
    })
    return mapDecision(data.decision)
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      return null
    }
    if (process.env.NODE_ENV !== "test") {
      console.warn("[autotrade] Falling back to DB/mock decision due to error:", (error as Error).message)
    }
  }

  const decision = await getAutoTradeDecisionById(decisionId)
  if (decision) {
    return decision
  }
  return getMockDecisionById(decisionId) ?? null
}

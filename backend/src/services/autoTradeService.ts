import { isAxiosError } from "axios"

import type { AutoTradeDecision, AutoTradeEvent, AutoTradePortfolioSnapshot, AutoTradePosition } from "../types/autotrade.js"
import { autoTradeMockPortfolio, getMockDecisionById } from "../mocks/autoTradeMock.js"
import { getLatestAutoTradePortfolio, listAutoTradeDecisions, getAutoTradeDecisionById } from "../db/autoTradeRepository.js"
import { getAutotradeHttpClient } from "./autotradeHttpClient.js"
import { withServiceError } from "./utils/serviceHelpers.js"

type PythonExitPlan = {
  profit_target: number
  stop_loss: number
  invalidation: string
}

type PythonPosition = {
  symbol: string
  quantity: number
  entry_price: number
  mark_price: number
  leverage: number
  pnl: number
  pnl_pct: number
  confidence: number
  exit_plan: PythonExitPlan
}

type PythonDecisionPrompt = {
  system_prompt: string
  user_payload: string
  chain_of_thought: string
  invalidations: string[]
  observation_window: string
}

type PythonDecision = {
  id: string
  symbol: string
  action: string
  size_pct: number
  confidence: number
  rationale: string
  created_at: string
  prompt: PythonDecisionPrompt
}

type PythonEvent = {
  id: string
  label: string
  timestamp: string
}

type PythonPortfolio = {
  portfolio_id: string
  automation_enabled: boolean
  mode: string
  available_cash: number
  equity: number
  total_pnl: number
  pnl_pct: number
  sharpe: number
  drawdown_pct: number
  last_run_at: string
  next_run_in_minutes: number
  positions: PythonPosition[]
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

const mapExitPlan = (plan: PythonExitPlan): AutoTradePosition["exitPlan"] => ({
  profitTarget: plan.profit_target,
  stopLoss: plan.stop_loss,
  invalidation: plan.invalidation,
})

const mapPosition = (position: PythonPosition): AutoTradePosition => ({
  symbol: position.symbol,
  quantity: position.quantity,
  entryPrice: position.entry_price,
  markPrice: position.mark_price,
  leverage: position.leverage,
  pnl: position.pnl,
  pnlPct: position.pnl_pct,
  confidence: position.confidence,
  exitPlan: mapExitPlan(position.exit_plan),
})

const mapDecisionPrompt = (prompt: PythonDecisionPrompt): AutoTradeDecision["prompt"] => ({
  systemPrompt: prompt.system_prompt,
  userPayload: prompt.user_payload,
  chainOfThought: prompt.chain_of_thought,
  invalidations: prompt.invalidations,
  observationWindow: prompt.observation_window,
})

const mapDecision = (decision: PythonDecision): AutoTradeDecision => ({
  id: decision.id,
  symbol: decision.symbol,
  action: decision.action as AutoTradeDecision["action"],
  sizePct: decision.size_pct,
  confidence: decision.confidence,
  rationale: decision.rationale,
  createdAt: decision.created_at.endsWith('Z') ? decision.created_at : decision.created_at + 'Z',
  prompt: mapDecisionPrompt(decision.prompt),
})

const mapEvent = (event: PythonEvent): AutoTradeEvent => ({
  id: event.id,
  label: event.label,
  timestamp: event.timestamp.endsWith('Z') ? event.timestamp : event.timestamp + 'Z',
})

const mapPortfolio = (portfolio: PythonPortfolio): AutoTradePortfolioSnapshot => ({
  portfolioId: portfolio.portfolio_id,
  automationEnabled: portfolio.automation_enabled,
  mode: portfolio.mode === "Live trading" ? "Live trading" : "Paper trading",
  availableCash: portfolio.available_cash,
  equity: portfolio.equity,
  totalPnl: portfolio.total_pnl,
  pnlPct: portfolio.pnl_pct,
  sharpe: portfolio.sharpe,
  drawdownPct: portfolio.drawdown_pct,
  lastRunAt: portfolio.last_run_at.endsWith('Z') ? portfolio.last_run_at : portfolio.last_run_at + 'Z',
  nextRunInMinutes: portfolio.next_run_in_minutes,
  positions: portfolio.positions.map(mapPosition),
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

export type AutoTradeAction = "buy" | "sell" | "hold" | "no_entry" | "close"

export interface AutoTradeExitPlan {
  profitTarget: number
  stopLoss: number
  invalidation: string
}

export interface AutoTradePosition {
  symbol: string
  quantity: number
  entryPrice: number
  markPrice: number
  pnl: number
  pnlPct: number
  leverage: number
  confidence: number
  exitPlan: AutoTradeExitPlan
}

export interface AutoTradeClosedPosition {
  symbol: string
  quantity: number
  entryPrice: number
  exitPrice: number
  entryTimestamp: string
  exitTimestamp: string
  realizedPnl: number
  realizedPnlPct: number
  leverage: number
  reason: string
}

export interface AutoTradeDecision {
  id: string
  symbol: string
  action: AutoTradeAction
  sizePct: number
  confidence: number
  rationale: string
  createdAt: string
  prompt: {
    systemPrompt: string
    userPayload: string
    chainOfThought: string
    invalidations: string[]
    observationWindow: string
    toolCalls?: string
    toolPayload?: string
  }
}

export interface AutoTradeEvent {
  id: string
  label: string
  timestamp: string
}

export interface AutoTradePortfolioSnapshot {
  portfolioId: string
  automationEnabled: boolean
  mode: string
  availableCash: number
  equity: number
  totalPnl: number
  pnlPct: number
  sharpe: number
  drawdownPct: number
  lastRunAt: string
  nextRunInMinutes: number
  positions: AutoTradePosition[]
  closedPositions: AutoTradeClosedPosition[]
  decisions: AutoTradeDecision[]
  events: AutoTradeEvent[]
}

export interface AutoTradeSchedulerJobStatus {
  jobId: string
  name: string
  status: "idle" | "running" | "paused"
  lastRunAt: string | null
  nextRunAt: string | null
  consecutiveFailures: number
}

export interface AutoTradeSchedulerStatus {
  implementation: string
  isRunning: boolean
  isPaused: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  consecutiveFailures: number
  jobs: AutoTradeSchedulerJobStatus[]
}

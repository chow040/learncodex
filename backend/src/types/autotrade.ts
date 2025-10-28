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
  leverage: number
  pnl: number
  pnlPct: number
  confidence: number
  exitPlan: AutoTradeExitPlan
}

export type AutoTradeAction = 'buy' | 'sell' | 'hold'

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
  mode: 'Paper trading' | 'Live trading'
  availableCash: number
  equity: number
  totalPnl: number
  pnlPct: number
  sharpe: number
  drawdownPct: number
  lastRunAt: string
  nextRunInMinutes: number
  positions: AutoTradePosition[]
  decisions: AutoTradeDecision[]
  events: AutoTradeEvent[]
}

export interface AutoTradeSchedulerJobStatus {
  jobId: string
  name: string
  status: 'idle' | 'running' | 'paused'
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

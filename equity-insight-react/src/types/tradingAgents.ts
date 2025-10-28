export type TradingAgentsDecision = {
  symbol: string
  decision?: string | null
  finalTradeDecision?: string | null
  tradeDate?: string
  traderPlan?: string | null
  investmentPlan?: string | null
  investmentJudge?: string | null
  riskJudge?: string | null
  rawJson?: unknown
  modelId?: string | null
  analysts?: string[]
  runId?: string
  executionMs?: number | null
  investmentDebate?: string | null
  bullArgument?: string | null
  bearArgument?: string | null
  aggressiveArgument?: string | null
  conservativeArgument?: string | null
  neutralArgument?: string | null
  riskDebate?: string | null
  marketReport?: string | null
  sentimentReport?: string | null
  newsReport?: string | null
  fundamentalsReport?: string | null
  analystAssessments?: Array<{
    role: string
    content: string | null
  }>
  [key: string]: unknown
}

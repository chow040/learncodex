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
  [key: string]: unknown
}

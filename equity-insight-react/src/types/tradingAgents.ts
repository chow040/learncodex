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

export type TradingAgentStatus = "active" | "disabled" | "experimental"
export type TradingAgentFocus = "technical" | "fundamental" | "macro" | "mixed"
export type TradingAgentHorizon = "intraday" | "swing" | "long_term"
export type TradingAgentTone = "neutral" | "institutional" | "casual"
export type TradingAgentRiskBias = "conservative" | "balanced" | "aggressive"

export type TradingAgentSummary = {
  id: string
  slug: string
  name: string
  description: string
  focus: TradingAgentFocus
  horizon: TradingAgentHorizon
  tone: TradingAgentTone
  riskBias: TradingAgentRiskBias
  defaultModel: string
  status: TradingAgentStatus
  updatedAt: string
  dataSources: string[]
}

export type TradingAgentPromptProfile = {
  id: string
  name: string
  version: number
  outputSchemaExample?: string | null
}

export type TradingAgentToolPolicy = {
  priceData: boolean
  indicators: boolean
  news: boolean
  fundamentals: boolean
  macro: boolean
  maxToolsPerRun: number
  allowCrossTicker: boolean
}

export type TradingAgentContextPolicy = {
  includePreviousAnalyses: boolean
  includeUserNotes: boolean
  includeGlobalSummary: boolean
  maxAnalyses: number
  maxContextTokens: number
}

export type TradingAgentRunStatus = "running" | "success" | "error"

export type TradingAgentRunSummary = {
  id: string
  agentId: string
  userId: string | null
  tickers: string[]
  question?: string | null
  status: TradingAgentRunStatus
  decisionSummary?: string | null
  confidence?: number | null
  tokensPrompt?: number | null
  tokensCompletion?: number | null
  tokensTotal?: number | null
  createdAt: string
  updatedAt: string
}

export type TradingAgentDetail = TradingAgentSummary & {
  promptProfile: TradingAgentPromptProfile | null
  toolPolicy: TradingAgentToolPolicy | null
  contextPolicy: TradingAgentContextPolicy | null
  recentRuns: TradingAgentRunSummary[]
}

export type ExecuteAgentRunResponse = {
  run: TradingAgentRunSummary
  decisionSummary?: string | null
}

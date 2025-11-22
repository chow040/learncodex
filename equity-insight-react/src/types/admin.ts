export type SystemSettingsByScope = Record<string, SystemSettingRecord[]>

export interface SystemSettingRecord {
  id: string
  key: string
  value: unknown
  scope: string
  createdAt: string
  updatedAt: string
}

export interface SystemSettingUpdateInput {
  key: string
  value: unknown
  scope?: string
}

export type AgentStatus = "active" | "disabled" | "experimental"
export type AgentHorizon = "intraday" | "swing" | "long_term"
export type AgentTone = "neutral" | "institutional" | "casual"
export type AgentRiskBias = "conservative" | "balanced" | "aggressive"
export type AgentFocus = "technical" | "fundamental" | "macro" | "mixed"

export interface AgentSummary {
  id: string
  slug: string
  name: string
  status: AgentStatus
  defaultModel: string
  updatedAt: string
}

export interface PromptProfileDetail {
  id: string
  name: string
  type: string
  version: number
  content: string
  outputSchemaExample?: string | null
  isActive: boolean
}

export interface AgentToolPolicyConfig {
  canUsePriceData: boolean
  canUseIndicators: boolean
  canUseNews: boolean
  canUseFundamentals: boolean
  canUseMacro: boolean
  maxToolsPerRun: number
  allowCrossTicker: boolean
  updatedAt: string
}

export interface AgentContextPolicyConfig {
  includePreviousAnalyses: boolean
  includeUserNotes: boolean
  includeGlobalSummary: boolean
  maxAnalyses: number
  maxContextTokens: number
  updatedAt: string
}

export interface AgentConfiguration extends AgentSummary {
  description: string
  defaultTemperature: number
  defaultMaxTokens: number
  defaultHorizon: AgentHorizon
  defaultTone: AgentTone
  defaultRiskBias: AgentRiskBias
  defaultFocus: AgentFocus
  promptProfile?: PromptProfileDetail | null
  toolPolicy?: AgentToolPolicyConfig | null
  contextPolicy?: AgentContextPolicyConfig | null
}

export interface PromptPreviewResult {
  behaviorBlock: string
  systemPrompt: string
  contextBlock?: string
  userBlock: string
  assembledPrompt: string
  tokenEstimate: number
}

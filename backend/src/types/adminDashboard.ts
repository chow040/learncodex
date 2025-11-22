export type AgentStatus = 'active' | 'disabled' | 'experimental';
export type AgentHorizon = 'intraday' | 'swing' | 'long_term';
export type AgentTone = 'neutral' | 'institutional' | 'casual';
export type AgentRiskBias = 'conservative' | 'balanced' | 'aggressive';
export type AgentFocus = 'technical' | 'fundamental' | 'macro' | 'mixed';

export type PromptProfileType =
  | 'trading_agent_system'
  | 'rule_generator_system'
  | 'risk_guard_system';

export type AgentRunStatus = 'running' | 'success' | 'error';

export interface SystemSettingRecord {
  id: string;
  key: string;
  value: unknown;
  scope: string;
  createdAt: string;
  updatedAt: string;
}

export type SystemSettingsByScope = Record<string, SystemSettingRecord[]>;

export interface SystemSettingUpdateInput {
  key: string;
  value: unknown;
  scope?: string;
}

export interface PromptProfileSummary {
  id: string;
  name: string;
  type: PromptProfileType;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptProfileDetail extends PromptProfileSummary {
  content: string;
  outputSchemaExample?: string | null;
}

export interface CreatePromptProfileInput {
  name: string;
  type: PromptProfileType;
  content: string;
  outputSchemaExample?: string;
  basedOnProfileId?: string;
}

export interface UpdatePromptProfileInput {
  name?: string;
  content?: string;
  outputSchemaExample?: string;
  isActive?: boolean;
}

export interface AgentToolPolicyConfig {
  canUsePriceData: boolean;
  canUseIndicators: boolean;
  canUseNews: boolean;
  canUseFundamentals: boolean;
  canUseMacro: boolean;
  maxToolsPerRun: number;
  allowCrossTicker: boolean;
  updatedAt: string;
}

export interface AgentContextPolicyConfig {
  includePreviousAnalyses: boolean;
  includeUserNotes: boolean;
  includeGlobalSummary: boolean;
  maxAnalyses: number;
  maxContextTokens: number;
  updatedAt: string;
}

export interface AgentSummary {
  id: string;
  slug: string;
  name: string;
  status: AgentStatus;
  defaultModel: string;
  updatedAt: string;
}

export interface AgentConfiguration extends AgentSummary {
  description: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  defaultHorizon: AgentHorizon;
  defaultTone: AgentTone;
  defaultRiskBias: AgentRiskBias;
  defaultFocus: AgentFocus;
  promptProfile?: PromptProfileDetail | null;
  toolPolicy?: AgentToolPolicyConfig | null;
  contextPolicy?: AgentContextPolicyConfig | null;
}

export interface AgentCoreUpdate {
  name?: string;
  description?: string;
  status?: AgentStatus;
  defaultModel?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  defaultHorizon?: AgentHorizon;
  defaultTone?: AgentTone;
  defaultRiskBias?: AgentRiskBias;
  defaultFocus?: AgentFocus;
  promptProfileId?: string | null;
}

export interface AgentUpdateInput {
  agent?: AgentCoreUpdate;
  toolPolicy?: Partial<Omit<AgentToolPolicyConfig, 'updatedAt'>>;
  contextPolicy?: Partial<Omit<AgentContextPolicyConfig, 'updatedAt'>>;
}

export interface ListPromptProfilesOptions {
  type?: PromptProfileType;
  agentId?: string;
}

export interface PromptPreviewInput {
  tickers: string[];
  question?: string;
}

export interface PromptPreviewResult {
  behaviorBlock: string;
  systemPrompt: string;
  contextBlock?: string;
  userBlock: string;
  assembledPrompt: string;
  tokenEstimate: number;
}

export interface SeededAdminSummary {
  createdSettings: number;
  createdPromptProfiles: number;
  createdAgents: number;
}

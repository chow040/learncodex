import type {
  AgentFocus,
  AgentHorizon,
  AgentRunStatus,
  AgentRiskBias,
  AgentTone,
  AgentStatus,
} from './adminDashboard.js';

export interface TradingAgentPublicSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  focus: AgentFocus;
  horizon: AgentHorizon;
  tone: AgentTone;
  riskBias: AgentRiskBias;
  defaultModel: string;
  status: AgentStatus;
  updatedAt: string;
  dataSources: string[];
}

export interface ToolPolicySummary {
  priceData: boolean;
  indicators: boolean;
  news: boolean;
  fundamentals: boolean;
  macro: boolean;
  maxToolsPerRun: number;
  allowCrossTicker: boolean;
}

export interface ContextPolicySummary {
  includePreviousAnalyses: boolean;
  includeUserNotes: boolean;
  includeGlobalSummary: boolean;
  maxAnalyses: number;
  maxContextTokens: number;
}

export interface PromptProfilePreview {
  id: string;
  name: string;
  version: number;
  outputSchemaExample?: string | null;
}

export interface TradingAgentDetail extends TradingAgentPublicSummary {
  promptProfile: PromptProfilePreview | null;
  toolPolicy: ToolPolicySummary | null;
  contextPolicy: ContextPolicySummary | null;
  recentRuns: AgentRunSummary[];
}

export interface AgentRunSummary {
  id: string;
  agentId: string;
  userId: string | null;
  tickers: string[];
  question?: string | null;
  status: AgentRunStatus;
  decisionSummary?: string | null;
  confidence?: number | null;
  tokensPrompt?: number | null;
  tokensCompletion?: number | null;
  tokensTotal?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunDetail extends AgentRunSummary {}

export interface ExecuteAgentRunInput {
  agentId: string;
  userId: string;
  tickers: string[];
  question?: string;
  modelId?: string;
  useMockData?: boolean;
}

export interface ExecuteAgentRunResult {
  run: AgentRunSummary;
  decisionSummary?: string | null;
}

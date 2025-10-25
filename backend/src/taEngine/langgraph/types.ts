import type { AgentsContext } from '../types.js';
import type { ToolCallRecord } from '../langchain/types.js';

export type AnalystReports = {
  market?: string;
  news?: string;
  social?: string;
  fundamentals?: string;
};

export type DebateHistory = {
  investment?: string;
  bull?: string | null;
  bear?: string | null;
  risk?: string;
  risky?: string | null;
  safe?: string | null;
  neutral?: string | null;
};

export interface ConversationLogEntry {
  roleLabel: string;
  system: string;
  user: string;
}

export type AnalystToolCall = ToolCallRecord & {
  persona: string;
};

export type InvestmentDebatePersona = 'bull' | 'bear';

export interface DebateRoundEntry {
  persona: InvestmentDebatePersona;
  round: number;
  content: string;
  timestamp: string;
}

export type RiskDebatePersona = 'risky' | 'safe' | 'neutral';

export interface RiskDebateRoundEntry {
  persona: RiskDebatePersona;
  round: number;
  content: string;
  timestamp: string;
}

export interface GraphMetadata extends Record<string, unknown> {
  invest_round?: number;
  invest_continue?: boolean;
  risk_round?: number;
  risk_continue?: boolean;
  progressRunId?: string;
  managerMemories?: string;
  traderMemories?: string;
  riskManagerMemories?: string;
  decision_token?: string;
  runStartedAt?: number;
  runCompletedAt?: number;
  executionMs?: number;
  payload?: unknown;
  modelId?: string;
  enabledAnalysts?: string[];
}

export interface GraphState {
  symbol: string;
  tradeDate: string;
  context: AgentsContext;
  reports: AnalystReports;
  investmentPlan?: string | null;
  traderPlan?: string | null;
  finalDecision?: string | null;
  conversationLog: ConversationLogEntry[];
  debate: DebateHistory;
  debateHistory: DebateRoundEntry[];
  riskDebateHistory: RiskDebateRoundEntry[];
  metadata: GraphMetadata;
  result?: import('../types.js').TradingAgentsDecision;
  toolCalls: AnalystToolCall[];
}

export const createInitialState = (
  symbol: string,
  tradeDate: string,
  context: AgentsContext,
): GraphState => ({
  symbol,
  tradeDate,
  context,
  reports: {},
  investmentPlan: null,
  traderPlan: null,
  finalDecision: null,
  conversationLog: [],
  debate: {},
  debateHistory: [],
  riskDebateHistory: [],
  metadata: {
    invest_continue: true,
    risk_continue: true,
  },
  toolCalls: [],
});

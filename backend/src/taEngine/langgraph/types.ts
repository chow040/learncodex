import type { AgentsContext } from '../types.js';

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
  metadata: Record<string, unknown>;
  result?: import('../types.js').TradingAgentsDecision;
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
  metadata: {},
});

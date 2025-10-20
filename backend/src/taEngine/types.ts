export interface AgentsContext {
  market_price_history: string;
  market_technical_report: string;
  social_stock_news: string;
  social_reddit_summary: string;
  news_company: string;
  news_reddit: string;
  news_global: string;
  fundamentals_summary: string;
  fundamentals_balance_sheet: string;
  fundamentals_cashflow: string;
  fundamentals_income_stmt: string;
  fundamentals_insider_transactions?: string;
}

import type { TradingAnalystId } from '../constants/tradingAgents.js';

export interface TradingAgentsPayload {
  symbol: string;
  tradeDate: string;
  context: AgentsContext;
  modelId?: string;
  analysts?: TradingAnalystId[];
}

export interface AgentPrompt {
  roleLabel: string; // e.g., Market Analyst, News Analyst
  system: string; // brief instruction for the agent role
  user: string; // the agent-specific content/context to analyze
}

export interface TradingAgentsDecision {
  symbol: string;
  tradeDate: string;
  decision: string | null;
  finalTradeDecision?: string | null;
  investmentPlan?: string | null;
  traderPlan?: string | null;
  investmentJudge?: string | null;
  riskJudge?: string | null;
  marketReport?: string | null;
  sentimentReport?: string | null;
  newsReport?: string | null;
  fundamentalsReport?: string | null;
  modelId?: string | null;
  analysts?: TradingAnalystId[];
  debugPrompt?: string; // optional prompt preview for troubleshooting
}

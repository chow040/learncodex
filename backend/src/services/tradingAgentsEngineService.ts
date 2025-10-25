import { env } from '../config/env.js';
import { TradingOrchestrator } from '../taEngine/graph/orchestrator.js';
import { DEFAULT_TRADING_ANALYSTS, type TradingAnalystId } from '../constants/tradingAgents.js';
import type { TradingAgentsDecision, TradingAgentsPayload, AgentsContext } from '../taEngine/types.js';
import { runMockTradingAgentsDecision } from './tradingAgentsMockService.js';

export interface TradingAgentsDecisionOptions {
  runId?: string;
  modelId?: string;
  analysts?: TradingAnalystId[];
  useMockData?: boolean;
}

export const requestTradingAgentsDecisionInternal = async (
  symbol: string,
  options?: TradingAgentsDecisionOptions,
): Promise<TradingAgentsDecision> => {
  const modelId = options?.modelId ?? env.openAiModel;
  const analysts = options?.analysts && options.analysts.length > 0
    ? options.analysts
    : [...DEFAULT_TRADING_ANALYSTS];

  const decisionDate = new Date().toISOString().slice(0, 10);
  const useMockData = options?.useMockData ?? env.tradingAgentsMockMode;

  const contextBase: AgentsContext = {
    market_price_history: '',
    market_technical_report: '',
    social_stock_news: '',
    social_reddit_summary: '',
    news_company: '',
    news_reddit: '',
    news_global: '',
    fundamentals_summary: '',
    fundamentals_balance_sheet: '',
    fundamentals_cashflow: '',
    fundamentals_income_stmt: '',
  };
  const payload: TradingAgentsPayload = {
    symbol,
    tradeDate: decisionDate,
    context: contextBase,
    modelId,
    analysts,
  };

  const orchestratorOptions = {
    modelId,
    analysts,
    ...(options?.runId ? { runId: options.runId } : {}),
  } satisfies { runId?: string; modelId: string; analysts: TradingAnalystId[] };

  if (useMockData) {
    return runMockTradingAgentsDecision(payload, {
      runId: options?.runId,
      modelId,
      analysts,
    });
  }

  const orchestrator = new TradingOrchestrator();
  return orchestrator.run(payload, orchestratorOptions) as Promise<TradingAgentsDecision>;
};






import { env } from '../config/env.js';
import { TradingOrchestrator } from '../taEngine/graph/orchestrator.js';
import { DEFAULT_TRADING_ANALYSTS } from '../constants/tradingAgents.js';
import { runMockTradingAgentsDecision } from './tradingAgentsMockService.js';
export const requestTradingAgentsDecisionInternal = async (symbol, options) => {
    const modelId = options?.modelId ?? env.openAiModel;
    const analysts = options?.analysts && options.analysts.length > 0
        ? options.analysts
        : [...DEFAULT_TRADING_ANALYSTS];
    const decisionDate = new Date().toISOString().slice(0, 10);
    const useMockData = options?.useMockData ?? env.tradingAgentsMockMode;
    const contextBase = {
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
    const payload = {
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
    };
    if (useMockData) {
        return runMockTradingAgentsDecision(payload, {
            ...(options?.runId ? { runId: options.runId } : {}),
            modelId,
            analysts,
        });
    }
    const orchestrator = new TradingOrchestrator();
    return orchestrator.run(payload, orchestratorOptions);
};
//# sourceMappingURL=tradingAgentsEngineService.js.map
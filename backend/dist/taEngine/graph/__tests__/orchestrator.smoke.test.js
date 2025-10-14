import { describe, expect, it, vi } from 'vitest';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'test-key';
process.env.TA_ENGINE_MODE = 'multi';
process.env.USE_LANGGRAPH_PIPELINE = 'true';
process.env.USE_LANGCHAIN_ANALYSTS = 'false';
const decisionStub = {
    symbol: 'AAPL',
    tradeDate: '2025-01-10',
    decision: 'BUY',
    finalTradeDecision: 'BUY',
    investmentPlan: 'Investment plan stub',
    traderPlan: 'Trader plan stub',
    investmentJudge: 'Investment plan stub',
    riskJudge: 'Risk decision stub',
    marketReport: 'Market report stub',
    sentimentReport: 'Sentiment report stub',
    newsReport: 'News report stub',
    fundamentalsReport: 'Fundamentals report stub',
    debugPrompt: '',
};
const runDecisionGraphMock = vi.fn(async () => decisionStub);
vi.mock('../../langgraph/decisionWorkflow.js', () => ({
    runDecisionGraph: runDecisionGraphMock,
}));
const { TradingOrchestrator } = await import('../orchestrator.js');
describe('TradingOrchestrator (LangGraph pipeline)', () => {
    it('delegates multi-mode runs to runDecisionGraph when enabled', async () => {
        const orchestrator = new TradingOrchestrator();
        const context = {
            market_price_history: 'history',
            market_technical_report: 'market',
            social_stock_news: 'social news',
            social_reddit_summary: 'social summary',
            news_company: 'company news',
            news_reddit: 'reddit news',
            news_global: 'global news',
            fundamentals_summary: 'fundamentals summary',
            fundamentals_balance_sheet: 'balance sheet',
            fundamentals_cashflow: 'cashflow',
            fundamentals_income_stmt: 'income statement',
            fundamentals_insider_transactions: 'insider',
        };
        const payload = {
            symbol: 'AAPL',
            tradeDate: '2025-01-10',
            context,
        };
        const result = await orchestrator.run(payload);
        expect(runDecisionGraphMock).toHaveBeenCalledOnce();
        expect(runDecisionGraphMock).toHaveBeenCalledWith(payload);
        expect(result).toEqual(decisionStub);
    });
});
//# sourceMappingURL=orchestrator.smoke.test.js.map
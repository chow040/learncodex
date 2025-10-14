/**
 * Canonical identifiers for LangChain tools that analysts can request.
 * These names should remain stable because they appear in analyst prompts.
 */
export const TOOL_IDS = {
    FINNHUB_BALANCE_SHEET: 'get_finnhub_balance_sheet',
    FINNHUB_CASHFLOW: 'get_finnhub_cashflow',
    FINNHUB_INCOME_STATEMENT: 'get_finnhub_income_stmt',
    FINNHUB_INSIDER_SENTIMENT: 'get_finnhub_company_insider_sentiment',
    FINNHUB_INSIDER_TRANSACTIONS: 'get_finnhub_company_insider_transactions',
    FINNHUB_MARKET_NEWS: 'get_finnhub_news',
    GOOGLE_NEWS: 'get_google_news',
    REDDIT_NEWS: 'get_reddit_news',
    STOCK_NEWS_OPENAI: 'get_stock_news_openai',
    YFIN_DATA: 'get_YFin_data',
    YFIN_DATA_ONLINE: 'get_YFin_data_online',
    STOCKSTATS_INDICATORS: 'get_stockstats_indicators_report',
    STOCKSTATS_INDICATORS_ONLINE: 'get_stockstats_indicators_report_online',
};
/**
 * Runtime registry populated during orchestrator bootstrap. Each entry exposes
 * a factory for the LangChain StructuredTool instance so we can inject symbol,
 * trade date, cached context, and logging hooks at execution time.
 *
 * Phase 2 will flesh out each registration. For now we provide the scaffolding
 * so the upcoming tool implementations have a central home.
 */
const registry = {};
export const getToolRegistry = () => registry;
export const registerTool = (registration) => {
    if (registry[registration.name]) {
        throw new Error(`Tool ${registration.name} already registered.`);
    }
    registry[registration.name] = registration;
};
export const resolveTools = (toolIds, context, logger) => {
    const resolved = {};
    for (const id of toolIds) {
        const entry = registry[id];
        if (!entry) {
            throw new Error(`Tool ${id} is not registered.`);
        }
        const toolContext = logger
            ? { ...context, logger }
            : context;
        resolved[id] = entry.create(toolContext);
    }
    return resolved;
};
/**
 * Placeholder helper for Phase 2 tasks. Each concrete tool wrapper will export
 * a `register*Tool` function that calls `registerTool` with schema + handler.
 */
export const placeholderTool = (name, description) => {
    registerTool({
        name,
        description,
        schema: { type: 'object', properties: {} },
        create: (_context) => {
            throw new Error(`Tool ${name} is not implemented yet.`);
        },
    });
};
//# sourceMappingURL=toolRegistry.js.map
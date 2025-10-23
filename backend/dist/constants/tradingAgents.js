export const TRADING_ANALYST_IDS = ['fundamental', 'market', 'news', 'social'];
export const DEFAULT_TRADING_ANALYSTS = [...TRADING_ANALYST_IDS];
export const isTradingAnalystId = (value) => {
    return typeof value === 'string' && TRADING_ANALYST_IDS.includes(value);
};
//# sourceMappingURL=tradingAgents.js.map
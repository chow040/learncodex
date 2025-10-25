export const createInitialState = (symbol, tradeDate, context) => ({
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
//# sourceMappingURL=types.js.map
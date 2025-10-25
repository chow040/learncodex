const sanitizeContent = (content) => content?.trim() ?? '';
export const createDebateRoundEntry = (persona, round, content) => ({
    persona,
    round,
    content: sanitizeContent(content),
    timestamp: new Date().toISOString(),
});
export const createRiskDebateRoundEntry = (persona, round, content) => ({
    persona,
    round,
    content: sanitizeContent(content),
    timestamp: new Date().toISOString(),
});
export const withIncrementedInvestRound = (metadata, round) => ({
    ...metadata,
    invest_round: typeof round === 'number' ? round : Number(metadata.invest_round ?? 0) + 1,
});
export const withIncrementedRiskRound = (metadata, round) => ({
    ...metadata,
    risk_round: typeof round === 'number' ? round : Number(metadata.risk_round ?? 0) + 1,
});
export const canContinueInvestment = (metadata, maxRounds) => {
    if (!metadata)
        return maxRounds > 0;
    if (metadata.invest_continue === false)
        return false;
    const completed = Number(metadata.invest_round ?? 0);
    return completed < maxRounds;
};
export const canContinueRisk = (metadata, maxRounds) => {
    if (!metadata)
        return maxRounds > 0;
    if (metadata.risk_continue === false)
        return false;
    const completed = Number(metadata.risk_round ?? 0);
    return completed < maxRounds;
};
//# sourceMappingURL=stateUtils.js.map
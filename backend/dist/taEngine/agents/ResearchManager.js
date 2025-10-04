export class ResearchManager {
    judge(history, marketReport, sentimentReport, newsReport, fundamentalsReport, pastMemories) {
        const system = `As the portfolio manager and debate facilitator, evaluate the bull vs bear debate and make a definitive recommendation: Buy, Sell, or Hold (Hold only if strongly justified). Provide rationale and strategic actions. Learn from past mistakes.`;
        const user = [
            `Past reflections:\n${pastMemories || '(none)'}`,
            `Debate History:\n${history || '(none)'}`,
            `Market report:\n${marketReport}`,
            `Sentiment report:\n${sentimentReport}`,
            `News report:\n${newsReport}`,
            `Fundamentals report:\n${fundamentalsReport}`,
        ].join('\n\n');
        return { roleLabel: 'Research Manager', system, user };
    }
}
//# sourceMappingURL=ResearchManager.js.map
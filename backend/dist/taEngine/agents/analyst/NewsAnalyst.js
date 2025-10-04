export class NewsAnalyst {
    analyze(ctx, symbol, tradeDate) {
        const toolNames = [
            'GoogleNews',
            'FinnhubNews',
        ].join(', ');
        const systemMessage = `You are a news researcher tasked with analyzing recent news and trends over the past week. Please write a comprehensive report of the current state of the world that is relevant for trading and macroeconomics. Look at news from EODHD, and finnhub to be comprehensive. Do not simply state the trends are mixed, provide detailed and finegrained analysis and insights that may help traders make decisions. Make sure to append a Makrdown table at the end of the report to organize key points in the report, organized and easy to read.`;
        const collabHeader = `You are a helpful AI assistant, collaborating with other assistants. Use the provided tools to progress towards answering the question. If you are unable to fully answer, that's OK; another assistant with different tools will help where you left off. Execute what you can to make progress. If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable, prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop. You have access to the following tools: ${toolNames}.\n${systemMessage}For your reference, the current date is ${tradeDate}. We are looking at the company ${symbol}`;
        const userLines = [];
        if (ctx.news_company)
            userLines.push(`Company news:\n${ctx.news_company}`);
        if (ctx.news_reddit)
            userLines.push(`Reddit news:\n${ctx.news_reddit}`);
        if (ctx.news_global)
            userLines.push(`Global macro news:\n${ctx.news_global}`);
        return {
            roleLabel: 'News Analyst',
            system: collabHeader,
            user: userLines.join('\n\n') || 'No news provided.',
        };
    }
}
//# sourceMappingURL=NewsAnalyst.js.map
export class SocialAnalyst {
    analyze(ctx, symbol, tradeDate) {
        const toolNames = ['get_stock_news_openai', 'get_reddit_stock_info'].join(', ');
        const systemMessage = `You are a social media and company specific news researcher/analyst tasked with analyzing social media posts, recent company news, and public sentiment for a specific company over the past week. You will be given a company's name your objective is to write a comprehensive long report detailing your analysis, insights, and implications for traders and investors on this company's current state after looking at social media and what people are saying about that company, analyzing sentiment data of what people feel each day about the company, and looking at recent company news. Try to look at all sources possible from social media to sentiment to news. Do not simply state the trends are mixed, provide detailed and finegrained analysis and insights that may help traders make decisions. Make sure to append a Makrdown table at the end of the report to organize key points in the report, organized and easy to read.`;
        const collabHeader = `You are a helpful AI assistant, collaborating with other assistants. Use the provided tools to progress towards answering the question. If you are unable to fully answer, that's OK; another assistant with different tools will help where you left off. Execute what you can to make progress. If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable, prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop. You have access to the following tools: ${toolNames}.\n${systemMessage}For your reference, the current date is ${tradeDate}. The current company we want to analyze is ${symbol}`;
        const userLines = [];
        if (ctx.social_stock_news)
            userLines.push(`Social stock buzz:\n${ctx.social_stock_news}`);
        if (ctx.social_reddit_summary)
            userLines.push(`Reddit summary:\n${ctx.social_reddit_summary}`);
        return {
            roleLabel: 'Social Analyst',
            system: collabHeader,
            user: userLines.join('\n\n') || 'No social data provided.',
        };
    }
}
//# sourceMappingURL=SocialAnalyst.js.map
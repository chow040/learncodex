import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
export const TRADER_SYSTEM_PROMPT = `You are a trading agent analyzing market data to make investment decisions. Provide a specific recommendation to buy, sell, or hold. Always conclude with: FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**. Learn from past decisions.`;
export const buildTraderUserMessage = (input) => {
    const lines = [
        `Company: ${input.company}`,
        `Proposed investment plan: ${input.plan}`,
        `Market report:\n${input.marketReport}`,
        `Sentiment report:\n${input.sentimentReport}`,
        `News report:\n${input.newsReport}`,
        `Fundamentals report:\n${input.fundamentalsReport}`,
        `Past reflections:\n${input.pastMemories || 'No past memories found.'}`,
    ];
    return lines.join('\n\n');
};
const messageToString = (message) => {
    if (typeof message === 'string')
        return message;
    if (message instanceof AIMessage) {
        if (typeof message.content === 'string')
            return message.content;
        if (Array.isArray(message.content)) {
            return message.content
                .map((chunk) => (typeof chunk === 'string' ? chunk : JSON.stringify(chunk)))
                .join('');
        }
        return message.content ? JSON.stringify(message.content) : '';
    }
    if (message && typeof message.content === 'string') {
        return message.content;
    }
    return JSON.stringify(message ?? '');
};
export const createTraderRunnable = (llm) => {
    const prompt = ChatPromptTemplate.fromMessages([
        ['system', TRADER_SYSTEM_PROMPT],
        ['human', '{userMessage}'],
    ]);
    const prepareInputs = new RunnableLambda({
        func: async (input) => ({
            userMessage: buildTraderUserMessage(input),
        }),
    });
    const convertOutput = new RunnableLambda({
        func: async (message) => messageToString(message),
    });
    return RunnableSequence.from([
        prepareInputs,
        prompt,
        llm,
        convertOutput,
    ]);
};
//# sourceMappingURL=traderRunnable.js.map
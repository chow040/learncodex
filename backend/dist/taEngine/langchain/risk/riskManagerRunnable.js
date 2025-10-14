import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
export const RISK_MANAGER_SYSTEM_PROMPT = `As the Risk Management Judge and Debate Facilitator, evaluate risky/safe/neutral debate and output a clear recommendation: Buy, Sell, or Hold. Include detailed reasoning. Learn from past mistakes.`;
export const buildRiskManagerUserMessage = (input) => {
    const lines = [
        `Trader plan:\n${input.traderPlan}`,
        `Debate history:\n${input.debateHistory || '(none)'}`,
        `Market report:\n${input.marketReport}`,
        `Sentiment report:\n${input.sentimentReport}`,
        `News report:\n${input.newsReport}`,
        `Fundamentals report:\n${input.fundamentalsReport}`,
        `Past reflections:\n${input.pastMemories || '(none)'}`,
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
export const createRiskManagerRunnable = (llm) => {
    const prompt = ChatPromptTemplate.fromMessages([
        ['system', RISK_MANAGER_SYSTEM_PROMPT],
        ['human', '{userMessage}'],
    ]);
    const prepareInputs = new RunnableLambda({
        func: async (input) => ({
            userMessage: buildRiskManagerUserMessage(input),
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
//# sourceMappingURL=riskManagerRunnable.js.map
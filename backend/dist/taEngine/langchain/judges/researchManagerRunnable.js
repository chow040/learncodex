import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
export const RESEARCH_MANAGER_SYSTEM_PROMPT = `As the portfolio manager and debate facilitator, evaluate the bull vs bear debate and make a definitive recommendation: Buy, Sell, or Hold (Hold only if strongly justified). Provide rationale and strategic actions. Learn from past mistakes.`;
export const buildResearchManagerUserMessage = (input) => {
    const lines = [
        `Past reflections:\n${input.pastMemories || '(none)'}`,
        `Debate History:\n${input.debateHistory || '(none)'}`,
        `Market report:\n${input.marketReport}`,
        `Sentiment report:\n${input.sentimentReport}`,
        `News report:\n${input.newsReport}`,
        `Fundamentals report:\n${input.fundamentalsReport}`,
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
export const createResearchManagerRunnable = (llm) => {
    const prompt = ChatPromptTemplate.fromMessages([
        ['system', RESEARCH_MANAGER_SYSTEM_PROMPT],
        ['human', '{userMessage}'],
    ]);
    const prepareInputs = new RunnableLambda({
        func: async (input) => ({
            userMessage: buildResearchManagerUserMessage(input),
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
//# sourceMappingURL=researchManagerRunnable.js.map
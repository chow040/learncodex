import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
export const messageToString = (message) => {
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
export const buildAnalystRunnable = (llm, prompt, buildUser) => RunnableSequence.from([
    new RunnableLambda({
        func: async (input) => ({ userMessage: buildUser(input) }),
    }),
    prompt,
    llm,
    new RunnableLambda({
        func: async (message) => messageToString(message),
    }),
]);
//# sourceMappingURL=riskAnalystCommon.js.map
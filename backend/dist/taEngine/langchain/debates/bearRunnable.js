import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
export const BEAR_SYSTEM_PROMPT = `You are a Bear Analyst making the case against investing. Emphasize risks, challenges, and negative indicators. Engage directly with the bull's latest argument. Be conversational, no special formatting.`;
export const buildBearUserMessage = (input) => {
    const lines = [
        `Symbol: ${input.symbol} | Date: ${input.tradeDate}`,
        `Market research report:\n${input.context.market_technical_report}`,
        `Social media sentiment report:\n${input.context.social_reddit_summary}`,
        `Latest world affairs/news:\n${input.context.news_global}`,
        `Fundamentals summary:\n${input.context.fundamentals_summary || 'No fundamentals summary provided.'}`,
        `Past reflections:\n${input.reflections || '(none)'}`,
        `Conversation history:\n${input.history || '(none)'}`,
        `Last bull argument:\n${input.opponentArgument || '(none)'}`,
        'Deliver a compelling bear argument and directly refute the bull’s points.',
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
export const createBearDebateRunnable = (llm) => {
    const prompt = ChatPromptTemplate.fromMessages([
        ['system', BEAR_SYSTEM_PROMPT],
        ['human', '{userMessage}'],
    ]);
    const prepareInputs = new RunnableLambda({
        func: async (input) => ({
            userMessage: buildBearUserMessage(input),
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
//# sourceMappingURL=bearRunnable.js.map
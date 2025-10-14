import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
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
export const RISKY_SYSTEM_PROMPT = 'Risky Analyst: champion high-reward strategies, rebut conservative and neutral points. Conversational, no special formatting.';
export const SAFE_SYSTEM_PROMPT = 'Safe/Conservative Analyst: protect assets, minimize volatility, rebut risky and neutral. Conversational, no special formatting.';
export const NEUTRAL_SYSTEM_PROMPT = 'Neutral Analyst: balanced perspective, challenge risky and safe where over/under cautious. Conversational, no special formatting.';
export const RISKY_PROMPT = ChatPromptTemplate.fromMessages([
    ['system', RISKY_SYSTEM_PROMPT],
    ['human', '{userMessage}'],
]);
export const SAFE_PROMPT = ChatPromptTemplate.fromMessages([
    ['system', SAFE_SYSTEM_PROMPT],
    ['human', '{userMessage}'],
]);
export const NEUTRAL_PROMPT = ChatPromptTemplate.fromMessages([
    ['system', NEUTRAL_SYSTEM_PROMPT],
    ['human', '{userMessage}'],
]);
export const buildRiskBaseSections = (input) => [
    `Trader plan:\n${input.traderPlan}`,
    `Market report:\n${input.context.market_technical_report}`,
    `Sentiment report:\n${input.context.social_reddit_summary}`,
    `News report:\n${input.context.news_global}`,
    `Debate history:\n${input.history || '(none)'}`,
];
export const buildRiskyUserMessage = (input) => {
    const sections = buildRiskBaseSections(input);
    sections.push(`Last safe response:\n${input.lastSafe || '(none)'}`);
    sections.push(`Last neutral response:\n${input.lastNeutral || '(none)'}`);
    return sections.join('\n\n');
};
export const buildSafeUserMessage = (input) => {
    const sections = buildRiskBaseSections(input);
    sections.push(`Last risky response:\n${input.lastRisky || '(none)'}`);
    sections.push(`Last neutral response:\n${input.lastNeutral || '(none)'}`);
    return sections.join('\n\n');
};
export const buildNeutralUserMessage = (input) => {
    const sections = buildRiskBaseSections(input);
    sections.push(`Last risky response:\n${input.lastRisky || '(none)'}`);
    sections.push(`Last safe response:\n${input.lastSafe || '(none)'}`);
    return sections.join('\n\n');
};
const buildRunnable = (llm, prompt, buildUser) => RunnableSequence.from([
    new RunnableLambda({
        func: async (input) => ({ userMessage: buildUser(input) }),
    }),
    prompt,
    llm,
    new RunnableLambda({
        func: async (message) => messageToString(message),
    }),
]);
export const createRiskyAnalystRunnable = (llm) => buildRunnable(llm, RISKY_PROMPT, buildRiskyUserMessage);
export const createSafeAnalystRunnable = (llm) => buildRunnable(llm, SAFE_PROMPT, buildSafeUserMessage);
export const createNeutralAnalystRunnable = (llm) => buildRunnable(llm, NEUTRAL_PROMPT, buildNeutralUserMessage);
//# sourceMappingURL=riskAnalystRunnables.js.map
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
import { TOOL_IDS } from '../toolRegistry.js';
const MISSING_PLACEHOLDER = 'Not provided by internal engine at this time.';
export const SOCIAL_SYSTEM_PROMPT = `You are a social media and company specific news researcher/analyst tasked with analyzing social media posts, recent company news, and public sentiment for a specific company over the past week. You will be given a company's name your objective is to write a comprehensive long report detailing your analysis, insights, and implications for traders and investors on this company's current state after looking at social media and what people are saying about that company, analyzing sentiment data of what people feel each day about the company, and looking at recent company news. Try to look at all sources possible from social media to sentiment to news. Do not simply state the trends are mixed, provide detailed and finegrained analysis and insights that may help traders make decisions. Make sure to append a Makrdown table at the end of the report to organize key points in the report, organized and easy to read.`;
const REQUIRED_TOOL_IDS = [
    TOOL_IDS.STOCK_NEWS_OPENAI,
    TOOL_IDS.REDDIT_NEWS,
];
const formatToolReminder = (tools) => {
    const normalized = Array.isArray(tools) ? tools : [tools];
    if (normalized.length === 0)
        return '';
    if (normalized.length === 1)
        return normalized[0];
    if (normalized.length === 2)
        return `${normalized[0]} or ${normalized[1]}`;
    const [last, ...rest] = normalized.slice().reverse();
    return `${rest.reverse().join(', ')}, or ${last}`;
};
export const buildSocialCollaborationHeader = (context) => {
    const toolList = REQUIRED_TOOL_IDS.join(', ');
    return `You are a helpful AI assistant, collaborating with other assistants. Use the provided tools to progress towards answering the question. If you are unable to fully answer, that's OK; another assistant with different tools will help where you left off. Execute what you can to make progress. If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable, prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop. You have access to the following tools: ${toolList}.\n${SOCIAL_SYSTEM_PROMPT}For your reference, the current date is ${context.tradeDate}. The current company we want to analyze is ${context.symbol}`;
};
const sanitizeValue = (value) => {
    if (value === null || value === undefined)
        return null;
    const trimmed = value.toString().trim();
    if (!trimmed || trimmed === MISSING_PLACEHOLDER)
        return null;
    return trimmed;
};
const buildMissingSection = (label, tools) => `${label}:\nNo ${label.toLowerCase()} data preloaded. Call ${formatToolReminder(tools)} to retrieve the latest updates.`;
export const buildSocialUserContext = (context) => {
    const sections = [];
    const socialBuzz = sanitizeValue(context.social_stock_news);
    const redditSummary = sanitizeValue(context.social_reddit_summary);
    if (socialBuzz) {
        sections.push(`Social stock buzz:\n${socialBuzz}`);
    }
    else {
        sections.push(buildMissingSection('Social stock buzz', 'get_stock_news_openai'));
    }
    if (redditSummary) {
        sections.push(`Reddit summary:\n${redditSummary}`);
    }
    else {
        sections.push(buildMissingSection('Reddit summary', 'get_reddit_news'));
    }
    return sections.join('\n\n');
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
const buildSocialRunnable = (context) => {
    const llm = context.llm;
    if (!llm) {
        throw new Error('Social analyst runnable requires an LLM instance in context.');
    }
    const toolInstances = Array.from(new Set(REQUIRED_TOOL_IDS.map((id) => {
        const tool = context.tools[id];
        if (!tool) {
            throw new Error(`Social analyst runnable missing tool registration for ${id}.`);
        }
        return tool;
    })));
    const prompt = ChatPromptTemplate.fromMessages([
        ['system', SOCIAL_SYSTEM_PROMPT],
        ['human', '{collaborationHeader}\n\n{userContext}'],
    ]);
    const prepareInputs = new RunnableLambda({
        func: async (input) => ({
            collaborationHeader: buildSocialCollaborationHeader(context),
            userContext: buildSocialUserContext(input),
        }),
    });
    const convertOutput = new RunnableLambda({
        func: async (message) => messageToString(message),
    });
    const llmWithTools = typeof llm.bindTools === 'function'
        ? llm.bindTools(toolInstances)
        : llm;
    return RunnableSequence.from([
        prepareInputs,
        prompt,
        llmWithTools,
        convertOutput,
    ]);
};
export const socialAnalystRegistration = {
    id: 'SocialAnalyst',
    label: 'Social Analyst',
    requiredTools: [...REQUIRED_TOOL_IDS],
    createRunnable: (context) => buildSocialRunnable(context),
};
//# sourceMappingURL=socialRunnable.js.map
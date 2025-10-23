import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
import { TOOL_IDS } from '../toolRegistry.js';
const KNOWN_PLACEHOLDERS = new Set([
    'Not provided by internal engine at this time.',
    'Detailed statement data not ingested via TradingAgents bridge.',
]);
export const FUNDAMENTALS_SYSTEM_PROMPT = `You are a researcher tasked with analyzing fundamental information over the past week about a company. Please write a comprehensive report of the company's fundamental information such as financial documents, company profile, basic company financials, company financial history, insider sentiment and insider transactions to gain a full view of the company's fundamental information to inform traders. Make sure to include as much detail as possible. Do not simply state the trends are mixed, provide detailed and finegrained analysis and insights that may help traders make decisions. Make sure to append a Markdown table at the end of the report to organize key points in the report, organized and easy to read.`;
const REQUIRED_TOOL_IDS = [
    TOOL_IDS.FINNHUB_BALANCE_SHEET,
    TOOL_IDS.FINNHUB_CASHFLOW,
    TOOL_IDS.FINNHUB_INCOME_STATEMENT,
    TOOL_IDS.FINNHUB_INSIDER_TRANSACTIONS,
    TOOL_IDS.FINNHUB_INSIDER_SENTIMENT,
];
const sanitizeValue = (value) => {
    if (value === null || value === undefined)
        return null;
    const trimmed = value.toString().trim();
    if (!trimmed || KNOWN_PLACEHOLDERS.has(trimmed))
        return null;
    return trimmed;
};
const formatReminder = (message) => message;
export const buildFundamentalsCollaborationHeader = (context) => {
    const toolList = REQUIRED_TOOL_IDS.join(', ');
    return `You are a helpful AI assistant, collaborating with other assistants. You have access to the following tools: ${toolList}. Use the tools as needed to fetch real fundamentals before writing your report. Do not summarize placeholders. If a tool fails, try another. If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable, prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop.\n${FUNDAMENTALS_SYSTEM_PROMPT} For your reference, the current date is ${context.tradeDate}. The company we want to look at is ${context.symbol}`;
};
export const buildFundamentalsUserContext = (context) => {
    const sections = [];
    const balanceSheet = sanitizeValue(context.fundamentals_balance_sheet);
    if (balanceSheet) {
        sections.push(`Balance sheet:\n${balanceSheet}`);
    }
    else {
        sections.push(formatReminder('Balance sheet:\nNo balance sheet data preloaded. Call get_finnhub_balance_sheet to retrieve the latest figures.'));
    }
    const cashFlow = sanitizeValue(context.fundamentals_cashflow);
    if (cashFlow) {
        sections.push(`Cash flow:\n${cashFlow}`);
    }
    else {
        sections.push(formatReminder('Cash flow:\nNo cash flow data preloaded. Call get_finnhub_cashflow to retrieve the latest figures.'));
    }
    const incomeStatement = sanitizeValue(context.fundamentals_income_stmt);
    if (incomeStatement) {
        sections.push(`Income statement:\n${incomeStatement}`);
    }
    else {
        sections.push(formatReminder('Income statement:\nNo income statement data preloaded. Call get_finnhub_income_stmt to retrieve the latest figures.'));
    }
    sections.push(formatReminder('Insider data:\nNo insider transactions or sentiment data preloaded. Call get_finnhub_company_insider_transactions and get_finnhub_company_insider_sentiment to retrieve the latest details.'));
    return sections.join('\n\n');
};
const aiMessageToString = (message) => {
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
const buildFundamentalsRunnable = (context) => {
    const llm = context.llm;
    if (!llm) {
        throw new Error('Fundamentals analyst runnable requires an LLM instance in context.');
    }
    const toolInstances = Array.from(new Set(REQUIRED_TOOL_IDS.map((id) => {
        const tool = context.tools[id];
        if (!tool) {
            throw new Error(`Fundamentals analyst runnable missing tool registration for ${id}.`);
        }
        return tool;
    })));
    const prompt = ChatPromptTemplate.fromMessages([
        ['system', FUNDAMENTALS_SYSTEM_PROMPT],
        ['human', '{collaborationHeader}\n\n{userContext}'],
        new MessagesPlaceholder('messages'),
    ]);
    const prepareInputs = new RunnableLambda({
        func: async (input) => ({
            collaborationHeader: buildFundamentalsCollaborationHeader(context),
            userContext: buildFundamentalsUserContext(input),
            messages: input.messages ?? [],
        }),
    });
    const llmWithTools = typeof llm.bindTools === 'function'
        ? llm.bindTools(toolInstances)
        : llm;
    return RunnableSequence.from([
        prepareInputs,
        prompt,
        llmWithTools,
    ]);
};
export const fundamentalsAnalystRegistration = {
    id: 'FundamentalsAnalyst',
    label: 'Fundamentals Analyst',
    requiredTools: [...REQUIRED_TOOL_IDS],
    createRunnable: (context) => buildFundamentalsRunnable(context),
};
//# sourceMappingURL=fundamentalsRunnable.js.map
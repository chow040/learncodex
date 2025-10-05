import { env } from '../../config/env.js';
import { logFundamentalsToolCalls } from '../logger.js';
import { getFinancialsReported } from '../../services/finnhubService.js';
import { buildFinancialStatementDetail } from '../../services/financialsFormatter.js';
export class StateFundamentalsAgent {
    client;
    toolHandlers;
    fundamentalsTools;
    constructor(client) {
        this.client = client;
        this.setupToolsAndHandlers();
    }
    setupToolsAndHandlers() {
        this.fundamentalsTools = [
            {
                type: 'function',
                function: {
                    name: 'get_finnhub_company_insider_sentiment',
                    description: 'Return insider sentiment data gathered for the company.',
                    parameters: { type: 'object', properties: {} },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'get_finnhub_company_insider_transactions',
                    description: 'Return recent insider transactions gathered for the company.',
                    parameters: { type: 'object', properties: {} },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'get_finnhub_balance_sheet',
                    description: 'Return the latest balance sheet snapshot that is available to the analyst.',
                    parameters: {
                        type: 'object',
                        properties: {
                            freq: { type: 'string', description: 'Desired frequency, e.g. annual or quarterly.' },
                            ticker: { type: 'string', description: 'Ticker symbol to fetch.' },
                            curr_date: { type: 'string', description: 'Reference date in yyyy-mm-dd format.' },
                            force_refresh: { type: 'boolean', description: 'If true, refetch even if cached data exists.' },
                        },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'get_finnhub_cashflow',
                    description: 'Return the latest cashflow statement snapshot for the company.',
                    parameters: {
                        type: 'object',
                        properties: {
                            freq: { type: 'string', description: 'Desired frequency, e.g. annual or quarterly.' },
                            ticker: { type: 'string', description: 'Ticker symbol to fetch.' },
                            curr_date: { type: 'string', description: 'Reference date in yyyy-mm-dd format.' },
                            force_refresh: { type: 'boolean', description: 'If true, refetch even if cached data exists.' },
                        },
                    },
                },
            },
            {
                type: 'function',
                function: {
                    name: 'get_finnhub_income_stmt',
                    description: 'Return the latest income statement snapshot for the company.',
                    parameters: {
                        type: 'object',
                        properties: {
                            freq: { type: 'string', description: 'Desired frequency, e.g. annual or quarterly.' },
                            ticker: { type: 'string', description: 'Ticker symbol to fetch.' },
                            curr_date: { type: 'string', description: 'Reference date in yyyy-mm-dd format.' },
                            force_refresh: { type: 'boolean', description: 'If true, refetch even if cached data exists.' },
                        },
                    },
                },
            },
        ];
    }
    createToolHandlers(context, symbol) {
        const fallbackNoData = 'No data available.';
        const placeholderValues = new Set([
            'Not provided by internal engine at this time.',
            'No balance sheet data preloaded. Call get_finnhub_balance_sheet to retrieve the latest figures.',
            'No cash flow data preloaded. Call get_finnhub_cashflow to retrieve the latest figures.',
            'No income statement data preloaded. Call get_finnhub_income_stmt to retrieve the latest figures.',
        ]);
        const sanitizeFundamentalsValue = (value) => {
            if (value === undefined || value === null)
                return fallbackNoData;
            const str = value.toString().trim();
            if (!str || placeholderValues.has(str))
                return fallbackNoData;
            return str;
        };
        let financialReportsCache = null;
        const ensureFinancialReports = async () => {
            if (!financialReportsCache) {
                financialReportsCache = await getFinancialsReported(symbol).catch(() => []);
            }
            return financialReportsCache;
        };
        const normalizeToolArgs = (rawArgs) => {
            const ticker = typeof rawArgs?.ticker === 'string' ? rawArgs.ticker.trim().toUpperCase() : '';
            const freq = typeof rawArgs?.freq === 'string' ? rawArgs.freq.trim().toLowerCase() : null;
            const currDate = typeof rawArgs?.curr_date === 'string' ? rawArgs.curr_date.trim() : null;
            const forceRefresh = rawArgs?.force_refresh === true || rawArgs?.refresh === true;
            return {
                ticker: ticker || symbol,
                freq,
                currDate,
                forceRefresh,
            };
        };
        const appendArgsNotes = (detail, argsInfo) => {
            const notes = [];
            if (argsInfo.freq) {
                notes.push(`Frequency request (${argsInfo.freq}) acknowledged; Finnhub financials are returned as reported without additional filtering.`);
            }
            if (argsInfo.currDate) {
                notes.push(`Reference date (${argsInfo.currDate}) noted; latest available filings are returned.`);
            }
            if (!notes.length) {
                return detail;
            }
            return `${detail}\n\n_${notes.join(' ')}_`;
        };
        const fetchFinancialSection = async (section, rawArgs) => {
            const argsInfo = normalizeToolArgs(rawArgs ?? {});
            if (argsInfo.ticker && argsInfo.ticker !== symbol) {
                return `Requested ticker ${argsInfo.ticker} does not match active symbol ${symbol}. Only ${symbol} is available in this session.`;
            }
            if (argsInfo.forceRefresh) {
                financialReportsCache = null;
            }
            try {
                const reports = await ensureFinancialReports();
                const detail = buildFinancialStatementDetail(reports, section, {
                    limitPerStatement: 60,
                });
                if (!detail) {
                    return fallbackNoData;
                }
                return appendArgsNotes(detail, argsInfo);
            }
            catch (err) {
                return fallbackNoData;
            }
        };
        const shouldFetchFromSource = (value, rawArgs) => {
            if (value === fallbackNoData)
                return true;
            if (!rawArgs)
                return false;
            const argsInfo = normalizeToolArgs(rawArgs);
            return argsInfo.forceRefresh;
        };
        return {
            get_finnhub_company_insider_sentiment: async () => sanitizeFundamentalsValue(context.fundamentals_insider_sentiment),
            get_finnhub_company_insider_transactions: async () => sanitizeFundamentalsValue(context.fundamentals_insider_transactions),
            get_finnhub_balance_sheet: async (rawArgs = {}) => {
                const fromContext = sanitizeFundamentalsValue(context.fundamentals_balance_sheet);
                if (!shouldFetchFromSource(fromContext, rawArgs)) {
                    return fromContext;
                }
                return fetchFinancialSection('bs', rawArgs);
            },
            get_finnhub_cashflow: async (rawArgs = {}) => {
                const fromContext = sanitizeFundamentalsValue(context.fundamentals_cashflow);
                if (!shouldFetchFromSource(fromContext, rawArgs)) {
                    return fromContext;
                }
                return fetchFinancialSection('cf', rawArgs);
            },
            get_finnhub_income_stmt: async (rawArgs = {}) => {
                const fromContext = sanitizeFundamentalsValue(context.fundamentals_income_stmt);
                if (!shouldFetchFromSource(fromContext, rawArgs)) {
                    return fromContext;
                }
                return fetchFinancialSection('ic', rawArgs);
            },
        };
    }
    // Initialize state similar to LangGraph's create_initial_state
    createInitialState(systemPrompt, userPrompt, context, symbol, tradeDate) {
        return {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            step_count: 0,
            tool_calls_made: 0,
            completed: false,
            final_output: null,
            context,
            symbol,
            trade_date: tradeDate,
        };
    }
    // Check if should continue similar to LangGraph's conditional logic
    shouldContinue(state) {
        if (state.step_count >= env.maxRecursionLimit) {
            return 'max_steps_reached';
        }
        if (state.tool_calls_made >= env.maxToolSteps) {
            return 'max_steps_reached';
        }
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage?.role === 'assistant' && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
            return 'tools';
        }
        return 'complete';
    }
    // Execute a single step similar to LangGraph's step execution
    async executeStep(state, payload) {
        state.step_count++;
        const nextAction = this.shouldContinue(state);
        if (nextAction === 'max_steps_reached') {
            state.completed = true;
            const lastMsg = state.messages[state.messages.length - 1];
            const content = typeof lastMsg?.content === 'string' ? lastMsg.content : 'Max steps reached without completion';
            state.final_output = content;
            return state;
        }
        if (nextAction === 'tools') {
            return await this.executeToolCalls(state, payload);
        }
        if (nextAction === 'complete') {
            state.completed = true;
            const lastMsg = state.messages[state.messages.length - 1];
            const content = typeof lastMsg?.content === 'string' ? lastMsg.content : 'No output generated';
            state.final_output = content;
            return state;
        }
        return state;
    }
    // Execute tool calls similar to LangGraph's ToolNode
    async executeToolCalls(state, payload) {
        const lastMessage = state.messages[state.messages.length - 1];
        if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
            return state;
        }
        this.toolHandlers = this.createToolHandlers(state.context, state.symbol);
        const toolOutputs = [];
        const logEntries = [];
        for (const toolCall of lastMessage.tool_calls) {
            const name = toolCall.function?.name;
            const handler = this.toolHandlers[name || ''];
            let args = {};
            try {
                if (toolCall.function?.arguments) {
                    args = JSON.parse(toolCall.function.arguments);
                }
            }
            catch {
                // ignore malformed args
            }
            let output;
            try {
                if (!handler) {
                    output = `Tool ${name ?? 'unknown'} is not implemented.`;
                }
                else {
                    output = await handler(args);
                    state.tool_calls_made++;
                }
            }
            catch (err) {
                output = `Failed to execute ${name}: ${err?.message || err}`;
            }
            toolOutputs.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: output,
            });
            logEntries.push({
                toolCallId: toolCall.id,
                name: name || null,
                args,
                output,
            });
        }
        // Log tool calls
        if (logEntries.length) {
            try {
                await logFundamentalsToolCalls(payload, logEntries);
            }
            catch {
                // ignore logging errors
            }
        }
        // Add tool results to messages
        state.messages.push(...toolOutputs);
        // Get next AI response
        try {
            const response = await this.client.chat.completions.create({
                model: env.openAiModel,
                messages: state.messages,
                tools: this.fundamentalsTools,
            });
            const assistantMessage = response.choices[0]?.message;
            if (assistantMessage) {
                state.messages.push(assistantMessage);
            }
        }
        catch (error) {
            state.completed = true;
            state.final_output = 'Error occurred during AI response generation';
            return state;
        }
        return state;
    }
    // Main execution loop similar to LangGraph's graph.stream/invoke
    async executeWithState(systemPrompt, userPrompt, context, symbol, tradeDate, payload) {
        let state = this.createInitialState(systemPrompt, userPrompt, context, symbol, tradeDate);
        this.toolHandlers = this.createToolHandlers(context, symbol);
        // Initial AI call
        try {
            const response = await this.client.chat.completions.create({
                model: env.openAiModel,
                messages: state.messages,
                tools: this.fundamentalsTools,
            });
            const assistantMessage = response.choices[0]?.message;
            if (assistantMessage) {
                state.messages.push({
                    role: 'assistant',
                    content: assistantMessage.content || '',
                    tool_calls: assistantMessage.tool_calls || [],
                });
            }
        }
        catch (error) {
            return 'No data available.';
        }
        // State execution loop
        while (!state.completed && state.step_count < env.maxRecursionLimit) {
            state = await this.executeStep(state, payload);
        }
        return state.final_output || 'No output generated';
    }
}
//# sourceMappingURL=stateFundamentalsAgent.js.map
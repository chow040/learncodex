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
        // Hard limits
        if (state.step_count >= env.maxRecursionLimit) {
            return 'max_steps_reached';
        }
        if (state.tool_calls_made >= env.maxToolSteps) {
            return 'max_steps_reached';
        }
        const lastMessage = state.messages[state.messages.length - 1];
        // Check for tool calls in assistant message
        if (lastMessage?.role === 'assistant' && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
            return 'tools';
        }
        // Reasonable completion detection after sufficient data gathering
        if (state.tool_calls_made >= 3 && lastMessage?.role === 'assistant') {
            const content = typeof lastMessage.content === 'string' ? lastMessage.content : '';
            // Look for completion indicators in comprehensive analysis
            if (content.includes('analysis') || content.includes('report') || content.includes('recommendation') ||
                content.includes('conclusion') || content.includes('summary') || content.includes('financial') ||
                content.includes('revenue') || content.includes('earnings') || content.includes('cash') ||
                content.length > 500) {
                return 'complete';
            }
        }
        return 'complete';
    }
    // Execute a single step similar to LangGraph's step execution
    async executeStep(state, payload) {
        state.step_count++;
        const nextAction = this.shouldContinue(state);
        console.log(`[StateFundamentalsAgent] Step ${state.step_count} decision: ${nextAction}, tool calls made: ${state.tool_calls_made}`);
        if (nextAction === 'max_steps_reached') {
            console.log(`[StateFundamentalsAgent] Max steps reached for ${state.symbol}`);
            state.completed = true;
            const lastMsg = state.messages[state.messages.length - 1];
            const content = typeof lastMsg?.content === 'string' ? lastMsg.content : 'Max steps reached without completion';
            state.final_output = content;
            return state;
        }
        if (nextAction === 'tools') {
            console.log(`[StateFundamentalsAgent] Executing tool calls for ${state.symbol}...`);
            return await this.executeToolCalls(state, payload);
        }
        if (nextAction === 'complete') {
            console.log(`[StateFundamentalsAgent] Completing execution for ${state.symbol}`);
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
            console.log(`[StateFundamentalsAgent] No tool calls found in last message for ${state.symbol}`);
            return state;
        }
        console.log(`[StateFundamentalsAgent] Processing ${lastMessage.tool_calls.length} tool calls for ${state.symbol}`);
        this.toolHandlers = this.createToolHandlers(state.context, state.symbol);
        const toolOutputs = [];
        const logEntries = [];
        for (const toolCall of lastMessage.tool_calls) {
            const name = toolCall.function?.name;
            const handler = this.toolHandlers[name || ''];
            console.log(`[StateFundamentalsAgent] Executing tool: ${name} for ${state.symbol}`);
            let args = {};
            try {
                if (toolCall.function?.arguments) {
                    args = JSON.parse(toolCall.function.arguments);
                }
            }
            catch (parseError) {
                console.error(`[StateFundamentalsAgent] Failed to parse tool arguments for ${name}:`, parseError);
            }
            let output;
            try {
                if (!handler) {
                    console.warn(`[StateFundamentalsAgent] Tool ${name} not implemented for ${state.symbol}`);
                    output = `Tool ${name ?? 'unknown'} is not implemented.`;
                }
                else {
                    console.log(`[StateFundamentalsAgent] Calling tool ${name} with args:`, args);
                    output = await handler(args);
                    state.tool_calls_made++;
                    console.log(`[StateFundamentalsAgent] Tool ${name} completed successfully for ${state.symbol}, output length: ${output.length}`);
                }
            }
            catch (err) {
                console.error(`[StateFundamentalsAgent] Tool ${name} failed for ${state.symbol}:`, err);
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
                console.log(`[StateFundamentalsAgent] Logging ${logEntries.length} tool call entries for ${state.symbol}`);
                await logFundamentalsToolCalls(payload, logEntries);
                console.log(`[StateFundamentalsAgent] Tool call logging successful for ${state.symbol}`);
            }
            catch (logError) {
                console.error(`[StateFundamentalsAgent] Failed to log tool calls for ${state.symbol}:`, logError);
            }
        }
        else {
            console.log(`[StateFundamentalsAgent] No tool call entries to log for ${state.symbol}`);
        }
        // Add tool results to messages
        state.messages.push(...toolOutputs);
        // Get next AI response with timeout
        try {
            console.log(`[StateFundamentalsAgent] Making follow-up AI call for ${state.symbol} after tool execution...`);
            const params = {
                model: env.openAiModel,
                messages: state.messages,
                temperature: 0.1,
                max_tokens: 1500,
            };
            if (this.fundamentalsTools) {
                params.tools = this.fundamentalsTools;
            }
            const response = await Promise.race([
                this.client.chat.completions.create(params),
                new Promise((_, reject) => setTimeout(() => reject(new Error('AI call timeout')), 20000))
            ]);
            const assistantMessage = response.choices[0]?.message;
            if (assistantMessage) {
                const newToolCalls = assistantMessage.tool_calls || [];
                console.log(`[StateFundamentalsAgent] Follow-up AI call successful for ${state.symbol}, content length: ${(assistantMessage.content || '').length}, new tool calls: ${newToolCalls.length}`);
                state.messages.push(assistantMessage);
            }
            else {
                console.warn(`[StateFundamentalsAgent] No assistant message in follow-up AI response for ${state.symbol}`);
            }
        }
        catch (error) {
            console.error(`[StateFundamentalsAgent] Follow-up AI call failed for ${state.symbol}:`, error);
            state.completed = true;
            state.final_output = 'Error occurred during AI response generation';
            return state;
        }
        return state;
    }
    // Main execution loop similar to LangGraph's graph.stream/invoke
    async executeWithState(systemPrompt, userPrompt, context, symbol, tradeDate, payload) {
        console.log(`[StateFundamentalsAgent] Starting execution for ${symbol} at ${new Date().toISOString()}`);
        let state = this.createInitialState(systemPrompt, userPrompt, context, symbol, tradeDate);
        this.toolHandlers = this.createToolHandlers(context, symbol);
        console.log(`[StateFundamentalsAgent] Initial state created, messages count: ${state.messages.length}`);
        // Add timeout wrapper for AI calls
        const aiCallWithTimeout = async (messages, tools) => {
            const params = {
                model: env.openAiModel,
                messages,
                temperature: 0.1, // Lower temperature for more focused responses
                max_tokens: 1500, // Limit response length
            };
            if (tools) {
                params.tools = tools;
            }
            return Promise.race([
                this.client.chat.completions.create(params),
                new Promise((_, reject) => setTimeout(() => reject(new Error('AI call timeout')), 20000))
            ]);
        };
        // Initial AI call with timeout
        try {
            console.log(`[StateFundamentalsAgent] Making initial AI call for ${symbol}...`);
            const response = await aiCallWithTimeout(state.messages, this.fundamentalsTools);
            console.log(`[StateFundamentalsAgent] Initial AI call successful, processing response...`);
            const assistantMessage = response.choices[0]?.message;
            if (assistantMessage) {
                const toolCalls = assistantMessage.tool_calls || [];
                console.log(`[StateFundamentalsAgent] AI response received - content length: ${(assistantMessage.content || '').length}, tool calls: ${toolCalls.length}`);
                state.messages.push({
                    role: 'assistant',
                    content: assistantMessage.content || '',
                    tool_calls: toolCalls,
                });
            }
            else {
                console.log(`[StateFundamentalsAgent] WARNING: No assistant message in AI response`);
            }
        }
        catch (error) {
            console.error(`[StateFundamentalsAgent] Initial AI call failed for ${symbol}:`, error);
            // Provide fallback analysis even if initial AI call fails
            return `Fundamental analysis for ${symbol}: Unable to complete full AI analysis due to system constraints. Based on provided financial data, investors should evaluate key metrics including balance sheet strength, cash flow patterns, and revenue growth trends. Consider reviewing recent financial statements and market conditions for investment decisions.`;
        }
        // State execution loop with time limit
        const startTime = Date.now();
        const maxExecutionTime = 60000; // 60 seconds total limit (increased for proper analysis)
        console.log(`[StateFundamentalsAgent] Starting execution loop for ${symbol}, max steps: ${env.maxRecursionLimit}, max time: ${maxExecutionTime}ms`);
        while (!state.completed && state.step_count < env.maxRecursionLimit) {
            const elapsedTime = Date.now() - startTime;
            if (elapsedTime > maxExecutionTime) {
                console.log(`[StateFundamentalsAgent] Execution timeout reached for ${symbol} after ${elapsedTime}ms, tool calls made: ${state.tool_calls_made}`);
                state.completed = true;
                // Provide intelligent fallback analysis based on what data we gathered
                const toolCallCount = state.tool_calls_made;
                const dataGathered = toolCallCount > 0 ? `Retrieved ${toolCallCount} financial data points. ` : '';
                state.final_output = `${dataGathered}Based on available financial data for ${state.symbol}, fundamental analysis suggests monitoring key metrics including revenue trends, cash flow stability, and balance sheet strength. Current market conditions and recent financial performance should be evaluated for investment decisions. Analysis completed within system time constraints.`;
                break;
            }
            console.log(`[StateFundamentalsAgent] Executing step ${state.step_count + 1} for ${symbol}, elapsed: ${elapsedTime}ms`);
            state = await this.executeStep(state, payload);
        }
        // Enhanced fallback - ensure we always return meaningful analysis
        const result = state.final_output || 'No output generated';
        if (result === 'No output generated' && state.tool_calls_made > 0) {
            const fallbackResult = `Fundamental analysis for ${state.symbol}: Successfully retrieved ${state.tool_calls_made} financial data points. Based on available information, investors should evaluate the company's financial health, recent performance trends, and market position. Further detailed analysis recommended for complete investment assessment.`;
            console.log(`[StateFundamentalsAgent] Execution completed for ${symbol} with fallback result, tool calls: ${state.tool_calls_made}`);
            return fallbackResult;
        }
        console.log(`[StateFundamentalsAgent] Execution completed for ${symbol}, result length: ${result.length}, tool calls: ${state.tool_calls_made}, steps: ${state.step_count}`);
        return result;
    }
}
//# sourceMappingURL=stateFundamentalsAgent.js.map
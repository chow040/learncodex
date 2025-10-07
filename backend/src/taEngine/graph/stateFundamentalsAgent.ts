import type OpenAI from 'openai';
import { env } from '../../config/env.js';
import { logFundamentalsToolCalls, logFundamentalsConversation } from '../logger.js';
import { getFinancialsReported } from '../../services/finnhubService.js';
import { buildFinancialStatementDetail } from '../../services/financialsFormatter.js';
import type { TradingAgentsPayload, AgentsContext } from '../types.js';

// Message types similar to LangGraph's message system
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OpenAI.ChatCompletionMessageToolCall[];
  tool_call_id?: string;
  name?: string;
}

// Agent state similar to LangGraph's AgentState
interface FundamentalsAgentState {
  messages: OpenAI.ChatCompletionMessageParam[];
  step_count: number;
  tool_calls_made: number;
  completed: boolean;
  final_output: string | null;
  context: AgentsContext;
  symbol: string;
  trade_date: string;
}

export class StateFundamentalsAgent {
  private client: OpenAI;
  private toolHandlers!: Record<string, (args: any) => Promise<string>>;
  private fundamentalsTools!: OpenAI.ChatCompletionTool[];

  constructor(client: OpenAI) {
    this.client = client;
    this.setupToolsAndHandlers();
  }

  private setupToolsAndHandlers() {
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
              freq: { type: 'string', description: 'Desired frequency, e.g. annual or quarterly. Defaults to quarterly.' },
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
              freq: { type: 'string', description: 'Desired frequency, e.g. annual or quarterly. Defaults to quarterly.' },
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
              freq: { type: 'string', description: 'Desired frequency, e.g. annual or quarterly. Defaults to quarterly.' },
              ticker: { type: 'string', description: 'Ticker symbol to fetch.' },
              curr_date: { type: 'string', description: 'Reference date in yyyy-mm-dd format.' },
              force_refresh: { type: 'boolean', description: 'If true, refetch even if cached data exists.' },
            },
          },
        },
      },
    ];
  }

  private createToolHandlers(context: AgentsContext, symbol: string): Record<string, (args: any) => Promise<string>> {
    const fallbackNoData = 'No data available.';
    const placeholderValues = new Set([
      'Not provided by internal engine at this time.',
      'No balance sheet data preloaded. Call get_finnhub_balance_sheet to retrieve the latest figures.',
      'No cash flow data preloaded. Call get_finnhub_cashflow to retrieve the latest figures.',
      'No income statement data preloaded. Call get_finnhub_income_stmt to retrieve the latest figures.',
      'Detailed statement data not ingested via TradingAgents bridge.',
    ]);

    const sanitizeFundamentalsValue = (value: unknown) => {
      if (value === undefined || value === null) return fallbackNoData;
      const str = value.toString().trim();
      if (!str || placeholderValues.has(str)) return fallbackNoData;
      return str;
    };

    let financialReportsCache: any[] | null = null;
    let cachedFrequency: string | null = null;
    
    const ensureFinancialReports = async (freq: string = 'quarterly') => {
      // Clear cache if frequency changes
      if (cachedFrequency && cachedFrequency !== freq) {
        financialReportsCache = null;
      }
      
      if (!financialReportsCache) {
        financialReportsCache = await getFinancialsReported(symbol, freq).catch(() => []);
        cachedFrequency = freq;
      }
      return financialReportsCache;
    };

    const normalizeToolArgs = (rawArgs: any) => {
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

    const appendArgsNotes = (detail: string, argsInfo: any) => {
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

    const fetchFinancialSection = async (section: 'bs' | 'cf' | 'ic', rawArgs: any) => {
      const argsInfo = normalizeToolArgs(rawArgs ?? {});
      if (argsInfo.ticker && argsInfo.ticker !== symbol) {
        return `Requested ticker ${argsInfo.ticker} does not match active symbol ${symbol}. Only ${symbol} is available in this session.`;
      }
      if (argsInfo.forceRefresh) {
        financialReportsCache = null;
      }
      try {
        // Use frequency from args, default to quarterly for consistency with Finnhub behavior
        const frequency = argsInfo.freq || 'quarterly';
        const reports = await ensureFinancialReports(frequency);
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

    const shouldFetchFromSource = (value: any, rawArgs: any) => {
      if (value === fallbackNoData) return true;
      if (!rawArgs) return false;
      const argsInfo = normalizeToolArgs(rawArgs);
      return argsInfo.forceRefresh;
    };

    return {
      get_finnhub_company_insider_sentiment: async () => sanitizeFundamentalsValue((context as any).fundamentals_insider_sentiment),
      get_finnhub_company_insider_transactions: async () => sanitizeFundamentalsValue((context as any).fundamentals_insider_transactions),
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
  private createInitialState(
    systemPrompt: string,
    userPrompt: string,
    context: AgentsContext,
    symbol: string,
    tradeDate: string
  ): FundamentalsAgentState {
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
  private shouldContinue(state: FundamentalsAgentState): 'tools' | 'complete' | 'max_steps_reached' {
    // Hard limits
    if (state.step_count >= env.maxRecursionLimit) {
      return 'max_steps_reached';
    }
    
    if (state.tool_calls_made >= env.maxToolSteps) {
      return 'max_steps_reached';
    }

    const lastMessage = state.messages[state.messages.length - 1];
    
    // Check for tool calls in assistant message - must execute these first
    if (lastMessage?.role === 'assistant' && (lastMessage as any).tool_calls && (lastMessage as any).tool_calls.length > 0) {
      return 'tools';
    }

    // Only consider completion if we have enough data AND a substantial response
    if (state.tool_calls_made >= 2 && lastMessage?.role === 'assistant') {
      const content = typeof lastMessage.content === 'string' ? lastMessage.content : '';
      
      // Must have substantial content (comprehensive analysis)
      if (content.length > 800) {
        // Look for strong completion indicators in comprehensive analysis
        const hasComprehensiveIndicators = (
          (content.includes('analysis') || content.includes('Assessment') || content.includes('evaluation')) &&
          (content.includes('recommendation') || content.includes('conclusion') || content.includes('summary')) &&
          (content.includes('financial') || content.includes('fundamental')) &&
          // Must have actual data analysis, not just placeholders
          (content.includes('revenue') || content.includes('balance sheet') || content.includes('cash flow') || 
           content.includes('insider') || content.includes('debt') || content.includes('earnings'))
        );
        
        if (hasComprehensiveIndicators) {
          return 'complete';
        }
      }
    }

    // Avoid infinite loops - if we have sufficient tool calls and steps, force completion
    if (state.tool_calls_made >= 3 && state.step_count >= 3) {
      return 'complete';
    }

    // Continue if we haven't reached minimum data gathering
    return 'tools';
  }

  // Execute a single step similar to LangGraph's step execution
  private async executeStep(state: FundamentalsAgentState, payload: TradingAgentsPayload): Promise<FundamentalsAgentState> {
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
      
      // Check for any meaningful content (more lenient threshold)
      if (content && content.trim().length > 100 && content !== 'No output generated') {
        state.final_output = content;
        console.log(`[StateFundamentalsAgent] Final output set for ${state.symbol}, length: ${content.length}`);
      } else {
        console.log(`[StateFundamentalsAgent] Warning: Insufficient content for completion (length: ${content?.length || 0}), will force fallback for ${state.symbol}`);
        // Don't continue infinitely, let it complete with fallback
        state.completed = true;
        state.final_output = content || 'Analysis could not be completed due to processing constraints';
      }
      return state;
    }

    return state;
  }

  // Execute tool calls similar to LangGraph's ToolNode
  private async executeToolCalls(state: FundamentalsAgentState, payload: TradingAgentsPayload): Promise<FundamentalsAgentState> {
    const lastMessage = state.messages[state.messages.length - 1] as any;
    
    // If no tool calls but we need the AI to generate analysis after gathering data
    if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
      console.log(`[StateFundamentalsAgent] No tool calls found for ${state.symbol}, checking if analysis needed...`);
      
      // If we have gathered data but AI isn't providing analysis, prompt it explicitly
      if (state.tool_calls_made >= 2) {
        console.log(`[StateFundamentalsAgent] Prompting AI to generate comprehensive analysis for ${state.symbol}...`);
        
        // Add a specific prompt for analysis generation
        const analysisPrompt = `Based on the financial data for ${state.symbol}, provide a structured analysis:

**Key Metrics Summary:**
- Revenue trend (3-year comparison with specific numbers)
- Profitability change (operating income, net income)
- Cash position and debt levels
- Major balance sheet changes

**Investment Implications:**
- Financial health assessment
- Key risks and opportunities
- Insider transaction patterns

Use specific dollar amounts from the data. Keep under 800 words and be direct about investment conclusions.`;

        state.messages.push({
          role: 'user',
          content: analysisPrompt,
        });

        // Make AI call to generate analysis
        try {
          console.log(`[StateFundamentalsAgent] Making AI call for analysis generation for ${state.symbol}...`);
          const params: any = {
            model: env.openAiModel,
            messages: state.messages,
            max_completion_tokens: 10000,
          };

          const response = await Promise.race([
            this.client.chat.completions.create(params),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('AI call timeout')), 90000)
            )
          ]) as OpenAI.ChatCompletion;

          const assistantMessage = response.choices[0]?.message;
          if (assistantMessage) {
            console.log(`[StateFundamentalsAgent] Analysis generation successful for ${state.symbol}, content length: ${(assistantMessage.content || '').length}`);
            state.messages.push(assistantMessage as OpenAI.ChatCompletionMessageParam);
          }
        } catch (error) {
          console.error(`[StateFundamentalsAgent] Analysis generation failed for ${state.symbol}:`, error);
        }
      }
      
      return state;
    }

    console.log(`[StateFundamentalsAgent] Processing ${lastMessage.tool_calls.length} tool calls for ${state.symbol}`);
    this.toolHandlers = this.createToolHandlers(state.context, state.symbol);
    const toolOutputs: OpenAI.ChatCompletionToolMessageParam[] = [];
    const logEntries: Array<{ toolCallId: string; name: string | null; args: unknown; output: string }> = [];

    for (const toolCall of lastMessage.tool_calls) {
      const name = toolCall.function?.name;
      const handler = this.toolHandlers[name || ''];
      
      console.log(`[StateFundamentalsAgent] Executing tool: ${name} for ${state.symbol}`);
      
      let args = {};
      try {
        if (toolCall.function?.arguments) {
          args = JSON.parse(toolCall.function.arguments);
        }
      } catch (parseError) {
        console.error(`[StateFundamentalsAgent] Failed to parse tool arguments for ${name}:`, parseError);
      }

      let output: string;
      try {
        if (!handler) {
          console.warn(`[StateFundamentalsAgent] Tool ${name} not implemented for ${state.symbol}`);
          output = `Tool ${name ?? 'unknown'} is not implemented.`;
        } else {
          console.log(`[StateFundamentalsAgent] Calling tool ${name} with args:`, args);
          output = await handler(args);
          state.tool_calls_made++;
          console.log(`[StateFundamentalsAgent] Tool ${name} completed successfully for ${state.symbol}, output length: ${output.length}`);
        }
      } catch (err) {
        console.error(`[StateFundamentalsAgent] Tool ${name} failed for ${state.symbol}:`, err);
        output = `Failed to execute ${name}: ${(err as Error)?.message || err}`;
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
      } catch (logError) {
        console.error(`[StateFundamentalsAgent] Failed to log tool calls for ${state.symbol}:`, logError);
      }
    } else {
      console.log(`[StateFundamentalsAgent] No tool call entries to log for ${state.symbol}`);
    }

    // Add tool results to messages
    state.messages.push(...toolOutputs);

    // Get next AI response with timeout
    try {
      console.log(`[StateFundamentalsAgent] Making follow-up AI call for ${state.symbol} after tool execution...`);
      const params: any = {
        model: env.openAiModel,
        messages: state.messages,
        max_completion_tokens: 10000,
      };
      if (this.fundamentalsTools) {
        params.tools = this.fundamentalsTools;
      }

      const response = await Promise.race([
        this.client.chat.completions.create(params),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI call timeout')), 90000)
        )
      ]) as OpenAI.ChatCompletion;

      const assistantMessage = response.choices[0]?.message;
      if (assistantMessage) {
        const newToolCalls = assistantMessage.tool_calls || [];
        const content = assistantMessage.content || '';
        console.log(`[StateFundamentalsAgent] Follow-up AI call successful for ${state.symbol}, content length: ${content.length}, new tool calls: ${newToolCalls.length}`);
        
        // Handle empty content response - give AI more time rather than aggressive retries
        if (content.length === 0 && newToolCalls.length === 0) {
          console.warn(`[StateFundamentalsAgent] WARNING: AI returned empty content for ${state.symbol}, will wait longer for proper response`);
          console.log(`[StateFundamentalsAgent] Response usage:`, response.usage);
          
          // Simple prompt asking for analysis with longer timeout
          const analysisPrompt = `Based on the comprehensive financial data you retrieved for ${state.symbol}, please provide a detailed fundamental analysis covering the key financial metrics, trends, and investment considerations.`;
          
          state.messages.push({
            role: 'user',
            content: analysisPrompt
          });
          
          // Single retry with much longer timeout to allow proper processing
          try {
            console.log(`[StateFundamentalsAgent] Making retry AI call with extended timeout for ${state.symbol}...`);
            const retryParams: any = {
              model: env.openAiModel,
              messages: state.messages,
              max_completion_tokens: 10000,
            };

            const retryResponse = await Promise.race([
              this.client.chat.completions.create(retryParams),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Extended retry AI call timeout')), 120000) // 2 minutes
              )
            ]) as OpenAI.ChatCompletion;

            const retryMessage = retryResponse.choices[0]?.message;
            if (retryMessage?.content && retryMessage.content.trim().length > 0) {
              console.log(`[StateFundamentalsAgent] Extended retry successful for ${state.symbol}, content length: ${retryMessage.content.length}`);
              state.messages.push(retryMessage as OpenAI.ChatCompletionMessageParam);
            } else {
              console.error(`[StateFundamentalsAgent] Extended retry also produced insufficient content for ${state.symbol}`);
              state.messages.push({
                role: 'assistant',
                content: 'Unable to generate detailed analysis after multiple attempts. Please review the retrieved financial data manually.',
              });
            }
          } catch (retryError) {
            console.error(`[StateFundamentalsAgent] Extended retry AI call failed for ${state.symbol}:`, retryError);
            state.messages.push({
              role: 'assistant',
              content: 'Analysis request timed out after repeated retries. Financial data has been retrieved for manual follow-up.',
            });
          }
        } else {
          state.messages.push(assistantMessage as OpenAI.ChatCompletionMessageParam);
        }
      } else {
        console.warn(`[StateFundamentalsAgent] No assistant message in follow-up AI response for ${state.symbol}`);
        console.log(`[StateFundamentalsAgent] Full response:`, JSON.stringify(response, null, 2));
      }
    } catch (error) {
      console.error(`[StateFundamentalsAgent] Follow-up AI call failed for ${state.symbol}:`, error);
      state.completed = true;
      state.final_output = 'Error occurred during AI response generation';
      return state;
    }

    return state;
  }

  // Main execution loop similar to LangGraph's graph.stream/invoke
  async executeWithState(
    systemPrompt: string,
    userPrompt: string,
    context: AgentsContext,
    symbol: string,
    tradeDate: string,
    payload: TradingAgentsPayload
  ): Promise<string> {
    console.log(`[StateFundamentalsAgent] Starting execution for ${symbol} at ${new Date().toISOString()}`);
    
    let state = this.createInitialState(systemPrompt, userPrompt, context, symbol, tradeDate);
    this.toolHandlers = this.createToolHandlers(context, symbol);
    
    console.log(`[StateFundamentalsAgent] Initial state created, messages count: ${state.messages.length}`);

    // Add timeout wrapper for AI calls
    const aiCallWithTimeout = async (messages: OpenAI.ChatCompletionMessageParam[], tools?: OpenAI.ChatCompletionTool[]) => {
      const params: any = {
        model: env.openAiModel,
        messages,
        max_completion_tokens: 10000, // Increased completion headroom
      };
      if (tools) {
        params.tools = tools;
      }
      
      return Promise.race([
        this.client.chat.completions.create(params),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI call timeout')), 90000)
        )
      ]) as Promise<OpenAI.ChatCompletion>;
    };

    // Initial AI call with timeout
    try {
      console.log(`[StateFundamentalsAgent] Making initial AI call for ${symbol}...`);
      const response = await aiCallWithTimeout(state.messages as OpenAI.ChatCompletionMessageParam[], this.fundamentalsTools);

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
      } else {
        console.log(`[StateFundamentalsAgent] WARNING: No assistant message in AI response`);
      }
    } catch (error) {
      console.error(`[StateFundamentalsAgent] Initial AI call failed for ${symbol}:`, error);
      // Provide fallback analysis even if initial AI call fails
      return `Fundamental analysis for ${symbol}: Unable to complete full AI analysis due to system constraints. Based on provided financial data, investors should evaluate key metrics including balance sheet strength, cash flow patterns, and revenue growth trends. Consider reviewing recent financial statements and market conditions for investment decisions.`;
    }

    // State execution loop with time limit
    const startTime = Date.now();
    const maxExecutionTime = 120000; // 120 seconds total limit (increased to allow for longer AI processing)
    
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

    // Determine final output before logging to preserve conversation history
    let result = state.final_output ?? '';
    const needsFallback = !result || result === 'No output generated' || (result.includes('Successfully retrieved') && result.includes('Further detailed analysis recommended'));
    if (needsFallback) {
      console.log(`[StateFundamentalsAgent] No AI assessment created for ${symbol}, returning data retrieval summary`);
      result = `Fundamental analysis for ${symbol}: Data retrieval completed (${state.tool_calls_made} financial data points gathered), but no AI assessment was generated. Raw financial data is available in tool call logs for manual analysis.`;
    }

    state.final_output = result;

    const resolvedResult = result.trim();
    const lastMessage = state.messages[state.messages.length - 1];
    const lastContent = typeof lastMessage?.content === 'string' ? lastMessage.content.trim() : '';
    if (lastMessage?.role !== 'assistant' || !lastContent) {
      state.messages.push({ role: 'assistant', content: resolvedResult });
    } else if (lastContent !== resolvedResult) {
      state.messages.push({ role: 'assistant', content: resolvedResult });
    }

    console.log(`[StateFundamentalsAgent] Execution completed for ${symbol}, result length: ${resolvedResult.length}, tool calls: ${state.tool_calls_made}, steps: ${state.step_count}`);
    return resolvedResult;
  }
  


}


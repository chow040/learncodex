import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { env } from '../../config/env.js';
import { ensureLangchainToolsRegistered } from '../langchain/tools/bootstrap.js';
import { createAnalystRunnable } from '../langchain/analysts/index.js';
import { buildMarketCollaborationHeader, buildMarketUserContext, MARKET_SYSTEM_PROMPT, } from '../langchain/analysts/marketRunnable.js';
import { buildNewsCollaborationHeader, buildNewsUserContext, NEWS_SYSTEM_PROMPT, } from '../langchain/analysts/newsRunnable.js';
import { buildSocialCollaborationHeader, buildSocialUserContext, SOCIAL_SYSTEM_PROMPT, } from '../langchain/analysts/socialRunnable.js';
import { buildFundamentalsCollaborationHeader, buildFundamentalsUserContext, FUNDAMENTALS_SYSTEM_PROMPT, } from '../langchain/analysts/fundamentalsRunnable.js';
import { DEFAULT_TRADING_ANALYSTS, isTradingAnalystId, } from '../../constants/tradingAgents.js';
ensureLangchainToolsRegistered();
const PERSONA_CONFIGS = {
    market: {
        personaId: 'market',
        runnableId: 'MarketAnalyst',
        label: 'Market Analyst',
        systemPrompt: MARKET_SYSTEM_PROMPT,
        reportKey: 'market',
        buildHeader: buildMarketCollaborationHeader,
        buildUserContext: buildMarketUserContext,
    },
    news: {
        personaId: 'news',
        runnableId: 'NewsAnalyst',
        label: 'News Analyst',
        systemPrompt: NEWS_SYSTEM_PROMPT,
        reportKey: 'news',
        buildHeader: buildNewsCollaborationHeader,
        buildUserContext: buildNewsUserContext,
    },
    social: {
        personaId: 'social',
        runnableId: 'SocialAnalyst',
        label: 'Social Analyst',
        systemPrompt: SOCIAL_SYSTEM_PROMPT,
        reportKey: 'social',
        buildHeader: buildSocialCollaborationHeader,
        buildUserContext: buildSocialUserContext,
    },
    fundamental: {
        personaId: 'fundamental',
        runnableId: 'FundamentalsAnalyst',
        label: 'Fundamentals Analyst',
        systemPrompt: FUNDAMENTALS_SYSTEM_PROMPT,
        reportKey: 'fundamentals',
        buildHeader: buildFundamentalsCollaborationHeader,
        buildUserContext: buildFundamentalsUserContext,
    },
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
const parseToolArguments = (raw) => {
    if (raw === null || raw === undefined) {
        return {};
    }
    if (typeof raw !== 'string') {
        return raw;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return {};
    }
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return trimmed;
    }
};
const formatToolResult = (result) => {
    if (result === null || result === undefined) {
        return 'null';
    }
    if (typeof result === 'string') {
        return result;
    }
    if (typeof result === 'number' || typeof result === 'boolean') {
        return String(result);
    }
    try {
        return JSON.stringify(result);
    }
    catch {
        return String(result);
    }
};
const AnalystAnnotation = Annotation.Root({
    symbol: Annotation(),
    tradeDate: Annotation(),
    context: Annotation(),
    reports: Annotation({
        reducer: (left, right) => ({ ...left, ...right }),
        default: () => ({}),
    }),
    conversationLog: Annotation({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    toolCalls: Annotation({
        reducer: (left, right) => left.concat(right),
        default: () => [],
    }),
    messages: Annotation({
        reducer: (_, right) => right,
        default: () => [],
    }),
    pendingConversation: Annotation({
        reducer: (_, right) => right,
        default: () => null,
    }),
});
const lastMessage = (state) => state.messages[state.messages.length - 1];
const shouldRequestTools = (state) => {
    const last = lastMessage(state);
    if (last instanceof AIMessage && Array.isArray(last.tool_calls) && last.tool_calls.length > 0) {
        return 'tools';
    }
    return 'finalize';
};
const registerPersonaNodes = (graph, config, assets, symbol, tradeDate, llm) => {
    const setupName = `${config.personaId}_Setup`;
    const llmName = `${config.personaId}_LLM`;
    const toolsName = `${config.personaId}_Tools`;
    const finalizeName = `${config.personaId}_Finalize`;
    const clearName = `${config.personaId}_Clear`;
    graph.addNode(setupName, (state) => {
        const analystContext = {
            symbol,
            tradeDate,
            tools: assets.tools,
            agentsContext: state.context,
            llm,
        };
        const header = config.buildHeader(analystContext);
        const userContext = config.buildUserContext(state.context);
        const conversationEntry = {
            roleLabel: config.label,
            system: config.systemPrompt,
            user: `${header}\n\n${userContext}`,
        };
        return {
            pendingConversation: conversationEntry,
            messages: [],
        };
    });
    graph.addNode(llmName, async (state) => {
        const input = { ...state.context, messages: state.messages };
        const message = (await assets.runnable.invoke(input));
        return {
            messages: [...state.messages, message],
        };
    });
    graph.addNode(toolsName, async (state) => {
        const last = lastMessage(state);
        const toolCalls = last instanceof AIMessage ? last.tool_calls ?? [] : [];
        if (!toolCalls.length) {
            return {
                messages: state.messages,
            };
        }
        const newMessages = [...state.messages];
        const personaToolCalls = [];
        for (const call of toolCalls) {
            const tool = assets.tools[call.name];
            const rawArgs = call.arguments ?? call.args;
            const args = parseToolArguments(rawArgs);
            if (!tool) {
                const failure = `Requested tool "${call.name}" is not registered.`;
                personaToolCalls.push({
                    persona: config.label,
                    name: call.name,
                    input: rawArgs ?? null,
                    error: failure,
                    startedAt: new Date(),
                    finishedAt: new Date(),
                    durationMs: 0,
                });
                newMessages.push(new ToolMessage({
                    tool_call_id: call.id ?? call.name,
                    content: failure,
                }));
                continue;
            }
            const startedAt = new Date();
            try {
                const output = await tool.invoke(args);
                personaToolCalls.push({
                    persona: config.label,
                    name: call.name,
                    input: rawArgs ?? null,
                    output: output ?? null,
                    startedAt,
                    finishedAt: new Date(),
                });
                newMessages.push(new ToolMessage({
                    tool_call_id: call.id ?? call.name,
                    content: formatToolResult(output),
                }));
            }
            catch (error) {
                const failure = `Tool invocation failed: ${error instanceof Error ? error.message : String(error)}`;
                personaToolCalls.push({
                    persona: config.label,
                    name: call.name,
                    input: rawArgs ?? null,
                    error: failure,
                    startedAt,
                    finishedAt: new Date(),
                    durationMs: 0,
                });
                newMessages.push(new ToolMessage({
                    tool_call_id: call.id ?? call.name,
                    content: failure,
                }));
            }
        }
        return {
            messages: newMessages,
            toolCalls: personaToolCalls,
        };
    });
    graph.addNode(finalizeName, (state) => {
        const last = [...state.messages].reverse().find((msg) => msg instanceof AIMessage);
        const report = last ? messageToString(last) : '';
        const conversationEntry = state.pendingConversation;
        const updates = {
            reports: { [config.reportKey]: report },
            pendingConversation: null,
        };
        if (conversationEntry) {
            updates.conversationLog = [conversationEntry];
        }
        return updates;
    });
    graph.addNode(clearName, () => ({
        messages: [],
    }));
    graph.addEdge(setupName, llmName);
    graph.addConditionalEdges(llmName, new RunnableLambda({ func: shouldRequestTools }), {
        tools: toolsName,
        finalize: finalizeName,
    });
    graph.addEdge(toolsName, llmName);
    graph.addEdge(finalizeName, clearName);
    return {
        setupName,
        llmName,
        toolsName,
        finalizeName,
        clearName,
    };
};
export const runAnalystStage = async (symbol, tradeDate, context, options) => {
    const enabledAnalysts = (() => {
        const requested = options?.enabledAnalysts;
        if (!requested || requested.length === 0) {
            return [...DEFAULT_TRADING_ANALYSTS];
        }
        const filtered = requested.filter((id) => isTradingAnalystId(id));
        return filtered.length > 0 ? filtered : [...DEFAULT_TRADING_ANALYSTS];
    })();
    const requestedModel = options?.modelId ?? env.openAiModel ?? '';
    const modelId = requestedModel.trim() || env.openAiModel;
    const llmOptions = {
        openAIApiKey: env.openAiApiKey,
        model: modelId,
        temperature: 1,
    };
    if (env.openAiBaseUrl) {
        llmOptions.configuration = { baseURL: env.openAiBaseUrl };
    }
    const llm = new ChatOpenAI(llmOptions);
    const personaAssets = new Map();
    for (const personaId of enabledAnalysts) {
        const config = PERSONA_CONFIGS[personaId];
        if (!config)
            continue;
        const assets = createAnalystRunnable(config.runnableId, {
            symbol,
            tradeDate,
            agentsContext: context,
            llm,
        });
        personaAssets.set(personaId, assets);
    }
    const graph = new StateGraph(AnalystAnnotation);
    let previousClear = null;
    for (const personaId of enabledAnalysts) {
        const config = PERSONA_CONFIGS[personaId];
        const assets = personaAssets.get(personaId);
        if (!config || !assets) {
            continue;
        }
        const nodes = registerPersonaNodes(graph, config, assets, symbol, tradeDate, llm);
        if (previousClear) {
            graph.addEdge(previousClear, nodes.setupName);
        }
        else {
            graph.addEdge(START, nodes.setupName);
        }
        previousClear = nodes.clearName;
    }
    if (previousClear) {
        graph.addEdge(previousClear, END);
    }
    else {
        graph.addEdge(START, END);
    }
    const compiledGraph = graph.compile();
    const initialState = {
        symbol,
        tradeDate,
        context,
        reports: {},
        conversationLog: [],
        toolCalls: [],
        messages: [],
        pendingConversation: null,
    };
    const finalState = await compiledGraph.invoke(initialState, {
        recursionLimit: env.maxRecursionLimit,
    });
    return {
        reports: finalState.reports,
        conversationLog: finalState.conversationLog,
        toolCalls: finalState.toolCalls,
    };
};
//# sourceMappingURL=analystsWorkflow.js.map
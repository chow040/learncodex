import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { env } from '../../config/env.js';
import { ensureLangchainToolsRegistered } from '../langchain/tools/bootstrap.js';
import { createAnalystRunnable } from '../langchain/analysts/index.js';
import { buildMarketCollaborationHeader, buildMarketUserContext, MARKET_SYSTEM_PROMPT, } from '../langchain/analysts/marketRunnable.js';
import { buildNewsCollaborationHeader, buildNewsUserContext, NEWS_SYSTEM_PROMPT, } from '../langchain/analysts/newsRunnable.js';
import { buildSocialCollaborationHeader, buildSocialUserContext, SOCIAL_SYSTEM_PROMPT, } from '../langchain/analysts/socialRunnable.js';
import { buildFundamentalsCollaborationHeader, buildFundamentalsUserContext, FUNDAMENTALS_SYSTEM_PROMPT, } from '../langchain/analysts/fundamentalsRunnable.js';
import { createInitialState, } from './types.js';
ensureLangchainToolsRegistered();
const StateAnnotation = Annotation.Root({
    symbol: Annotation(),
    tradeDate: Annotation(),
    context: Annotation(),
    reports: Annotation({
        reducer: (_, right) => right,
        default: () => ({}),
    }),
    investmentPlan: Annotation({
        reducer: (_, right) => right,
        default: () => null,
    }),
    traderPlan: Annotation({
        reducer: (_, right) => right,
        default: () => null,
    }),
    finalDecision: Annotation({
        reducer: (_, right) => right,
        default: () => null,
    }),
    conversationLog: Annotation({
        default: () => [],
        reducer: (left, right) => left.concat(right),
    }),
    debate: Annotation({
        reducer: (left, right) => ({ ...left, ...right }),
        default: () => ({}),
    }),
    metadata: Annotation({
        reducer: (left, right) => ({ ...left, ...right }),
        default: () => ({}),
    }),
});
const buildAnalystContext = (base) => ({
    ...base,
    tools: {},
});
const analystNode = async (state) => {
    const llmOptions = {
        openAIApiKey: env.openAiApiKey,
        model: env.openAiModel,
        temperature: 1,
    };
    if (env.openAiBaseUrl) {
        llmOptions.configuration = { baseURL: env.openAiBaseUrl };
    }
    const llm = new ChatOpenAI(llmOptions);
    const baseOptions = {
        symbol: state.symbol,
        tradeDate: state.tradeDate,
        agentsContext: state.context,
        llm,
    };
    const logs = [];
    const reports = { ...state.reports };
    const runAnalyst = async (id, label, buildHeader, buildUserContextFn, systemPrompt, key) => {
        const runnable = createAnalystRunnable(id, baseOptions);
        const report = (await runnable.invoke(state.context));
        const header = buildHeader(buildAnalystContext({
            symbol: state.symbol,
            tradeDate: state.tradeDate,
            agentsContext: state.context,
        }));
        const user = buildUserContextFn(state.context);
        logs.push({
            roleLabel: label,
            system: systemPrompt,
            user: `${header}\n\n${user}`,
        });
        reports[key] = report;
    };
    await runAnalyst('MarketAnalyst', 'Market Analyst', buildMarketCollaborationHeader, buildMarketUserContext, MARKET_SYSTEM_PROMPT, 'market');
    await runAnalyst('NewsAnalyst', 'News Analyst', buildNewsCollaborationHeader, buildNewsUserContext, NEWS_SYSTEM_PROMPT, 'news');
    await runAnalyst('SocialAnalyst', 'Social Analyst', buildSocialCollaborationHeader, buildSocialUserContext, SOCIAL_SYSTEM_PROMPT, 'social');
    await runAnalyst('FundamentalsAnalyst', 'Fundamentals Analyst', buildFundamentalsCollaborationHeader, buildFundamentalsUserContext, FUNDAMENTALS_SYSTEM_PROMPT, 'fundamentals');
    return {
        reports,
        conversationLog: logs,
    };
};
const analystGraph = (() => {
    const graph = new StateGraph(StateAnnotation);
    graph.addNode('RunAnalysts', analystNode);
    graph.addEdge(START, 'RunAnalysts');
    graph.addEdge('RunAnalysts', END);
    return graph.compile();
})();
export const runAnalystStage = async (symbol, tradeDate, context) => {
    const initialState = createInitialState(symbol, tradeDate, context);
    const finalState = await analystGraph.invoke(initialState);
    return {
        reports: finalState.reports,
        conversationLog: finalState.conversationLog,
    };
};
//# sourceMappingURL=analystsWorkflow.js.map
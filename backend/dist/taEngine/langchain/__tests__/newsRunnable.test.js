import { describe, expect, test } from 'vitest';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { AIMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { TOOL_IDS } from '../toolRegistry.js';
import { buildNewsUserContext, buildNewsCollaborationHeader, newsAnalystRegistration, } from '../analysts/newsRunnable.js';
const createDummyTool = () => new DynamicStructuredTool({
    name: 'dummy',
    description: 'dummy',
    schema: { type: 'object', properties: {} },
    func: async () => '',
});
const createContext = (overrides = {}) => {
    const tools = {
        [TOOL_IDS.GOOGLE_NEWS]: createDummyTool(),
        [TOOL_IDS.FINNHUB_MARKET_NEWS]: createDummyTool(),
        [TOOL_IDS.REDDIT_NEWS]: createDummyTool(),
    };
    return {
        symbol: 'AAPL',
        tradeDate: '2025-01-02',
        tools,
        agentsContext: {},
        ...overrides,
    };
};
describe('news runnable helpers', () => {
    test('buildNewsUserContext includes provided sections', () => {
        const context = {
            news_company: 'Company update',
            news_reddit: 'Reddit chatter',
            news_global: 'Macro summary',
        };
        const result = buildNewsUserContext(context);
        expect(result).toContain('Company news:\nCompany update');
        expect(result).toContain('Reddit discussions:\nReddit chatter');
        expect(result).toContain('Global macro news:\nMacro summary');
    });
    test('buildNewsUserContext falls back to reminders when data missing', () => {
        const result = buildNewsUserContext({});
        expect(result).toContain('No company news data preloaded.');
        expect(result).toContain('No reddit discussions data preloaded.');
        expect(result).toContain('No global macro news data preloaded.');
    });
    test('buildNewsCollaborationHeader wires tool list and metadata', () => {
        const header = buildNewsCollaborationHeader(createContext());
        expect(header).toContain('get_google_news, get_finnhub_news, get_reddit_news');
        expect(header).toContain('2025-01-02');
        expect(header).toContain('AAPL');
    });
});
describe('news analyst runnable', () => {
    test('invokes LLM with assembled prompt and returns string content', async () => {
        let capturedInput;
        const llm = new RunnableLambda({
            func: async (input) => {
                capturedInput = input;
                return new AIMessage('news analysis');
            },
        });
        const context = createContext({ llm });
        const runnable = newsAnalystRegistration.createRunnable(context);
        const agentsContext = {
            news_company: 'Company bulletin',
            news_reddit: null,
            news_global: null,
        };
        const result = await runnable.invoke(agentsContext);
        expect(result).toBe('news analysis');
        const snapshot = JSON.stringify(capturedInput ?? {});
        expect(snapshot).toContain('Company bulletin');
        expect(snapshot).toContain('No reddit discussions data preloaded');
        expect(snapshot).toContain('No global macro news data preloaded');
    });
});
//# sourceMappingURL=newsRunnable.test.js.map
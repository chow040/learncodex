import { describe, expect, test } from 'vitest';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { RunnableLambda } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
import { TOOL_IDS } from '../toolRegistry.js';
import { buildSocialCollaborationHeader, buildSocialUserContext, socialAnalystRegistration, } from '../analysts/socialRunnable.js';
const createDummyTool = () => new DynamicStructuredTool({
    name: 'dummy',
    description: 'dummy',
    schema: { type: 'object', properties: {} },
    func: async () => '',
});
const createContext = (overrides = {}) => {
    const tools = {
        [TOOL_IDS.STOCK_NEWS_OPENAI]: createDummyTool(),
        [TOOL_IDS.REDDIT_NEWS]: createDummyTool(),
    };
    return {
        symbol: 'TSLA',
        tradeDate: '2025-02-14',
        tools,
        agentsContext: {},
        ...overrides,
    };
};
describe('social analyst helpers', () => {
    test('buildSocialUserContext includes available sections', () => {
        const context = {
            social_stock_news: 'Buzz text',
            social_reddit_summary: 'Reddit mentions',
        };
        const result = buildSocialUserContext(context);
        expect(result).toContain('Social stock buzz:\nBuzz text');
        expect(result).toContain('Reddit summary:\nReddit mentions');
    });
    test('buildSocialUserContext adds reminders when data missing', () => {
        const result = buildSocialUserContext({});
        expect(result).toContain('Call get_stock_news_openai');
        expect(result).toContain('Call get_reddit_news');
    });
    test('buildSocialCollaborationHeader injects metadata', () => {
        const header = buildSocialCollaborationHeader(createContext());
        expect(header).toContain('get_stock_news_openai, get_reddit_news');
        expect(header).toContain('2025-02-14');
        expect(header).toContain('TSLA');
    });
});
describe('social analyst runnable', () => {
    test('invokes LLM and returns string output', async () => {
        let capturedInput;
        const llm = new RunnableLambda({
            func: async (input) => {
                capturedInput = input;
                return new AIMessage('social analysis');
            },
        });
        const context = createContext({ llm });
        const runnable = socialAnalystRegistration.createRunnable(context);
        const agentsContext = {
            social_stock_news: 'High engagement on social media',
            social_reddit_summary: null,
        };
        const result = await runnable.invoke(agentsContext);
        expect(result).toBe('social analysis');
        const snapshot = JSON.stringify(capturedInput ?? {});
        expect(snapshot).toContain('High engagement on social media');
        expect(snapshot).toContain('No reddit summary data preloaded');
    });
});
//# sourceMappingURL=socialRunnable.test.js.map
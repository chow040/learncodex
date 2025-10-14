import { describe, expect, test } from 'vitest';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { RunnableLambda } from '@langchain/core/runnables';
import { AIMessage } from '@langchain/core/messages';
import { TOOL_IDS } from '../toolRegistry.js';
import { buildFundamentalsCollaborationHeader, buildFundamentalsUserContext, fundamentalsAnalystRegistration, } from '../analysts/fundamentalsRunnable.js';
const createDummyTool = () => new DynamicStructuredTool({
    name: 'dummy',
    description: 'dummy',
    schema: { type: 'object', properties: {} },
    func: async () => '',
});
const createContext = (overrides = {}) => {
    const tools = {
        [TOOL_IDS.FINNHUB_BALANCE_SHEET]: createDummyTool(),
        [TOOL_IDS.FINNHUB_CASHFLOW]: createDummyTool(),
        [TOOL_IDS.FINNHUB_INCOME_STATEMENT]: createDummyTool(),
        [TOOL_IDS.FINNHUB_INSIDER_TRANSACTIONS]: createDummyTool(),
        [TOOL_IDS.FINNHUB_INSIDER_SENTIMENT]: createDummyTool(),
    };
    return {
        symbol: 'MSFT',
        tradeDate: '2025-03-10',
        tools,
        agentsContext: {},
        ...overrides,
    };
};
describe('fundamentals helpers', () => {
    test('user context includes available statements', () => {
        const context = {
            fundamentals_balance_sheet: 'Balance details',
            fundamentals_cashflow: 'Cash details',
            fundamentals_income_stmt: 'Income details',
        };
        const result = buildFundamentalsUserContext(context);
        expect(result).toContain('Balance sheet:\nBalance details');
        expect(result).toContain('Cash flow:\nCash details');
        expect(result).toContain('Income statement:\nIncome details');
    });
    test('user context falls back to reminders', () => {
        const result = buildFundamentalsUserContext({});
        expect(result).toContain('No balance sheet data preloaded');
        expect(result).toContain('No cash flow data preloaded');
        expect(result).toContain('No income statement data preloaded');
        expect(result).toContain('Insider data:\nNo insider transactions or sentiment data preloaded');
    });
    test('collaboration header lists tools and metadata', () => {
        const header = buildFundamentalsCollaborationHeader(createContext());
        expect(header).toContain('get_finnhub_balance_sheet');
        expect(header).toContain('get_finnhub_company_insider_transactions');
        expect(header).toContain('2025-03-10');
        expect(header).toContain('MSFT');
    });
});
describe('fundamentals analyst runnable', () => {
    test('invokes LLM with assembled prompt and returns report', async () => {
        let capturedInput;
        const llm = new RunnableLambda({
            func: async (input) => {
                capturedInput = input;
                return new AIMessage('fundamentals analysis');
            },
        });
        const context = createContext({ llm });
        const runnable = fundamentalsAnalystRegistration.createRunnable(context);
        const agentsContext = {
            fundamentals_balance_sheet: null,
            fundamentals_cashflow: null,
            fundamentals_income_stmt: null,
        };
        const result = await runnable.invoke(agentsContext);
        expect(result).toBe('fundamentals analysis');
        const snapshot = JSON.stringify(capturedInput ?? {});
        expect(snapshot).toContain('No balance sheet data preloaded');
        expect(snapshot).toContain('No cash flow data preloaded');
        expect(snapshot).toContain('No income statement data preloaded');
        expect(snapshot).toContain('No insider transactions or sentiment data preloaded');
    });
});
//# sourceMappingURL=fundamentalsRunnable.test.js.map
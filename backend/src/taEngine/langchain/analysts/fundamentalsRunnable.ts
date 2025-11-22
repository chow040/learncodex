import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type { RunnableInterface } from '@langchain/core/runnables';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';

import type { AgentsContext } from '../../types.js';
import { TOOL_IDS } from '../toolRegistry.js';
import type { AnalystNodeContext, AnalystNodeRegistration } from '../types.js';
import type { ToolId } from '../toolRegistry.js';

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
] as const;

const sanitizeValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.toString().trim();
  if (!trimmed || KNOWN_PLACEHOLDERS.has(trimmed)) return null;
  return trimmed;
};

const describeToolList = (toolIds: readonly ToolId[]): string => toolIds.join(', ') || 'No tools';

export const buildFundamentalsCollaborationHeader = (context: AnalystNodeContext): string => {
  const activeToolIds = context.toolIds ?? REQUIRED_TOOL_IDS;
  const systemPrompt = context.systemPrompt ?? FUNDAMENTALS_SYSTEM_PROMPT;
  const toolList = describeToolList(activeToolIds);
  return `You are a helpful AI assistant, collaborating with other assistants. You have access to the following tools: ${toolList}. Use the tools as needed to fetch real fundamentals before writing your report. Do not summarize placeholders. If a tool fails, try another. If you or any other assistant has the FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** or deliverable, prefix your response with FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL** so the team knows to stop.\n${systemPrompt} For your reference, the current date is ${context.tradeDate}. The company we want to look at is ${context.symbol}`;
};

export const buildFundamentalsUserContext = (context: AgentsContext): string => {
  const sections: string[] = [];

  const balanceSheet = sanitizeValue(context.fundamentals_balance_sheet);
  if (balanceSheet) {
    sections.push(`Balance sheet:\n${balanceSheet}`);
  }

  const cashFlow = sanitizeValue(context.fundamentals_cashflow);
  if (cashFlow) {
    sections.push(`Cash flow:\n${cashFlow}`);
  }

  const incomeStatement = sanitizeValue(context.fundamentals_income_stmt);
  if (incomeStatement) {
    sections.push(`Income statement:\n${incomeStatement}`);
  }

  const insiderTransactions = sanitizeValue(context.fundamentals_insider_transactions);
  if (insiderTransactions) sections.push(`Insider transactions:\n${insiderTransactions}`);

  if (!sections.length) {
    return 'No fundamentals context provided.';
  }

  return sections.join('\n\n');
};

type AnalystInput = AgentsContext & { messages?: BaseMessage[] };

const buildFundamentalsRunnable = (context: AnalystNodeContext): RunnableInterface<AnalystInput, AIMessage> => {
  const llm = context.llm;
  if (!llm) {
    throw new Error('Fundamentals analyst runnable requires an LLM instance in context.');
  }

  const toolInstances = Object.values(context.tools ?? {});

  const systemPrompt = context.systemPrompt ?? FUNDAMENTALS_SYSTEM_PROMPT;
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['human', '{collaborationHeader}\n\n{userContext}'],
    new MessagesPlaceholder('messages'),
  ]);

  const prepareInputs = new RunnableLambda({
    func: async (input: AnalystInput) => ({
      collaborationHeader: buildFundamentalsCollaborationHeader(context),
      userContext: buildFundamentalsUserContext(input),
      messages: input.messages ?? [],
    }),
  });

  const llmWithTools =
    typeof (llm as any).bindTools === 'function'
      ? (llm as any).bindTools(toolInstances)
      : llm;

  return RunnableSequence.from([
    prepareInputs,
    prompt,
    llmWithTools,
  ]);
};

export const fundamentalsAnalystRegistration: AnalystNodeRegistration = {
  id: 'FundamentalsAnalyst',
  label: 'Fundamentals Analyst',
  requiredTools: [...REQUIRED_TOOL_IDS],
  createRunnable: (context) => buildFundamentalsRunnable(context),
};

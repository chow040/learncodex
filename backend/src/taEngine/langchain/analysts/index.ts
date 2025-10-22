import type { RunnableInterface } from '@langchain/core/runnables';
import type { StructuredToolInterface } from '@langchain/core/tools';

import type { AgentsContext } from '../../types.js';
import type { ToolLogger } from '../types.js';
import { resolveTools } from '../toolRegistry.js';
import type { AnalystNodeContext, AnalystNodeRegistration, AnalystRegistry, ToolContext } from '../types.js';
import { marketAnalystRegistration } from './marketRunnable.js';
import { newsAnalystRegistration } from './newsRunnable.js';
import { socialAnalystRegistration } from './socialRunnable.js';
import { fundamentalsAnalystRegistration } from './fundamentalsRunnable.js';

export const analystRegistry: AnalystRegistry = {
  [marketAnalystRegistration.id]: marketAnalystRegistration,
  [newsAnalystRegistration.id]: newsAnalystRegistration,
  [socialAnalystRegistration.id]: socialAnalystRegistration,
  [fundamentalsAnalystRegistration.id]: fundamentalsAnalystRegistration,
};

export const getAnalystRegistration = (id: string): AnalystNodeRegistration => {
  const registration = analystRegistry[id];
  if (!registration) {
    throw new Error(`Analyst registration not found for id "${id}".`);
  }
  return registration;
};

type CreateOptions = {
  symbol: string;
  tradeDate: string;
  agentsContext: AgentsContext;
  llm: RunnableInterface<any, any>;
  toolLogger?: ToolLogger;
  runLogger?: ToolLogger;
};

type CreateAnalystRunnableResult = {
  runnable: RunnableInterface<any, any>;
  tools: Record<string, StructuredToolInterface<any, any>>;
};

export const createAnalystRunnable = (
  id: string,
  options: CreateOptions,
): CreateAnalystRunnableResult => {
  const registration = getAnalystRegistration(id);

  const toolContext: ToolContext = {
    symbol: options.symbol,
    tradeDate: options.tradeDate,
    agentsContext: options.agentsContext,
  };
  if (options.toolLogger) {
    toolContext.logger = options.toolLogger;
  }

  const tools = resolveTools(Array.from(registration.requiredTools), toolContext) as Record<string, StructuredToolInterface<any, any>>;

  const context: AnalystNodeContext = {
    symbol: options.symbol,
    tradeDate: options.tradeDate,
    tools,
    agentsContext: options.agentsContext,
    llm: options.llm,
  };

  if (options.runLogger) {
    context.runLogger = options.runLogger;
  }

  const runnable = registration.createRunnable(context);

  return {
    runnable,
    tools,
  };
};

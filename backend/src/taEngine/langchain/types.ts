import type { StructuredToolInterface } from '@langchain/core/tools';
import type { RunnableInterface, RunnableConfig } from '@langchain/core/runnables';
import type { AIMessage } from '@langchain/core/messages';

import type { AgentsContext } from '../types.js';
import type { ToolId } from './toolRegistry.js';

/**
 * Metadata captured for every LangChain tool invocation so we can mirror the logging
 * performed by the existing orchestrator.
 */
export interface ToolCallRecord<Input = unknown, Output = unknown> {
  name: string;
  input: Input;
  output?: Output;
  error?: string;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
}

export interface ToolLogger {
  record(call: ToolCallRecord): Promise<void> | void;
}

export interface ToolContext {
  symbol: string;
  tradeDate: string;
  agentsContext: AgentsContext;
  logger?: ToolLogger;
}

export interface ToolRegistration<Input = unknown, Output = unknown> {
  /**
   * Unique identifier for the tool; must match the name used in analyst prompts.
   */
  name: string;
  /**
   * Human-readable description used when the tool registry emits metadata for LangChain.
   */
  description: string;
  /**
   * JSON schema describing tool input parameters.
   */
  schema: Record<string, unknown>;
  /**
   * Factory that produces a LangChain StructuredTool configured for the current run.
   */
  create: (context: ToolContext) => StructuredToolInterface<Input, Output>;
}

export type ToolRegistry = Record<string, ToolRegistration>;

export interface AnalystNodeContext {
  symbol: string;
  tradeDate: string;
  /**
   * Resolved LangChain tools keyed by name, already initialised for this run.
   */
  tools: Record<string, StructuredToolInterface<any, any>>;
  /**
   * Shared context assembled before analyst execution (market data, cached reports, etc.).
   */
  agentsContext: AgentsContext;
  /**
   * Optional per-node logger for prompts / outputs.
   */
  runLogger?: ToolLogger;
  /**
   * Optional LLM runnable preconfigured for this execution (e.g., ChatOpenAI bound to tools).
   */
  llm?: RunnableInterface<any, any>;
}

export interface AnalystNodeRegistration<
  Input = AgentsContext,
  Output = AIMessage
> {
  /**
   * Identifier for the node inside the LangGraph workflow.
   */
  id: string;
  /**
   * Friendly label used in debug logs or visualisations.
   */
  label: string;
  /**
   * Tool dependencies by name. The registry will resolve these before invoking createRunnable.
   */
  requiredTools: readonly ToolId[];
  /**
   * Factory that creates the runnable executed inside the graph.
   */
  createRunnable: (
    context: AnalystNodeContext
  ) => RunnableInterface<Input, Output, RunnableConfig>;
}

export type AnalystRegistry = Record<string, AnalystNodeRegistration>;

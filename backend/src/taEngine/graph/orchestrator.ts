import type { TradingAgentsDecision, TradingAgentsPayload } from '../types.js';
import type { TradingAnalystId } from '../../constants/tradingAgents.js';
import { runDecisionGraph, type DecisionGraphOptions } from '../langgraph/decisionWorkflow.js';

/**
 * Thin façade maintained for backwards compatibility while the codebase
 * migrates off the legacy orchestrator class. All requests now flow through
 * the LangGraph implementation.
 */
export class TradingOrchestrator {
  async run(
    payload: TradingAgentsPayload,
    options?: DecisionGraphOptions,
  ): Promise<TradingAgentsDecision> {
    return runDecisionGraph(payload, options);
  }
}

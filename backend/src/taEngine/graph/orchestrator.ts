import type { TradingAgentsDecision, TradingAgentsPayload } from '../types.js';
import { runDecisionGraph } from '../langgraph/decisionWorkflow.js';

/**
 * Thin façade maintained for backwards compatibility while the codebase
 * migrates off the legacy orchestrator class. All requests now flow through
 * the LangGraph implementation.
 */
export class TradingOrchestrator {
  async run(payload: TradingAgentsPayload): Promise<TradingAgentsDecision> {
    return runDecisionGraph(payload);
  }
}

import { runDecisionGraph } from '../langgraph/decisionWorkflow.js';
/**
 * Thin façade maintained for backwards compatibility while the codebase
 * migrates off the legacy orchestrator class. All requests now flow through
 * the LangGraph implementation.
 */
export class TradingOrchestrator {
    async run(payload, options) {
        return runDecisionGraph(payload, options);
    }
}
//# sourceMappingURL=orchestrator.js.map
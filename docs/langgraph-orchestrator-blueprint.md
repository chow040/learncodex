## LangGraph Orchestrator Blueprint

Objective: replace the bespoke TypeScript orchestrator with a LangGraph-powered workflow that mirrors the Python `TradingAgentsGraph` while reusing our LangChain analysts, debates, and judges.

### 1. State Model
Define a single `GraphState` type shared by all nodes:
```ts
type AnalystReports = {
  market?: string;
  news?: string;
  social?: string;
  fundamentals?: string;
};

type DebateHistory = {
  investment?: string;
  bull?: string | null;
  bear?: string | null;
  risk?: string;
  risky?: string | null;
  safe?: string | null;
  neutral?: string | null;
};

interface GraphState {
  symbol: string;
  tradeDate: string;
  context: AgentsContext;
  reports: AnalystReports;
  investmentPlan?: string | null;
  traderPlan?: string | null;
  finalDecision?: string | null;
  conversationLog: string[];
  debate: DebateHistory;
  metadata: Record<string, unknown>;
}
```
- `context` is the incoming payload context.
- `reports` accumulates outputs from analysts.
- `conversationLog` is an array of `{ roleLabel, system, user }` strings for auditing (`logAgentPrompts`).
- `debate` stores round-by-round transcripts to feed judges and risk manager.

### 2. Graph Layout
Use `StateGraph<GraphState>` from `@langchain/langgraph`:

```
START
  → AnalystsParallel
  → InvestmentDebateLoop (Bear ↔ Bull)
  → ResearchManagerNode
  → TraderNode
  → RiskDebateLoop (Risky → Safe → Neutral → loop)
  → RiskManagerNode
  → END
```

#### AnalystsParallel
- Implemented in `src/taEngine/langgraph/analystsWorkflow.ts` using a `StateGraph` node that:
  1. Resolves LangChain runnables via `createAnalystRunnable`.
  2. Executes them sequentially with a shared `ChatOpenAI` instance.
  3. Stores outputs under `state.reports` and accumulates prompt metadata in `state.conversationLog`.
  4. Returns conversation log entries so downstream nodes can reuse existing logging.

#### Investment Debate Loop
- Node `BearNode` and `BullNode` reuse LangChain prompts from existing classes (port to runnables if necessary).
- `should_continue_debate` guard from current TS orchestrator becomes the LangGraph conditional.
- After each call, update `state.debate.investment` with appended transcript.

#### Research Manager / Trader
- Convert existing prompt builders into runnables:
  - Input: `state.reports`, `state.debate`, memories fetched earlier.
  - Output: update `state.investmentPlan` and `state.traderPlan`.

#### Risk Debate Loop
- `Risky`, `Safe`, `Neutral` nodes use runnables similar to the current prompt classes.
- Maintain loop counter (`env.riskDebateRounds`).
- Append transcripts under `state.debate.risk`.

#### Risk Manager
- Final judge node produces final report and BUY/SELL/HOLD verdict; set `state.finalDecision`.
- Also append conversation log for auditing.

### 3. Memories & Logging
- Prepend a `LoadMemories` node before AnalystsParallel:
  ```ts
  state.metadata.managerMemories = await getPastMemories(...);
  ```
- After Risk Manager, add `PersistMemories` node to call `appendMemory`.
- Logging:
  - At the end, call `logAgentPrompts` with `state.conversationLog`.
  - Use existing tool logging from runnables (`withToolLogging` handles per-tool files).

### 4. Feature Toggle & Integration
- Introduce `USE_LANGGRAPH_PIPELINE` flag (env/config).
- `TradingOrchestrator.run` becomes:
  ```ts
  if (env.useLanggraphPipeline) {
    return langgraphWorkflow.invoke(initialState);
  }
  return legacyRun(payload);
  ```
- Keep multi-mode semantics only; single-mode remains unaffected until removal.

### 5. Migration Steps
1. Build graph skeleton with analysts only; verify outputs match `runLangchainAnalysts`.
2. Add investment debate loop + manager node; check transcripts and final plan.
3. Wire trader + risk loop; ensure final decision matches existing orchestrator on sample payloads.
4. Wrap with feature flag and parity tests before enabling by default.

### 6. Testing Strategy
- **Unit**: 
  - Node-level tests that inject mock LLMs/tool outputs to confirm state mutations.
  - Guards for loop counters and decision extraction.
- **Integration**:
  - Run the full graph on canned payloads (AAPL, MSFT, etc.) and compare outputs against current orchestrator (diff final decision, plan lengths, number of tool calls).
- **Regression**:
  - Log tool usage & prompts via `conversationLog`; ensure `writeEvalSummary` output is identical in structure.

### 7. Decommission Checklist
- Once LangGraph path is validated:
  - Remove legacy prompt classes (`MarketAnalyst`, etc.) or keep minimal for compatibility.
  - Drop `StateNewsAgent` / `StateFundamentalsAgent` after confirming tool wrappers suffice.
  - Remove `tradingAgentsEngineMode` and single-mode code paths when no longer needed.


## Debate & Decision LangGraph Blueprint

### State Extensions
- Reuse `GraphState` from `langgraph/types.ts` but treat these conveniences as read/write keys:
  - `investmentPlan`, `traderPlan`, `finalDecision`
  - `debate` object with keys `investment`, `bull`, `bear`, `risk`, `risky`, `safe`, `neutral`.
  - `conversationLog`: append `{ roleLabel, system, user }` for every node.

### Node Inventory
1. **LoadMemoriesNode** – fetch prior reflections (`manager`, `trader`, `riskManager`) via `getPastMemories`; stash in `state.metadata`.
2. **AnalystsNode** – reuse the analyst sub-graph (`runAnalystStage`) to populate `state.reports` and conversation log.
3. **BearNode / BullNode** – debate round nodes. Input uses `state.debate` + reports; output appends to `state.debate.investment`, `state.debate.bear/bull`, `conversationLog`.
   - Wrap existing `BearResearcher`/`BullResearcher` into LangChain runnables or replicate prompts inside graph nodes.
   - Loop controller uses `env.investDebateRounds`; maintain counter in `state.metadata.invest_round`.
4. **ResearchManagerNode** – consumes reports + debate history + `metadata.managerMemories`, outputs `state.investmentPlan` and log entry.
5. **TraderNode** – consumes plan + reports + `metadata.traderMemories`, outputs `state.traderPlan`.
6. **Risky/Safe/Neutral Nodes** – risk debate loop (counter `metadata.risk_round` with `env.riskDebateRounds`).
7. **RiskManagerNode** – final judge; inputs trader plan, risk debate history, memories; sets `state.finalDecision` and logs.
8. **PersistMemoriesNode** – writes reflections via `appendMemory` (manager/trader/risk) using state values.
9. **FinalizeNode** – converts `GraphState` to orchestrator result object (decision, plans, reports).

### Edge & Loop Structure
```
START → LoadMemories → Analysts → InvestmentLoopStart
InvestmentLoopStart ── Bear → Bull ↺ (controlled by round count)
↓
ResearchManager → Trader → RiskLoopStart
RiskLoopStart ── Risky → Safe → Neutral ↺
↓
RiskManager → PersistMemories → Finalize → END
```
- Use `graph.addConditionalEdges` or manual counter checks with `graph.addEdge` to control loops.
- Store counters in `state.metadata`. Increment each loop node and decide next edge based on configured rounds.

### Logging
- Every node pushes its prompt metadata to `state.conversationLog`.
- After `FinalizeNode`, call `logAgentPrompts` with accumulated log and reuse existing tool logs from LangChain runnables.

### Implementation Plan
1. Port debate/judge/trader prompt classes to LangChain runnables or inline prompts for LangGraph nodes.
2. Implement nodes + loops described above, updating state per blueprint.
3. Expose `runDecisionGraph` wrapper that orchestrator can invoke when the LangGraph feature flag is on.
4. Add tests (unit + integration) comparing LangGraph output with legacy multi-mode orchestrator on sample payloads.
5. Once parity is proven, remove legacy multi-mode logic and enable LangGraph pipeline by default.

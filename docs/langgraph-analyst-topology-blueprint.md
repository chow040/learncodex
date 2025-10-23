# LangGraph Analyst Topology Blueprint

Goal: refactor the TypeScript LangGraph pipeline so it mirrors the Python TradingAgents graph structure. Tool loops, analyst transitions, and shared state should be driven by the graph rather than manual loops.

## Objectives

- Use a single shared `AgentState` (LangGraph `MessagesState`) carrying analyst reports, debate history, trader/risk plans, etc.
- Wire each persona (market/news/social/fundamentals, bull/bear, trader, risk analysts, risk judge) into the graph with explicit nodes.
- Enforce tool loops via LangGraph conditional edges (`should_continue_*`), just like the Python `ConditionalLogic` helpers.
- Preserve existing logging, reflection, and memory integrations.

## Tasks

### 1. Shared State & Initialization
- [x] Create a TypeScript `AgentState` mirroring `tradingagents/agents/utils/agent_states.py` (extends `MessagesState`, holds reports, debate state, metadata).
- [x] Update `createInitialState` to populate the new state structure.
- [x] Adjust downstream code (`decisionWorkflow.ts`) to read/write from the unified state instead of ad-hoc objects.

### 2. Tool Node Registration
- [x] Wrap existing tool handlers in LangGraph `ToolNode`s: `tools_market`, `tools_social`, `tools_news`, `tools_fundamentals`.
- [x] Register nodes on graph setup, mapping to the existing TS wrappers (`get_YFin_data`, `get_google_news`, `get_finnhub_*`, etc.).

### 3. Analyst Loop Wiring
- [x] For each analyst, add graph nodes `Market Analyst`, `tools_market`, `Msg Clear Market`, etc.
- [x] Implement conditional logic (e.g., `should_continue_market`) inspecting `last_message.tool_calls` to route between analyst and tool nodes.
- [x] Clear messages after the analyst loop completes, then edge to the next analyst (social → news → fundamentals).

### 4. Debate & Risk Flow
- [ ] Port the Python debate/risk conditional logic (bull ↔ bear loops, risk trio rotation) using the new state and LangGraph edges.
- [ ] Ensure prompts pull updated reports via `coalesceReport` while using the unified state.

#### Debate Loop Blueprint
- Create dedicated nodes `Bull Analyst` and `Bear Analyst` that wrap the existing runnables (`createBullDebateRunnable`, `createBearDebateRunnable`). Inputs should be sourced from `state.reports`, `state.debate.investment`, and `state.metadata.debateRounds`.
- Persist each utterance into `state.debateHistory` (mirrors Python `TransitionSummary`) with helper `appendDebateTranscript({ role, content, round })`. This is what `coalesceReport`/`build*UserMessage` consumes downstream.
- Add guard node `should_continue_investment_debate` that checks `state.metadata.debateRounds.current < env.investmentDebateRounds` and whether the last message requested more debate. Route back to the opposite analyst when true; otherwise move forward to the research manager node.
- Reset `state.threadMessages` (LangGraph `MessagesState`) after the loop to avoid the trader seeing the analyst prompt chain.

#### Risk Loop Blueprint
- Define three LangGraph nodes `Risk Analyst - Risky`, `Risk Analyst - Safe`, `Risk Analyst - Neutral` that reuse the existing LangChain prompt builders. Each node writes into `state.riskDebateHistory` keyed by the persona and appends to `state.metadata.riskRounds`.
- Implement `should_continue_risk_loop` mirroring Python `should_continue_risk_debate`. Terminate when `riskRounds.current >= env.riskDebateRounds` or when `state.metadata.riskEscalation` is set to `false` by the judge.
- Ensure each loop iteration clears temporary tool results (`state.toolScratchpad = []`) so the next analyst starts clean. Route the terminal edge to the risk judge node.

#### State Alignment Notes
- Extend `AgentState` with `debateHistory: DebateRound[]`, `riskDebateHistory: RiskRound[]`, and `metadata` counters (`debateRounds`, `riskRounds`, `riskEscalation`).
- Provide small helpers in `stateUtils.ts` for incrementing counters and appending transcripts so nodes remain focused on prompt orchestration.
- Keep the debate prompts in sync with Python by cross-referencing `tradingagents/graph/nodes/debate.py` and porting any system prompt tweaks that landed there after parity.

### 5. Memory & Logging
- [ ] Keep `LoadMemories` / `PersistMemories` nodes, adapting them to the shared state.
- [ ] Ensure `logAgentPrompts` / `logToolCalls` run post-node, capturing the updated prompt text and tool usage.

#### Memory Nodes
- `LoadMemories` should populate `state.metadata.memories` with persona-specific entries (`manager`, `trader`, `risk`). The nodes that need them read from this cache rather than calling the service directly.
- When `PersistMemories` runs, gather the new reflections from `state.debateHistory`, `state.investmentPlan`, and `state.finalDecision`. Use the existing `personaMemoryService.appendMemory` but pass the unified state payload.
- Confirm the memory nodes run outside any debate loops to avoid duplicate writes (mirrors Python order: load → pipeline → persist).

#### Logging Hooks
- After each persona node, call `logAgentPrompts` with the latest prompt and LLM response. Store the return value in `state.metadata.promptIds` for correlation with LangSmith traces.
- `ToolNode`s should still rely on `logToolCalls`. Wrap their invocation inside a small helper (`withToolLogging`) so the state graph nodes only pass along `state.toolEvents`.
- Final `END` hook emits a single `logGraphRun` entry bundling analysts, debates, and decisions. Keep parity with the Python `GraphLogger`.

### 6. Testing & Verification
- [ ] Run a sample symbol (e.g., AMD), confirm logs show the tool loops and reflections.
- [ ] Diff outputs against the current flow to ensure behavior matches (same reports, debates, risk outcomes).

#### Test Harness Updates
- Add a `langgraphAnalyst.test.ts` under `src/taEngine/langgraph/__tests__` that mocks the LLM/tool layers. Assert that the debate loop hits the expected number of rounds and that risk rotation stops when the guard flips.
- Introduce a smoke script (`scripts/runLanggraphAnalyst.ts`) that accepts `--symbol` and `--date`. It should call `analystGraph.invoke(initialState)` and print summaries for manual inspection.
- Update the existing regression harness in `eval_results` to capture the new debate transcripts so parity checks include both analysts and risk personas.

#### Manual Verification
- Exercise AMD, NVDA, and GOOGL payloads with `USE_LANGGRAPH_ANALYST=1` and compare the resulting `decisionWorkflow` JSON to the legacy path. Track differences in trader plan length and risk verdict wording.
- Review `logs/langgraph/analyst/*.jsonl` to ensure prompt text, tool inputs, and reflections show up once per node. Adjust logging filters if we see duplicates caused by loop retries.

## Notes
- Follow the Python implementation (`tradingagents/graph/setup.py`, `conditional_logic.py`) for exact edge patterns.
- Be mindful of message buffer resets; analysts should start with clean conversation state each pass.
- Persona memories already work; just ensure the new state wiring continues to pass them through.
- After the new topology is in place, remove redundant manual loops, unused helper code, and obsolete logging paths.

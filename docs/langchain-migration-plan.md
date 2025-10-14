## LangChain.js / LangGraph Migration Plan

> Objective: Replace the bespoke TypeScript orchestrator with a LangChain.js + LangGraph workflow that matches the existing Python TradingAgents behaviour while preserving logging, tool coverage, and feature-flag roll-out.

### Phase 1 – Foundations
- [x] Document the Python TradingAgents graph: node order, tools, debate loops, judge logic, memory usage.
- [x] Add LangChain.js dependencies (`langchain`, `@langchain/openai`, `@langchain/langgraph`, provider SDKs) and verify with a minimal OpenAI chat chain.
- [x] Establish shared TypeScript interfaces for tools, runnable node configs, and logging callbacks.

### Python TradingAgents Graph Reference

**LLM Setup**
- Deep-thinking vs quick-thinking models selected via config (`deep_think_llm`, `quick_think_llm`) using providers `ChatOpenAI`, `ChatAnthropic`, or `ChatGoogleGenerativeAI`.
- Toolkit instantiated with provider-aware tools; `set_config` pushes runtime settings into dataflow interfaces.

**Tool Nodes**
- `market`: Yahoo Finance price/history (`get_YFin_data`, `_online`) and StockStats indicators.
- `social`: Stock news via OpenAI and Reddit sentiment summaries.
- `news`: Global/OpenAI macro feed, Google News scraper, Finnhub company news, Reddit headlines.
- `fundamentals`: OpenAI-driven fundamentals summary plus Finnhub insider sentiment/transactions and SimFin financial statements.

**Graph Topology**
1. Analysts run sequentially in configurable order (default: Market → Social → News → Fundamentals).
   - Each analyst node has a paired LangGraph `ToolNode` and “message clear” node to reset state after tool execution.
   - Conditional logic functions decide whether to loop back to tools (continue) or advance (`should_continue_<analyst>`).
2. Bull/Bear debate loop:
   - `Bull Researcher` and `Bear Researcher` alternate while `should_continue_debate` routes either back to the counterpart or forward to Research Manager.
3. `Research Manager` judges combined reports, writes to `invest_judge_memory`, forwards plan to `Trader`.
4. `Trader` produces actionable plan, flows into risk debate loop.
5. Risk debate loop:
   - `Risky Analyst` → `Safe Analyst` → `Neutral Analyst` cycling while `should_continue_risk_analysis` routes iterations or terminates at `Risk Judge`.
6. `Risk Judge` delivers final BUY/SELL/HOLD decision and ends graph.

**Memory Usage**
- Separate `FinancialSituationMemory` instances for bull, bear, trader, investment judge, and risk manager maintain historical reflections.
- Initial context/state built via `Propagator.create_initial_state`; final reflections logged with `appendMemory` equivalents in TypeScript.

**Logging & Outputs**
- Graph invocation returns `final_state` containing analyst reports, debate transcripts, final decision.
- `_log_state` persists structured JSON snapshot per trading date (market/sentiment/news/fundamentals reports + debate histories).

### Phase 2 – Tool Wrappers
- [x] Expose Finnhub, Google News, Reddit, Alpha Vantage, and insider data as LangChain `Tool` implementations with JSON schema validation and structured logging.
- [x] Port fundamental statement helpers (balance sheet, cash flow, income stmt) and insider endpoints into the new tool registry.
- [x] Ensure service modules return promise-based responses with consistent error handling for reuse inside tools.

> Registry scaffolding lives in `backend/src/taEngine/langchain/toolRegistry.ts` and defines the canonical tool IDs plus helper functions for registration and resolution.  
> Finnhub fundamentals & insider tools register via `registerFinnhubFundamentalTools` in `backend/src/taEngine/langchain/tools/finnhubFundamentals.ts`.
> News-related tools (Google, Finnhub company news, Reddit insights) register via `registerNewsTools` in `backend/src/taEngine/langchain/tools/newsTools.ts`.

### Phase 3 – Analyst Nodes
- [x] Rebuild Market/News/Social/Fundamentals analysts as LangChain runnables using prompt templates plus their tool lists (no custom state machine).
- [x] Embed context-reminder messaging via prompt variables so analysts still encourage tool usage when cached data is missing.
- [x] Add unit tests per analyst runnable with mocked tool outputs to verify prompt construction and response formatting.

> LangChain runnables implemented so far: `MarketAnalyst`, `NewsAnalyst`, `SocialAnalyst`, and `FundamentalsAnalyst` (`src/taEngine/langchain/analysts/`). Tests covering these runnables live under `src/taEngine/langchain/__tests__/`.

### Phase 4 – LangGraph Orchestration
- [x] Implement the LangGraph graph mirroring the Python flow: parallel analysts → bull/bear debate loop → research manager judge → trader agent → risk debate loop → risk manager judge.
  - Analysts run via `langgraph/analystsWorkflow.ts`; debate, trader, and risk nodes execute within `langgraph/decisionWorkflow.ts`.
- [x] Support configurable round counts, timeouts, and state accumulation for debate loops.
- [x] Integrate memory fetch/persist steps around the graph execution (`getPastMemories`, `appendMemory` equivalents).

### Phase 5 – Observability & Rollout
- [x] Hook LangChain callbacks into existing logging (`logAgentPrompts`, tool call logs, conversation transcripts) and capture token usage.
- [x] Introduce a feature flag/env toggle to switch between legacy orchestrator and the LangGraph-based path.
- [ ] Run regression comparisons on representative symbols/dates to confirm LangGraph parity before removing legacy code paths.
- [ ] Update documentation/runbooks and prepare release notes outlining activation steps and rollback procedures.

### Success Criteria
- LangChain.js graph produces BUY/SELL/HOLD decisions and analyst reports consistent with the current system on test cases.
- All existing logging, audit, and memory features remain functional.
- Rollout can be controlled via configuration with a clear fallback to the legacy orchestrator.

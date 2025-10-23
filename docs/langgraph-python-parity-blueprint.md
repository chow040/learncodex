# LangGraph Python Parity Blueprint

Goal: align the TypeScript backend (`backend/src/taEngine`) with the richer Python TradingAgents stack (`TradingAgents-main/tradingagents`) so both workflows offer the same capabilities (tool orchestration, memories, state tracking, reflections, logging).

## 1. Analyst & Debate Flow Enhancements

- [x] **Persona Memories**  
  - Python uses `FinancialSituationMemory` to inject past lessons; TS currently skips this.  
  - Actions: Implement Drizzle-backed Postgres storage (e.g., pgvector or JSON embeddings) for reflections, add embedding support in TS, and extend `buildBullUserMessage` / `buildBearUserMessage` to pull matching reflections.  
  - Ensure retrieved reflections are written to the prompt log (e.g., via `logAgentPrompts`) so persona memory context is auditable.

- [ ] **Researcher Prompt Parity**  
  - Confirm all Python prompt sections (growth/risk bullet points, reflections, etc.) exist in TS.  
  - Diff prompt templates between `bull_researcher.py`, `bear_researcher.py`, etc., and TS equivalents (`langchain/debates/*.ts`) to ensure content parity.

- [ ] **Cross-Analyst Data Flow**  
  - Python uses full `AgentState` to persist reports. Verify TS `buildDebateContext` mirrors the same fields (market/sentiment/news/fundamentals) and assess whether other persona outputs (e.g., social-specific insights) should be threaded through earlier.

## 2. Tooling & State Utilities


- [ ] **Message Reset & Conditional Logic**  
  - Python’s `create_msg_delete` + `ConditionalLogic` enforce tool looping. TS now enforces tool loops manually; document any remaining differences and consider adding explicit state nodes if needed.

## 3. Memory & Reflection System

- [ ] **FinancialSituationMemory Port**  
  - Implement a Supabase `pgvector`-backed memory store (replacing Python’s Chroma).  
  - Define schema for situations + recommendations, add embedding service (OpenAI or local) and Supabase client in TS.  
  - Hook memory writes into the research manager node so future runs have reflections.

- [x] **Reflection Hooks**  
  - Python’s `_log_state` / `reflect_and_remember` update memories post-run. Add similar reflection/feedback loops in TS so the new memory store accumulates decisions.

## 4. Logging & Eval Outputs

- [ ] **Parity in Log Artifacts**  
  - Ensure TS writes the same logs Python does: prompt dumps, tool calls, full state logs (eval results), reflection summaries.  
  - Align file naming and fields (`full_states_log_<date>.json`, `tradingagents_runner_archive.log`, etc.).

## 5. Risk & Trader Nodes

- [ ] **Risk Debate Flow**  
  - Python coordinates Risky/Safe/Neutral analysts with conditional routing. TS currently mirrors this but confirm prompts include reflections/memories and match Python content.

- [x] **Trader Prompt**  
  - Confirm the trader prompt/calc mirrors `TradingAgents-main/tradingagents/agents/trader/trader.py` (including past memory injection and action checklist).

## 6. Testing & Validation

- [ ] **Golden Run Comparisons**  
  - Capture sample runs (e.g., AMD) in both stacks, diff outputs to highlight remaining deltas.  
  - Add automated tests to ensure required tool calls happen, memories are read/written, and logs contain expected data.

- [ ] **Performance & Rate Limit Review**  
  - Enforcing all Python features increases tool/API traffic. Plan caching, batching, or rate limit handling on the TS side.

## 7. Documentation & Migration Notes

- [ ] Update project docs describing the full parity (tool architecture, memory store, logs).  
- [ ] Provide migration guidance for existing runs (e.g., how to migrate legacy memories/logs if needed).

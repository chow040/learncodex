# LangGraph Tool-Node Migration Blueprint

This document outlines the steps required to bring the TypeScript LangGraph orchestration in `backend/src/taEngine` to functional parity with the Python graph in `TradingAgents-main/tradingagents/graph`. The goal is to guarantee deterministic tool execution (market/social/news/fundamentals) before each analyst produces a report.

## Objectives

- Recreate the Python graph’s per-persona structure (`Analyst → ToolNode → Analyst → MsgClear → Next`) so API fetches execute outside the LLM’s discretion.
- Ensure analyst outputs always benefit from fresh market/news/social/fundamentals data, eliminating “no toolcall” runs.
- Preserve existing logging hooks (prompts, toolcalls, eval summaries) while extending them to the new graph.

## Architectural Parity

| Python Component | TypeScript Counterpart | Action |
| --- | --- | --- |
| `GraphSetup` (`setup.py`) | `analystsWorkflow.ts` replacement | Build a `StateGraph` with explicit analyst/tool/clear nodes. |
| `ConditionalLogic` (`conditional_logic.py`) | New TS conditional helpers | Inspect `last_message.tool_calls` and route execution accordingly. |
| `ToolNode` definitions (`trading_graph.py::_create_tool_nodes`) | TS tool-node wrappers | Invoke existing wrappers in `backend/src/taEngine/langchain/tools`. |
| `create_msg_delete` | New TS message-reset node | Remove conversation history between personas to keep state small. |

## Implementation Checklist

- [ ] **Scaffold tool nodes**: create a mapping that produces LangGraph nodes which call the required tool wrappers (`get_YFin_data`, `get_google_news`, `get_simfin_*`, etc.).
- [ ] **Conditional routing**: implement TypeScript analogues of `should_continue_{persona}` to decide between `tools_*` and `MsgClear_*`.
- [ ] **Refactor analyst workflow**: replace the current `analystsWorkflow.ts` single-pass routine with a graph that mirrors the Python flow (ordered analysts, optional subsets).
- [ ] **Message clearing**: add nodes that wipe the agent conversation after each persona completes, similar to `create_msg_delete`.
- [ ] **Integrate with decision workflow**: adjust `decisionWorkflow.ts` to call the new graph, keeping progress events and logging intact.
- [ ] **Logging verification**: confirm `ta_toolcalls_*.json` captures the enforced tool calls and that prompt/eval logs still write as expected.
- [ ] **Regression tests**: run existing backend tests (or add targeted checks) and execute at least one end-to-end assessment (e.g., AMD) to ensure the tool nodes fire.
- [ ] **Documentation update**: record the new graph flow in project docs and note the deprecation of the old “LLM decides” approach.

## Notes & Follow-Ups

- Legacy helpers such as `logFundamentalsToolCalls` may become redundant once general tool logging covers all personas; consider pruning or wrapping them for backward compatibility.
- Keep an eye on rate limits: forced tool execution increases outbound API calls. Introduce caching/throttling if needed.
- After migration, revisit persona prompts to remove language that suggests tool usage is optional.


## LangChain Analyst Runnable Blueprint

Goal: define a repeatable pattern for converting each analyst (Market/News/Social/Fundamentals) into LangChain runnables that consume the new tool registry, preserve existing prompt semantics, and expose a consistent interface to the forthcoming LangGraph workflow.

### Core Concepts
- **Analyst Runnable** – a `RunnableInterface<AnalystInput, AnalystOutput>` responsible for:
  - building system+collaboration prompts (string templates),
  - ingesting the pre-orchestrator context (`AgentsContext`),
  - wiring required tools (resolved via `resolveTools`),
  - returning the analyst’s textual report (`string`) plus optional metadata (e.g., tool usage logs).
- **Analyst Registration** – metadata describing each runnable:
  - `id`, `label` – graph node identifiers;
  - `requiredTools` – canonical tool IDs the runnable depends on;
  - `createRunnable(context: AnalystNodeContext)` – factory for the runnable with injected tools, symbol, trade date, optional `llm`, and loggers.
- **Analyst Input Payload** – strongly typed shape consumed by `invoke`. Default is `AgentsContext` but we can specialise if a runnable needs narrower data.

### Template Structure
1. **System Prompt** – largely mirrors existing TypeScript prompt text (e.g., market indicator catalogue). Should be stored as a constant string module; minor refactors welcome (typo fixes, parameter placeholders).
2. **Collaboration Header** – a short template injecting:
   - available tool list (derived from `requiredTools`),
   - `tradeDate`, `symbol`,
   - high-level instructions about FINAL TRANSACTION PROPOSAL conventions.
3. **User Context Builder** – function that reads `AgentsContext` and assembles `user` message sections (e.g., price history). Reuse current logic (with placeholder detection) but expose as pure helpers for ease of testing.

### Tool Wiring
- Resolve tools once per invocation using `resolveTools(requiredToolIds, analystNodeContext, optionalLogger)`.
- Pass resulting tool map into the runnable factory; individual runnables can call `context.tools[id]` when constructing LangChain sequences.
- Ensure the runnable calls tools via LangChain `ToolNode` pattern (or `RunnableSequence` + `RunnablePassthrough`) so outputs participate in logging/tracing automatically.

### Runnable Composition
Example composition (pseudo):
```ts
const prompt = ChatPromptTemplate.fromMessages([
  ['system', SYSTEM_PROMPT],
  ['human', '{collaborationHeader}\n\n{userContext}'],
]);

const llm = new ChatOpenAI({ model: env.openAiModel, tools }); // or supply via context

return RunnableSequence.from([
  RunnablePassthrough.assign({
    collaborationHeader: (input) => buildCollabHeader(context),
    userContext: (input) => buildUserContext(input.agentsContext),
  }),
  prompt,
  llm.bindTools(Object.values(context.tools)),
]);
```

### Outputs
- Primary return: analyst narrative `string`.
- Consider wrapping in `{ report: string, toolCalls: ToolCallRecord[] }` once orchestration expects richer payloads. For now, keep `string` to minimise disruption.

### Logging Hooks
- Reuse `withToolLogging` by wrapping tool handlers inside the registration (already available via registry).  
- For prompt logging, have each runnable emit `{ system, user }` via existing `logAgentPrompts` when the orchestration stage kicks off.

### Testing Strategy
- Unit tests per runnable:
  - mock tools (simple runnables returning canned strings),
  - feed sample `AgentsContext` and snapshot resulting prompt fragments (system/user) to ensure placeholders behave.
  - verify tool ordering (e.g., `get_YFin_data` called before indicator tools) by asserting on mock call history.
- Integration tests at orchestration level once LangGraph path is wired (Phase 4).

### Next Steps
1. Implement MarketAnalyst runnable following this blueprint; keep it feature-flagged until all analysts are converted. (See `src/taEngine/langchain/analysts/marketRunnable.ts`.)
2. Register runnables via `analystRegistry` (`src/taEngine/langchain/analysts/index.ts`) and use `createAnalystRunnable` to inject tools/LLM at runtime.
3. Repeat for News/Social/Fundamentals, ensuring prompts are modular and shareable helper utilities (e.g., `buildMissingDataMessage`).
4. Update `docs/langchain-migration-plan.md` once each analyst runnable lands, and document how orchestrator selects between legacy prompts and LangChain runnables.

### Fundamentals Runnable Notes
- Reuse the current fundamentals system prompt (detailed analysis, markdown table, no “mixed” wording).
- Collaboration header lists the Finnhub tools: `get_finnhub_balance_sheet`, `get_finnhub_cashflow`, `get_finnhub_income_stmt`, `get_finnhub_company_insider_transactions`, `get_finnhub_company_insider_sentiment`.
- User context builder should:
  - Include any preloaded statements only when they are substantive (exclude placeholders such as “Detailed statement data not ingested…”).
  - Otherwise insert reminders so the model knows tools are available (e.g., “No balance sheet data preloaded. Call get_finnhub_balance_sheet…”). The LLM decides when to call tools.
  - Insider data: continue to push reminders rather than cached payloads to encourage fresh retrieval without enforcing it.
- Bind the Finnhub tools exported from `langchain/tools/finnhubFundamentals.ts`; they already wrap Finnhub calls, handle ticker validation, and log executions.
- Runnable skeleton mirrors other analysts: prepare `{collaborationHeader, userContext}`, apply prompt, run LLM bound to tool instances, convert `AIMessage` to `string`.
- Add unit tests covering placeholder reminders and prompt content before integrating into LangGraph.
### Fundamentals Runnable Notes

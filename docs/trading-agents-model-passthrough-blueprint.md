# Trading Agents Model Passthrough Blueprint

## Overview
Let the Trading Agents workflow honor the model selected on the command center instead of always falling back to the `.env` default. Extend both frontend and backend so the chosen `modelId` (and eventually analyst subset) flows from the UI to LangGraph orchestration and into persisted artifacts/logs.

## Goals
- Add `modelId` to the Trading Agents run payload and wire it through the existing POST + SSE lifecycle.
- Persist the chosen model with each run for traceability and future analytics.
- Maintain backwards compatibility by defaulting to the `.env` model when no override is provided.
- Honor the analyst personas selected in the configurator by limiting LangGraph participants to the requested subset.
- Set up the plumbing needed for richer persona metadata (weights, temperatures) in later releases.

## Non-Goals
- Introducing new personas or restructuring the LangGraph debate stages beyond enabling toggles.
- Shipping an admin UI for managing model allowlists or persona metadata (handled via config for now).
- Supporting per-agent model overrides; all enabled analysts share a single `modelId` during this iteration.

## Current State
- Frontend form exposes a model picker but `runTradingAgents` sends only `{ symbol, runId }`.
- Backend `POST /api/trading/decision/internal` reads `env.openAiModel` and ignores client overrides.
- LangGraph publishers and repositories accept optional `model` but only receive `.env` derived values.
- No validation/error handling when an unsupported model is requested.

## Dependencies & Assumptions
- `backend/src/services/tradingAgentsEngineService.ts` remains the orchestration entry point and already accepts a contextual options object.
- `taDecisionRepository.insertTaDecision` can persist arbitrary JSON payloads; schema migrations (`sql/003_create_ta_runs.sql`) already include nullable `model` columns.
- Model choices originate from the forthcoming `/api/trading/models` endpoint described in `docs/trading-agents-screen-blueprint.md` and should be consumed as an allowlist.
- Default server allowlist includes `gpt-4o-mini`, `gpt-4o`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5`, and `gpt-5-pro`; ops can override via `TRADING_ALLOWED_MODELS`.
- Analyst personas map 1:1 to existing LangGraph nodes (`fundamental`, `market`, `news`, `social`). Additional personas will be considered out of scope until a future release.
- Streaming progress events are emitted through `tradingProgressService`; extending the payload must preserve current SSE contracts consumed by `useTradingProgress`.

## Detailed Flow
1. **Frontend submission**
   - `TradingAgents.tsx` collects `symbol`, `modelId`, and analyst toggles.
   - Hook prepares payload `{ symbol, runId, modelId, analysts }` (filtered to checked personas) and POSTs to `/api/trading/decision/internal`.
2. **Route validation**
   - Express route normalizes ticker, ensures `modelId` is either omitted or in the allowlist, and ensures every analyst id matches the supported enum.
   - Invalid inputs return HTTP 400 with actionable messages consumed by the UI.
3. **Orchestration handoff**
   - `requestTradingAgentsDecisionInternal(symbol, { runId, modelId, analysts })` forwards metadata to LangGraph factories.
   - LangGraph uses the supplied `modelId` when instantiating OpenAI or Azure OpenAI clients. Disabled personas bypass node execution and skip downstream prompts.
4. **Streaming + completion**
   - Progress publisher includes `{ modelId, analysts }` in every SSE chunk so the UI can render badges for active personas.
   - Final response merges decision payload with resolved `modelId` (after default fallback) and the actual `analysts` array in execution order.
5. **Persistence**
   - `insertTaDecision` persists the resolved `model` and `analysts` list in `ta_runs` and `ta_decisions`. Raw payload JSON continues to capture execution inputs for auditability.

## Acceptance Criteria
- When a user selects a specific model, the SSE stream and final response echo that `modelId`, and the persisted row for the run stores the same value.
- Omitting `modelId` results in the `.env` default with no UI regression or backend errors.
- Selecting a subset of analysts yields progress updates and final summaries that exclude disabled personas.
- Invalid `modelId` or analyst values return HTTP 400 with descriptive errors and do not trigger LangGraph execution.
- Run history (via `ta_runs`) and decision logs (via `ta_decisions`) store both `model` and serialized `analysts`.

## Proposed Architecture
1. **Payload Contract**
   - Extend request body to `{ symbol: string; runId?: string; modelId?: string; analysts?: string[] }`.
   - `modelId` optional; server falls back to `env.openAiModel` if missing.
   - `analysts` optional array constrained to `[fundamental, market, news, social]`; backend defaults to all on omission.
2. **Backend Routing**
   - Update route handler (`backend/src/routes/tradingRoutes.ts`) to validate `modelId` against an allowlist (reuse `/api/trading/models` once implemented) and `analysts` against persona enum.
   - Pass resolved `modelId` and filtered `analysts` into `runTradingAgentsInternal` / orchestrator entry point.
3. **LangGraph Execution**
   - Modify orchestrator factories/services to accept explicit `model` and `enabledAnalysts` parameters.
   - Swap direct `env.openAiModel` references for override-aware logic and gate persona nodes based on `enabledAnalysts`.
   - Ensure progress events reflect the active personas (skip disabled stages).
4. **Persistence & Telemetry**
   - Store `model` and `analysts` in `ta_runs` & decision payload logs (`taDecisionRepository` already has fields; ensure schema covers persona list).
   - Include `modelId` and `analysts` in SSE progress events and final REST response.
5. **Frontend Hook**
   - Submit `modelId` and `analysts` with the POST request and align types with the new API contract.
   - Display resolved model and active personas in the decision summary (already shown locally; confirm backend echoes).

## API & Validation Details
- **Endpoint**: `POST /api/trading/decision/internal`
  - Payload schema (Zod suggestion):
    ```ts
    const tradingAgentsRequestSchema = z.object({
      symbol: z.string().trim().toUpperCase(),
      runId: z.string().trim().optional(),
      modelId: z.string().trim().optional(),
      analysts: z.array(z.enum(['fundamental', 'market', 'news', 'social'])).min(1).optional(),
    });
    ```
  - Validation rules:
    - `symbol` required; must pass ticker regex `^[A-Z]{1,5}$` (reuse existing validation util).
    - `modelId` must exist in in-memory allowlist (populated from config or `/api/trading/models` cache).
    - `analysts` defaults to full set when omitted or empty.
    - On validation failure return `{ error: string, field?: string }`.
- **SSE events** (`tradingProgressService.publishProgressEvent`):
  - Augment payloads with `modelId` and `analysts`.
  - Ensure backward compatibility by keeping current keys (stage, label, percent) intact.
- **Response contract**:
  ```json
  {
    "runId": "ta_abc123",
    "modelId": "gpt-4o-mini",
    "analysts": ["fundamental", "market"],
    "decision": { ... existing decision fields ... }
  }
  ```

## Data Model & Persistence
- `ta_runs`:
  - Existing columns `model` (text) and `logs_path` can store the resolved `modelId` and SSE transcript pointer.
  - Add new column `analysts` (text[] or JSON) if not already present; otherwise store inside JSON payload with serialized array (confirm schema before migrating).
- `ta_decisions`:
  - Persist the resolved `model` in the dedicated column and extend the JSON payload structure to include `analysts`.
  - When backfilling historic runs is feasible, run a lightweight script to set `model` to the `.env` default where null.
- Logging:
  - Emit structured logs from `tradingAgentsEngineService` containing `{ runId, modelId, analysts, symbol }` for debugging.

## LangGraph & Analyst Gating Notes
- Update agent factory modules to accept `enabledAnalysts: Set<string>` and guard prompt execution.
- Skip generating context for disabled analysts to reduce token usage.
- When all analysts are disabled (should be prevented by validation), return early with HTTP 400.
- Ensure orchestrator fallbacks still operate: if a persona errors mid-run, log and continue with available results (current behavior).

## Implementation Steps
1. **Contract & Types**
   - Update shared request/response interfaces (`TradingAgentsRequest`, `TradingAgentsResponse`) on frontend and backend packages.
   - Document schema changes in `docs/api/trading-agents.md` (if present) or create a new section.
2. **Frontend Submission**
   - Modify `runTradingAgents` call (likely `equity-insight-react/src/pages/TradingAgents.tsx`) to send the enriched payload.
   - Ensure UI state reflects backend defaults when fields are omitted.
3. **Backend Validation**
   - Introduce schema validation helper in `backend/src/validators/tradingAgents.ts`.
   - Enforce allowlist (temporary in-memory map until models endpoint lands).
4. **Service Layer & Orchestrator**
   - Pass `modelId` and `analysts` into `requestTradingAgentsDecisionInternal`.
   - Update LangGraph factories/services to respect overrides and gating.
5. **Persistence & Telemetry**
   - Extend `taDecisionRepository` to persist analysts array (serialize if needed) alongside `model`.
   - Include metadata in SSE progress events.
6. **Testing & Verification**
   - Add unit coverage for validation helper (happy path + error cases).
   - Create integration test (mocked orchestrator) to assert persistence layer receives overrides.
   - Manually run `curl` flows to confirm SSE + persistence behavior.
7. **Documentation & Cleanup**
   - Update `.env.example` or config docs if new env vars introduced (e.g., `TRADING_ALLOWED_MODELS`).
   - Capture new behavior in release notes and trading agents screen blueprint references.

## Rollout & Verification Plan
- Deploy behind a feature flag that disables payload override until backend is fully rolled out.
- Perform smoke test in staging:
  - Run with explicit `modelId` and subset of analysts; confirm SSE output and DB rows.
  - Run with omitted `modelId`; ensure fallback works.
- Monitor logs for 48 hours post-release for unknown model errors or missing analysts arrays.
- Add dashboard alert if `modelId` persists as null for new runs after rollout.

## Telemetry & Observability
- Add structured log entries tagged with `feature=trading-agents-model-passthrough`.
- Emit counter metrics (if infrastructure available) for `ta_model_override_requests_total` and `ta_model_override_failures_total`.
- Consider capturing persona mix in analytics to inform future weighting features.

## Development Checklist
- [x] Frontend: extend Trading Agents POST payload with `modelId` and `analysts`.
- [x] Frontend: update request/response typings and ensure decision summary reflects backend values.
- [x] Backend: validate and accept `modelId`/`analysts` in `/api/trading/decision/internal`.
- [x] Backend: propagate selected model through service/orchestrator layers to OpenAI calls.
- [x] Backend: enable persona gating according to the supplied `analysts`.
- [x] Backend: persist model override and analyst selections in `ta_runs` / decision logs.
- [x] Backend: emit `modelId` + `analysts` in SSE progress and final response payload.
- [ ] Tests: add coverage for new contract (validation + persistence).
- [x] Docs: record payload change and any configuration updates.

## Risks & Mitigations
- **Invalid Model IDs**: Implement allowlist and give clear HTTP 400 messages.
- **Regression in Default Behavior**: Write tests ensuring omission still uses `.env`.
- **Analyst Filtering Gap**: Keep `analysts` optional but log TODO so future iteration can enable.
- **Schema Drift**: Confirm Postgres migrations align with new persisted fields before deploy; add fallback logging if column missing.
- **SSE Payload Size**: Monitor SSE chunk size after appending metadata; prune verbose fields if necessary.
- **Version Mismatch**: Ensure frontend and backend deploy together or gate via feature flag to avoid payload mismatch.

## Open Questions
- Should model allowlist live in config (`env`, DB, parameter maintenance service)?
- Do we expose temperatures or other model metadata to the frontend at this stage?
- Any RBAC considerations for accessing premium models?
- What persistence shape best supports future analytics on persona combinations (JSON vs normalized table)?
- Should we document an SLA for how quickly new models can be added to the allowlist?

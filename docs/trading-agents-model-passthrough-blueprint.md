# Trading Agents Model Passthrough Blueprint

## Overview
Let the Trading Agents workflow honor the model selected on the command center instead of always falling back to the `.env` default. Extend both frontend and backend so the chosen `modelId` (and eventually analyst subset) flows from the UI to LangGraph orchestration and into persisted artifacts/logs.

## Goals
- Add `modelId` to the Trading Agents run payload and wire it through the existing POST + SSE lifecycle.
- Persist the chosen model with each run for traceability and future analytics.
- Maintain backwards compatibility by defaulting to the `.env` model when no override is provided.
- Honor the analyst personas selected in the configurator by limiting LangGraph participants to the requested subset.
- Set up the plumbing needed for richer persona metadata (weights, temperatures) in later releases.

## Current State
- Frontend form exposes a model picker but `runTradingAgents` sends only `{ symbol, runId }`.
- Backend `POST /api/trading/decision/internal` reads `env.openAiModel` and ignores client overrides.
- LangGraph publishers and repositories accept optional `model` but only receive `.env` derived values.
- No validation/error handling when an unsupported model is requested.

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

## Implementation Steps
1. Update shared types (`TradingAgentsRequest`) on frontend & backend.
2. Modify `runTradingAgents` fetch call to include `modelId` and the selected `analysts` array.
3. Adjust backend validators/service layer to accept the new fields.
4. Thread `modelId` through LangGraph orchestrator & OpenAI client configuration.
5. Gate LangGraph persona nodes based on the supplied `analysts` list.
6. Update repositories/log writers to persist the passed `model` and `analysts`.
7. Ensure SSE events and final payload return the resolved model/persona data.
8. Add regression tests:
   - Backend request validation/unit coverage for missing/unknown model or analysts.
   - (Optional) integration test verifying persistence with a mocked repo.
9. Document changes in `docs/` and update `.env.example` if new config (e.g., model allowlist) is required.

## Development Checklist
- [ ] Frontend: extend Trading Agents POST payload with `modelId` and `analysts`.
- [ ] Frontend: update request/response typings and ensure decision summary reflects backend values.
- [ ] Backend: validate and accept `modelId`/`analysts` in `/api/trading/decision/internal`.
- [ ] Backend: propagate selected model through service/orchestrator layers to OpenAI calls.
- [ ] Backend: enable persona gating according to the supplied `analysts`.
- [ ] Backend: persist model override and analyst selections in `ta_runs` / decision logs.
- [ ] Backend: emit `modelId` + `analysts` in SSE progress and final response payload.
- [ ] Tests: add coverage for new contract (validation + persistence).
- [ ] Docs: record payload change and any configuration updates.

## Risks & Mitigations
- **Invalid Model IDs**: Implement allowlist and give clear HTTP 400 messages.
- **Regression in Default Behavior**: Write tests ensuring omission still uses `.env`.
- **Analyst Filtering Gap**: Keep `analysts` optional but log TODO so future iteration can enable.

## Open Questions
- Should model allowlist live in config (`env`, DB, parameter maintenance service)?
- Do we expose temperatures or other model metadata to the frontend at this stage?
- Any RBAC considerations for accessing premium models?

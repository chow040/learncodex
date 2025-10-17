# Trading Agents Assessment History Blueprint

## Overview
Allow Trading Agents operators to recall prior assessments for a ticker directly from the command center. When a user enters a symbol and runs a search, we should query recent decisions, render them in a sortable table, and let the user deep-link into a full detail view (new tab) for audit or comparison.

## Goals
- Surface the most recent Trading Agents assessments for a ticker when the user focuses or submits the symbol form.
- Display a concise table listing assessment date, model, analyst mix, decision token, and run identifier.
- Provide a quick action to open the full stored payload in a dedicated detail page (new tab) to avoid disrupting the current run-in-progress workflow.
- Ensure backend filtering respects authenticated user access and only returns data the caller is allowed to view.
- Preserve performance by paging or limiting results and reusing cached summaries when possible.

## Non-Goals
- Updating or deleting historical assessments.
- Building advanced analytics (charts, aggregation, scoring) over the assessment history.
- Supporting cross-symbol queries or global search (limited to the ticker entered in the configurator).
- Implementing role-based access changes beyond existing guardrails.

## Current State
- `TradingAgents.tsx` submits runs but does not fetch historical data; a placeholder panel hints at future history integration.
- Backend persistence stores each run in `ta_runs` and `ta_decisions` with metadata such as `model`, `run_id`, and JSON payload.
- No REST endpoint exposes historical Trading Agents data; only insert operations exist in `taDecisionRepository`.
- SSE progress stream provides run metadata but is not persisted for later recall.

## Proposed UX
- **Trigger**: When a user types a ticker (minimum two characters) and focuses the form, fetch recent assessments. Refresh after a successful new run.
- **List Component**:
  - Columns: `Trade Date`, `Decision`, `Model`, `Analysts`, `Run ID`.
  - Limit to the latest 5–10 entries; provide “View more” button to open the detail route with pagination if needed.
  - Empty state messaging when no runs exist; include CTA to “Run Trading Agents”.
- **Detail View**:
  - Opens `/trading-agents/history/:runId` in a new tab (uses existing layout chrome).
  - Displays stored decision payload, analyst reports, raw JSON download link, and metadata (model, analysts, orchestrator version).
- **Interactions**:
  - Row click opens the detail tab via `window.open`.
  - Provide copy icon for run ID for quick reference.
  - Indicate if the record used a non-default model or subset of analysts.

## API Contract
- `GET /api/trading/assessments`
  - Query params: `symbol` (required), `limit` (default 5, max 20), optional `cursor` or `before` timestamp.
  - Response: `{ items: Array<{ runId, symbol, tradeDate, decision, modelId, analysts, createdAt }>, nextCursor?: string }`.
- `GET /api/trading/assessments/:runId`
  - Response: `{ runId, symbol, tradeDate, decision, modelId, analysts, payload, rawText, createdAt }`.
- Errors:
  - `400` when symbol missing or malformed.
  - `404` when run ID unknown or access denied.
  - `401/403` for unauthenticated/unauthorized requests.

### Implementation Notes (2025-10-16)
- Endpoints ship behind `TRADING_ASSESSMENT_HISTORY_ENABLED`; the handler returns `404` while disabled and `503` when the flag is on but `DATABASE_URL` is missing.
- `limit` is clamped between 1 and 20, with a default of 5. Paging relies on ISO timestamps via `nextCursor`.
- Summary responses normalize missing analyst metadata to the default persona set and surface stored orchestrator version.
- Detail responses include the stored Trading Agents payload, raw text, prompt hash, and run logs path when available.

## Backend Architecture
1. **Repository Enhancements**
   - Add query to `taDecisionRepository` to fetch recent decisions by symbol with model/analyst metadata.
   - Provide lookup by `run_id` returning full payload and related `ta_runs` fields (log path, orchestrator version).
2. **Service Layer**
   - Introduce `getTradingAssessments(symbol, options)` and `getTradingAssessmentByRunId(runId)` helpers.
   - Normalize analysts list (empty/null → default full set) before returning.
3. **Routes**
   - Add `GET /api/trading/assessments` and `GET /api/trading/assessments/:runId` to `tradingRouter`. Reuse existing authentication middleware.
   - Validate `symbol` via shared ticker regex and enforce `limit` bounds.
4. **Performance**
   - Index `ta_decisions` on `symbol, created_at DESC` (already present) and optionally on `run_id`.
   - Consider caching hot queries per symbol for 30–60 seconds to avoid DB thrash during repeated lookups.
5. **Security**
   - Ensure responses omit sensitive internal fields (prompt hashes, logs path) unless specifically required.
   - Log access for auditing (e.g., `console.info` or structured logger with user ID).

## Frontend Architecture
1. **Data Hooks**
   - Create `useTradingAssessments(symbol, options)` using TanStack Query for caching and auto-refresh.
   - Invalidate query when the user completes a new run or changes ticker.
2. **UI Components**
   - `TradingAssessmentsTable`: responsible for rendering states (loading, empty, error, populated).
   - `TradingAssessmentRow`: handles row actions (open detail, copy run ID).
   - Use `Badge` components to highlight custom models or analyst subsets.
3. **Detail Page**
   - Reuse `TradingAgentsLayout` with a streamlined hero containing run metadata.
   - Provide tabbed sections for summary, analyst outputs, raw JSON, and logs download (if available).
4. **Routing**
   - Add route definition in `App.tsx` for `/trading-agents/history/:runId`, guarded by auth.
   - `window.open` row click to keep current run intact; allow middle-click via `<a href target="_blank" rel="noopener">`.
5. **Accessibility**
   - Ensure table rows are keyboard-focusable and support `Enter` key to open detail.
   - Provide descriptive aria labels for action buttons.

## Implementation Steps
1. **Backend**
   - [x] Add repository methods for list/detail queries.
   - [x] Add tests for repository/service history queries.
   - [x] Wire new routes with validation and error handling.
   - [x] Gate endpoints behind the `TRADING_ASSESSMENT_HISTORY_ENABLED` flag.
   - [x] Update API docs (`docs/` or OpenAPI spec) and expose allowlist configuration if necessary.
2. **Frontend**
   - [x] Add data hooks and query providers for assessments.
   - [x] Build table component with loading/empty/error states.
   - [x] Implement detail page route and layout.
   - [x] Connect table interactions to new API endpoints; trigger fetch on ticker change and run completion.
3. **Integration**
   - [ ] Verify table updates after running new assessment (SSE completion).
   - [ ] Ensure detail view handles missing runs gracefully.
   - [x] Include analytics/logging event for “history row opened”.
4. **QA**
   - [ ] Write backend tests covering empty symbol, limit bounds, valid response, runId 404.
   - [ ] Add frontend testing/stories as feasible (Storybook or unit tests).
   - [ ] Manual regression: run with override model, verify history renders with correct metadata.

## Telemetry & Observability
- Track metrics for history fetch success/failure counts.
- Log run detail access with user identifier for audit.
- Monitor query latency and adjust DB indexes if p95 exceeds acceptable thresholds.

## Rollout Plan
- Ship backend endpoints behind feature flag (`TRADING_ASSESSMENT_HISTORY_ENABLED`).
- Gradually enable frontend fetch when backend deployed to staging.
- Monitor error logs, DB load, and user feedback before enabling in production.

## Open Questions
- Do we need row-level RBAC (e.g., trader vs observer) before exposing historical data?
- Should we support CSV/JSON export directly from the table?
- How many historical runs should we display by default (5 vs 10) to balance UX and performance?
- Should run list reflect SSE progress (e.g., show in-progress run) or remain strictly historical?

# Trading Agents Dedicated Screen Blueprint

## Overview
Create a standalone Trading Agents workspace that lets users configure and run multi-analyst assessments without navigating the broader Equity Insight dashboard. The screen adds richer controls (ticker input, LLM model picker, analyst selection) and surfaces recent decisions with drill-down navigation.

## Goals
- Separate the trading workflow from the existing `EquityInsight` composite view (`equity-insight-react/src/pages/EquityInsight.tsx:1381`) to reduce coupling and improve discoverability.
- Allow users to:
  1. Enter a US stock ticker.
  2. Choose an LLM model (sourced from current OpenAI-compatible models).
  3. Toggle which analyst personas participate (fundamental, market, news, social).
  4. See the last three assessments for the ticker; clicking a row opens a details page.
- Maintain existing streaming progress feedback and error handling.

## Non-Goals
- Modifying the internal TradingAgents LangGraph itself (business logic stays intact).
- Building advanced analytics or editing historical assessments within this iteration.

## Current State Summary
- Trading run UI and logic live inside the `Trading` tab of `EquityInsight.tsx`.
- `useTradingProgress` hook manages SSE updates from the backend.
- Backend endpoint `POST /api/trading/decision/internal` drives agent orchestration (`backend/src/routes/tradingRoutes.ts`).
- Assessment logs persist in `assessment_logs` (`backend/src/db/schema.ts:36`) but no dedicated list endpoint exists.

## Proposed UX & Navigation
- Route: `/trading-agents` (protected via existing auth guard).
- Layout:
  - **Configuration Panel** (left/top on mobile):
    - Ticker input with validation (uppercase, limited to US markets).
    - Model dropdown fed by backend `GET /api/trading/models`.
    - Analyst checkbox group (default all checked).
    - CTA: `Run Trading Agents`.
  - **Recent Assessments Table** (right/bottom):
    - Columns: Execution Date (localized), Model, Agents, Decision.
    - Row click navigates to `/trading-agents/history/:id`.
  - **Run Status Panel**:
    - Reuse `TradingProgress` component for live status.
    - Display final decision summary cards on completion.
- Detail page `/trading-agents/history/:id` renders full assessment payload (structured cards + downloadable JSON).

## Backend Enhancements
- **Model Registry Endpoint**
  - `GET /api/trading/models`: returns array of `{ id, label, description, temperature? }`.
  - Resolve from env (`OPENAI_MODEL`) and optional parameter store (future integration).
- **Decision Endpoint Update**
  - Accept payload shape `{ symbol, modelId, analysts: string[], options? }`.
  - Validate analysts against enum `['fundamental','market','news','social']`.
  - Pass selected analysts + model into LangGraph orchestrator (new optional params).
- **Assessment History Endpoint**
  - `GET /api/trading/assessments?symbol=AAPL&limit=3`.
  - Query new repository method reading `assessment_logs` or dedicated `ta_decisions` table (`backend/src/db/taDecisionRepository.ts` if available).
  - Return metadata + identifier for detail fetch.
- **Assessment Detail Endpoint**
  - `GET /api/trading/assessments/:id`: fetch full stored payload for detail screen.
- **Authorization**
  - Guard new routes with existing auth middleware; ensure only authenticated users access trading API.

## Frontend Architecture
- New page component `src/pages/TradingAgents.tsx`.
- Shared hooks:
  - `useTradingAgentsForm` (React Hook Form + Zod) to manage ticker/model/analyst selections.
  - `useTradingHistory(symbol)` leveraging TanStack Query to call history endpoint.
  - Reuse `useTradingProgress` for streaming updates (subscribe when run initiated).
- Components:
  - `TradingAgentsConfigurator` (form fields + CTA).
  - `TradingAnalystSelector` (checkbox group).
  - `TradingHistoryTable` (table + navigation).
  - `TradingAssessmentDetail` page for `/history/:id`.
- Routing:
  - Update `src/main.tsx` / router config to register new routes.
  - Remove or hide trading tab from `EquityInsight` when feature toggled on.

## Data & Validation
- **Ticker**: uppercase string, regex `^[A-Z]{1,5}$`, optional later extension for `.A` etc.
- **Model**: selected option must exist in models list.
- **Analysts**: min 1 selection.
- **History**: limit query to 3; ensure backend sorts by execution timestamp descending.
- **Detail**: handle missing or large payload gracefully (loading state + error).

## State & Async Handling
- Use TanStack Query for models list (prefetch) and history.
- keep local state for active run (progress, decision output).
- Cancel run uses existing `handleCancel` logic -> call current cancellation endpoint or abort controller.
- Persist last selections (model, analysts) via `localStorage` for improved UX.

## Telemetry & Logging
- Client: track feature usage events (run initiated, success, failure).
- Server: log new parameters (model, analysts array) for observability.
- Ensure audit logs capture who accessed assessment detail if required.

## Security & Permissions
- Maintain current OAuth-protected API access.
- Sanitize incoming ticker/model fields to prevent injection.
- Apply rate limiting on `/api/trading/decision/internal` if not already present (future improvement).

## Implementation Roadmap
1. **Foundation**
   - Add backend routes/controllers for model list, history list, history detail.
   - Extend decision orchestrator to accept `modelId` + `analysts[]`.
   - Update repositories to fetch/store required metadata.
2. **Frontend Shell**
   - Create `TradingAgents.tsx` page with routing and layout scaffolding.
   - Implement form controls, validation, and API hooks.
   - Display history table with responsive design.
3. **Integration & UX Polish**
   - Wire run action to backend, integrate streaming progress UI.
   - Implement detail page rendering structured assessment info.
   - Add loading/error states, empty-state messaging.
4. **Deprecation & Cleanup**
   - Remove legacy trading tab from `EquityInsight` or feature flag it.
   - Update documentation (`docs/`) and user training materials.

## Development Checklist
- [ ] Backend: Implement `GET /api/trading/models` endpoint and service.
- [ ] Backend: Update decision endpoint to accept `modelId` and `analysts[]`.
- [ ] Backend: Implement `GET /api/trading/assessments` and `GET /api/trading/assessments/:id`.
- [ ] Backend: Store new metadata (model, analysts) with each assessment record.
- [ ] Frontend: Add new route `/trading-agents` with authentication guard.
- [ ] Frontend: Build configuration form with validation and API integration.
- [ ] Frontend: Create history table fetching last three assessments for ticker.
- [ ] Frontend: Add detail page for assessment drill-down.
- [ ] Frontend: Reuse `TradingProgress` for streaming status + final decision view.
- [ ] Cleanup: Retire or hide trading tab from `EquityInsight` once new screen ships.
- [ ] Documentation: Update `docs/` and release notes to reflect new workflow.

## Open Questions
- The user story ends with “the screen will also…”—clarify any additional requirements (e.g., export, sharing, bookmarking).
- Should history data live in a dedicated table (e.g., `ta_decisions`) or reuse `assessment_logs`?
- How should analyst selections map to backend personas (exact IDs vs friendly labels)?
- Do we need RBAC distinctions (e.g., only traders can run agents)?
- What pagination or archival strategy is needed beyond the last three assessments?

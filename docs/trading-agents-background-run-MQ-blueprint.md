# Trading Agents Background Execution Blueprint

## Objective
Ensure Trading Agent runs continue processing when a user navigates away, expose progress to returning sessions, and persist completed runs in history without relying on long-lived HTTP requests.

## High-Level Architecture
- **Async job orchestration**  
  - Adopt BullMQ backed by Upstash Redis (free tier) for queuing individual trading runs.  
  - Launch new `trading-agents-runner` worker that consumes jobs, invokes `TradingOrchestrator.run`, and publishes SSE updates via the existing `tradingProgressService`.
- **Persistent run state**  
  - Introduce `trading_runs` table (or collection) to capture run metadata: `run_id`, `symbol`, `status`, `model_id`, `analysts`, `started_at`, `completed_at`, `result_blob`, `error_message`.  
  - Store progress events in `trading_run_events` (or leverage Redis streams) so reconnecting clients can rebuild progress history.
- **API surface**  
  - `POST /api/trading/decision/runs` → validate request, enqueue job, return `{ runId }`.  
  - `GET /api/trading/decision/runs/:runId` → metadata + status.  
  - `GET /api/trading/decision/runs?symbol=AMD&status=active` → list active/incomplete runs for a ticker.  
  - `DELETE /api/trading/decision/runs/:runId` → cancel run (marks status and removes queued job).  
  - Reuse existing SSE endpoint, but hydrate from persisted events before subscribing to live Redis pub/sub stream.
- **Frontend coordination**  
  - Persist active run info in local storage keyed by ticker.  
  - When page mounts or ticker changes, query `/runs?symbol=…&status=active`; if present, connect SSE and display progress bar; otherwise fetch history.  
  - On SSE completion/error, clear stored active run and refresh history list.

## Task Checklist

### Backend Foundations
- [ ] Add BullMQ & Redis configuration module (`backend/src/config/queue.ts`) that reads Upstash credentials.  
- [ ] Create queue producer helper in Trading routes service (`enqueueTradingRun(symbol, modelId, analysts, runId)`).
- [ ] Scaffold worker entry point (`backend/src/workers/tradingAgentsWorker.ts`) that:
  - [ ] Consumes jobs with retry/backoff defaults.
  - [ ] Calls `TradingOrchestrator.run` and streams interim progress via `publishProgressEvent`.
  - [ ] Captures completion/error and updates persistence (`trading_runs`, `trading_run_events`).

### Persistence Layer
- [ ] Define new schema/migrations for `trading_runs` and `trading_run_events` (or Redis-backed equivalent).  
- [ ] Extend existing trading assessments repository to read/write the new tables.  
- [ ] Implement cleanup/TTL policy for run events (e.g., delete 48h after completion).

### API Adjustments
- [ ] Replace `POST /api/trading/decision/internal` synchronous path with new `POST /runs` that:
  - [ ] Validates input.
  - [ ] Inserts/updates `trading_runs` record (status `queued`).
  - [ ] Enqueues BullMQ job and returns `{ runId }`.  
- [ ] Add REST handlers for `/runs/:runId`, `/runs` list filters, and `/runs/:runId` cancellation.  
- [ ] Update SSE endpoint to hydrate from stored events before attaching to in-memory stream.  
- [ ] Ensure history endpoints include completed runs stored in new table.

### Frontend Updates (`equity-insight-react`)
- [ ] Update `runTradingAgents` handler to call new endpoint; remove AbortController dependency.  
- [ ] Persist `{ ticker, runId }` in local storage and context.  
- [ ] On component mount / ticker search:
  - [ ] Check local state & `/runs?symbol=…&status=active` to reattach SSE if needed.
  - [ ] Load existing progress events to restore progress bar state.  
- [ ] Show cancellation option that hits `DELETE /runs/:runId`.  
- [ ] Refresh history list when runs finish or error out.

### Observability & Ops
- [ ] Add structured logging around queue enqueue/dequeue, worker lifecycle, and failures.  
- [ ] Instrument metrics (run duration, queue depth, failure counts).  
- [ ] Document runbook: how to deploy worker, rotate Upstash credentials, scale queue consumers.  
- [ ] Add automated tests:
  - [ ] Worker integration with mocked orchestrator.  
  - [ ] API contract tests for new endpoints.  
  - [ ] Frontend Cypress/Vitest coverage for navigation away/return scenario.

### Migration & Rollout
- [ ] Create feature flag or staged rollout path to switch from synchronous to async processing.  
- [ ] Migrate existing active runs smoothly (e.g., allow both endpoints temporarily).  
- [ ] Update deployment workflows to launch the new worker process alongside the API.


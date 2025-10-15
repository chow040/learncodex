# Trading Agent Results → DB Blueprint & Checklist

Goal: persist agent decisions/outcomes in Postgres and safely reuse summarized past results in future assessments/decisions, with clear guardrails and observability.

## Objectives
- Persist all TradingAgents decisions with metadata and raw text.
- Record realized outcomes for labeling and performance metrics.
- Feed compact, time-valid past results into prompts (assessments + decision graph).
- Add performance-aware risk/policy gates (optional, behind flags).

## Design Principles
- Append-only core tables; never mutate past decisions.
- Time-valid reads only (no look-ahead leakage).
- Summarize aggressively to control token budget.
- Keep file logs for rich debugging; DB holds structured facts and minimal raw text.

## Data Model (DDL Sketch)

```sql
-- ta_runs (optional)
CREATE TABLE IF NOT EXISTS ta_runs (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT UNIQUE,
  symbol TEXT NOT NULL,
  trade_date DATE NOT NULL,
  model TEXT,
  prompt_hash TEXT,
  orchestrator_version TEXT,
  logs_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ta_runs_symbol_trade_date ON ta_runs (symbol, trade_date);

-- ta_decisions
CREATE TABLE IF NOT EXISTS ta_decisions (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT,
  symbol TEXT NOT NULL,
  trade_date DATE NOT NULL,
  decision_token TEXT NOT NULL CHECK (decision_token IN ('BUY','SELL','HOLD','NO DECISION')),
  investment_plan TEXT,
  trader_plan TEXT,
  risk_judge TEXT,
  payload JSONB,
  raw_text TEXT,
  model TEXT,
  prompt_hash TEXT,
  orchestrator_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ta_decisions_symbol_trade_date ON ta_decisions (symbol, trade_date);
CREATE INDEX IF NOT EXISTS idx_ta_decisions_symbol_created_at ON ta_decisions (symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ta_decisions_run_id ON ta_decisions (run_id);

-- ta_outcomes (realized labels)
CREATE TABLE IF NOT EXISTS ta_outcomes (
  id BIGSERIAL PRIMARY KEY,
  decision_id BIGINT NOT NULL REFERENCES ta_decisions(id) ON DELETE CASCADE,
  horizon TEXT NOT NULL, -- e.g. 'D+5'
  realized_return DOUBLE PRECISION,
  max_drawdown DOUBLE PRECISION,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ta_outcomes_decision_id ON ta_outcomes (decision_id);
CREATE INDEX IF NOT EXISTS idx_ta_outcomes_horizon ON ta_outcomes (horizon);

-- Optional materialized view for trailing metrics (computed by job)
-- ta_metrics_mv(symbol TEXT, window TEXT, trailing_win_rate DOUBLE PRECISION, avg_return DOUBLE PRECISION,
--               avg_drawdown DOUBLE PRECISION, sharpe_like DOUBLE PRECISION, count BIGINT, updated_at TIMESTAMPTZ)
```

Existing table: `assessment_logs` (already created by 001/002 migrations) remains as-is for equity assessments.

## Migrations Checklist
- [x] Add `003_create_ta_runs.sql` with `ta_runs` DDL (optional but recommended)
- [x] Add `004_create_ta_decisions.sql` with `ta_decisions` DDL + indexes
- [x] Add `005_create_ta_outcomes.sql` with `ta_outcomes` DDL + indexes
- [ ] (Optional) Add `006_create_ta_metrics_mv.sql` or create via job
- [ ] Document how to run migrations locally and in CI/CD

## Write Path Integration
- [x] Create repository: `backend/src/db/taDecisionRepository.ts`
  - [x] `insertTaDecision({ decision, payload, rawText, runId, model, promptHash, orchestratorVersion, logsPath }): Promise<void>`
  - [ ] `findRecentBySymbol(symbol, beforeDate, limit): Promise<TaDecision[]>`
- [x] Invoke insert at finalize:
  - File: `backend/src/taEngine/langgraph/decisionWorkflow.ts`
  - Location: after eval logging in `finalizeNode` (post `writeEvalSummary`)
  - [x] Generate `run_id` and pass orchestrator/model metadata
- [x] Keep file-based prompt/eval logs; store `logs_path` in `ta_runs` when available
- [ ] (Optional) Replace `memoryStore.appendMemory` with DB writes (or keep as fallback)

## Read Path (Using Past Results)
- [x] New service: `backend/src/services/pastResultsService.ts`
  - [x] `getRoleSummaries(symbol, cutoffDate, limit)` → `{ manager, trader, risk }`
  - [x] Enforce time validity: only rows before `cutoffDate`
  - [ ] Join `ta_outcomes` and compute short trailing stats
  - [x] Token-budget aware summaries (3–6 lines per role)
- [x] Wire into graph loader:
  - File: `backend/src/taEngine/langgraph/decisionWorkflow.ts`
  - [x] Replace `getPastMemories` calls with DB-backed service; fallback to file `memoryStore` if DB unavailable
- [ ] Assessments path (optional):
  - File: `backend/src/services/openaiService.ts`
  - [ ] Under flag, fetch last 3 assessment logs for symbol and inject “Past Assessments” block

## Summarization Guidelines
- Use outcomes-first emphasis: recent invalidations, loss clusters, worst drawdowns
- Keep K small (≤5); aggregate older history into 1–2 lines
- Fixed template per role to reduce variance and tokens
- Strip dates to ISO (YYYY-MM-DD); avoid URLs/IDs in the prompt

## Risk/Policy Gates (Optional)
- [ ] Position scaling rules based on trailing metrics (win-rate, drawdown)
- [ ] Extra confirmation for BUY/SELL under poor trailing metrics
- [ ] Inject flags into prompts rather than hard blocks; keep explainable

## Config & Env
- [x] Add flags to `backend/src/config/env.ts`
  - [x] `USE_DB_MEMORIES` (default true if `DATABASE_URL` present)
  - [x] `USE_PAST_RESULTS_IN_ASSESSMENTS` (default false)
  - [x] `PAST_RESULTS_WINDOW_DAYS` (e.g., 90)
  - [x] `PAST_RESULTS_MAX_ENTRIES` (e.g., 5)
- [ ] Update `backend/.env.example`

## Indexing & Retention
- [x] Ensure indexes:
  - [x] `ta_decisions (symbol, trade_date)`
  - [x] `ta_decisions (symbol, created_at DESC)`
  - [x] `ta_decisions (run_id)`
  - [x] `ta_outcomes (decision_id)`, `(horizon)`
- [ ] Consider partitioning by `trade_date` or TimescaleDB if volume grows
- [ ] Retain `raw_text` in DB 30–90 days; rely on file logs for long-term

## Backfill
- [ ] Script to parse existing JSON logs in `backend/eval_results/*/TradingAgentsStrategy_logs`
- [ ] Insert historical rows into `ta_decisions`
- [ ] Compute synthetic outcomes using historical prices (optional) → seed `ta_outcomes`

## Testing
- [ ] Unit: repository insert/fetch, time filters, summarizer output
- [ ] Integration: run migrations, execute one graph decision → rows created
- [ ] Assessment path: flag on → prior assessments injected (size ≤ target tokens)
- [ ] Smoke: `/api/trading/decision/internal` returns decision and DB insert observed

## Observability
- [ ] Propagate `run_id` through graph; log with prompts and DB rows
- [ ] Counters: decisions/day, insert/fetch latencies
- [x] Warnings: DB unavailable → file fallback path used

## Rollout Plan
- Phase 1
  - [x] Migrations
  - [x] Write-only `ta_decisions` at finalize (no behavioral change)
- Phase 1.5
  - [x] DB-backed role summaries behind `USE_DB_MEMORIES`; file fallback intact
- Phase 2
  - [ ] Outcomes labeling job + simple trailing metrics view
- Phase 2.5
  - [ ] Inject “Past Performance Summary” + optional risk scaling
- Phase 3
  - [ ] Retire file memories; keep file logs for prompts/conversations

## Acceptance Criteria
- [x] Every decision run writes a `ta_decisions` row with consistent metadata
- [x] Past-result summaries appear in prompts when enabled and never exceed token budget
- [x] No look-ahead leakage in summarization (strict cutoff)
- [ ] Outcomes can be attached and queried by `decision_id`
- [ ] Basic trailing metrics can be computed per symbol

## References (current code)
- Assessment DB logging: `backend/src/db/assessmentLogRepository.ts`
- Assessment route (injection point for prior assessments): `backend/src/routes/assessmentRoutes.ts`
- Decision graph finalize & memories: `backend/src/taEngine/langgraph/decisionWorkflow.ts`
- Memory store (fallback/file): `backend/src/taEngine/memoryStore.ts`
- Logger (prompt and eval logs): `backend/src/taEngine/logger.ts`

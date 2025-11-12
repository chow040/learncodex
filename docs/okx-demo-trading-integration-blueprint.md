# OKX Demo Trading Integration Blueprint

## Executive Summary

**Goal**: Enable OKX demo exchange execution for the existing LLM-based auto-trading system without changing core trading logic.

**Approach**: Implement OKX as a **broker adapter** that plugs into the current system's execution layer, using CCXT for all OKX demo REST/WebSocket interactions to stay consistent with existing exchange utilities.

**Impact**: 
- ✅ All LLM decisions execute on OKX demo exchange
- ✅ Real market data feeds into decision pipeline  
- ✅ Zero changes to decision logic, prompts, or risk management
- ✅ ~10 lines of code changes in scheduler + new broker files
- ✅ Switch between simulated/OKX via config flag

---

## Overview
This blueprint outlines the integration of OKX API as a **broker implementation** for the existing auto-trading LLM system. OKX provides a demo trading environment that will replace the in-memory simulated broker while keeping all LLM decision-making, prompt engineering, and trading logic intact.

**Key Design Principle**: OKX integration is a **drop-in replacement** for the simulated broker. The LLM decision pipeline, feedback loop, risk management, and all existing auto-trading logic remains unchanged. CCXT remains the transport layer, so switching between demo/live only requires configuration updates.

**Runtime Mode Selection**: Trading mode (Simulator, Paper Trading, Live Trading) is controlled from the frontend. The backend exposes an API to switch brokers at runtime, mapping each UI mode to a broker implementation:
- `Simulator` → `SimulatedBroker`
- `Paper Trading` → `OKXDemoBroker`
- `Live Trading` → (future) `OKXLiveBroker`

The `.env` file now only provides credentials; the active mode is persisted server-side and set via the UI.

## Objectives
- Replace `SimulatedBroker` with `OKXDemoBroker` implementation
- Execute LLM trading decisions on OKX demo exchange
- Fetch real-time market data from OKX for LLM context
- Keep all existing decision pipeline, prompt building, and feedback loop
- Maintain portfolio state synchronization with OKX
- Provide seamless transition path to live trading

## Current State
- ✅ **Auto-trading LLM system** with DeepSeek decision engine
- ✅ **Decision pipeline** with prompt builder and feedback loop
- ✅ **Risk management** handled inside LLM prompts/constraints
- ✅ **SimulatedBroker** (in-memory) for testing
- ✅ **Portfolio snapshot** and PnL tracking
- ✅ **Scheduler** for periodic evaluation cycles
- ❌ Real exchange API integration
- ❌ Demo trading with actual market data
- ❌ Real order execution and fills

## Target State
- ✅ **OKXDemoBroker** implementing existing `BaseBroker` interface
- ✅ **LLM decisions** executed on OKX demo exchange
- ✅ **Real-time market data** from OKX fed into prompt builder
- ✅ **Existing scheduler** routes decisions to OKX broker
- ✅ **Portfolio snapshots** reflect OKX demo account state
- ✅ **Feedback loop** learns from actual OKX trade outcomes
- ✅ **LLM-defined risk rules** executed unchanged on OKX orders
- ✅ **WebSocket feeds** for live prices in decision context

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EXISTING SYSTEM                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌───────────────┐                    │
│  │  Scheduler   │─────▶│ Decision      │                    │
│  │  (unchanged) │      │ Pipeline      │                    │
│  └──────────────┘      │ (unchanged)   │                    │
│                        └───────┬───────┘                    │
│                                │                              │
│  ┌──────────────────────────────▼─────────────┐            │
│  │        Prompt Builder (unchanged)          │            │
│  │  • System prompt with risk rules           │            │
│  │  • Market data context                     │            │
│  │  • Portfolio state                         │            │
│  │  • Feedback loop integration               │            │
│  └──────────────────────┬─────────────────────┘            │
│                         │                                    │
│  ┌──────────────────────▼─────────────────────┐            │
│  │       DeepSeek LLM (unchanged)             │            │
│  │  Returns: action, size, confidence, etc.   │            │
│  └──────────────────────┬─────────────────────┘            │
│                         │                                    │
│  ┌──────────────────────▼─────────────────────┐            │
│  │    Risk Validation (unchanged)             │            │
│  │  • Check position limits                   │            │
│  │  • Validate leverage                       │            │
│  │  • Verify confidence threshold             │            │
│  └──────────────────────┬─────────────────────┘            │
│                         │                                    │
└─────────────────────────┼────────────────────────────────────┘
                          │
        ┌─────────────────▼─────────────────┐
        │   Broker Factory (NEW)            │
        │   Selects: Simulated or OKX       │
        └─────────────────┬─────────────────┘
                          │
         ┌────────────────┴────────────────┐
         │                                  │
    ┌────▼─────┐                   ┌───────▼────────┐
    │Simulated │                   │  OKXDemoBroker │  ◄── NEW
    │ Broker   │                   │   (NEW)        │
    │(existing)│                   └───────┬────────┘
    └──────────┘                           │
                                  ┌────────▼────────┐
                                  │   OKX API       │
                                  │  • REST Client  │
                                  │  • WebSocket    │
                                  │  • Auth         │
                                  └─────────────────┘
```

**Critical**: All components above the broker factory remain **completely unchanged**. OKX integration is purely at the execution layer.

---

## What Remains COMPLETELY Unchanged

### ✅ LLM Decision Making
- **DeepSeek integration** - Same model, same prompts
- **Prompt engineering** - All prompt templates unchanged
- **Decision format** - JSON response structure identical
- **Confidence scoring** - Same threshold logic (>0.6)
- **Action types** - buy, sell, hold, close, no_entry

### ✅ Risk Management
- **Position size limits** - Max 50% of equity
- **Leverage constraints** - Max 10× leverage
- **Confidence threshold** - Requires ≥60% confidence
- **Daily loss cap** - $1,000 limit
- **Drawdown pause** - 5% drawdown triggers pause
- **Validation logic** - All pre-trade checks unchanged

### ✅ Feedback Loop
- **Trade history tracking** - Same data structure
- **Learning engine** - Learns from OKX trades identically
- **Rule extraction** - Pattern recognition unchanged
- **Prompt enhancement** - Injects learned rules same way

### ✅ Portfolio Management
- **Snapshot format** - Same API response structure
- **PnL calculation** - Same formulas (just using OKX data)
- **Sharpe ratio** - Same calculation method
- **Drawdown tracking** - Same monitoring logic
- **Position tracking** - Same data models

### ✅ Scheduler & Orchestration
- **Evaluation interval** - Still runs every 5-15 minutes
- **Job status** - Same running/paused states
- **Trigger mechanism** - Manual evaluation unchanged
- **Logging** - Same log format and structure

### ✅ API & Dashboard
- **REST endpoints** - `/api/autotrade/v1/portfolio` unchanged
- **Response format** - Same JSON structure
- **Frontend integration** - React dashboard works identically
- **WebSocket updates** - Same real-time update mechanism

---

## What Changes (Execution Layer Only)

### ⚠️ Broker Implementation
- **Order placement** - Now goes to OKX instead of in-memory
- **Position tracking** - Synced from OKX API
- **Balance management** - Uses OKX account balance
- **Market prices** - Fetched from OKX (more accurate)

### ⚠️ Configuration
- **Broker selection** - Added config: `TRADING_BROKER=okx_demo`
- **API credentials** - OKX keys added to environment
- **Market data source** - Can use OKX WebSocket (optional)

**Total Code Changes**: ~10 lines in `scheduler.py` + new broker files

---

## Implementation Checklist

### Phase 0: Trading Symbol Configuration
- [ ] Add new config/env (`AUTOTRADE_LLM_SYMBOLS`) that defines the subset of symbols the LLM should assess/trade
- [ ] Default to `market_data_symbols` when unset to preserve current behaviour
- [ ] Update cache readers/tools to pull only the configured trading symbols from Redis to reduce token usage
- [ ] Document how banner symbols (market data) and LLM trading symbols can diverge


### Phase 1: OKX API Client Setup
- [x] Create OKX API credentials (demo environment)
- [x] Implement OKX REST API client (ccxt-backed)
- [x] Add authentication (API key, secret, passphrase)
- [x] Implement request signing mechanism (ccxt handles signing)
- [x] Add rate limiting and retry logic
- [x] Create configuration for demo vs. live endpoints (sandbox toggle)
- [x] Write unit tests for API client

### Phase 2: Market Data Integration
- [x] Implement ticker data fetching *(reused existing CCXT market data scheduler)*
- [x] Add candlestick/OHLCV data retrieval *(already cached by scheduler)*
- [x] Integrate funding rate data *(covered by OKXDerivativesFetcher)*
- [x] Add open interest data *(covered by OKXDerivativesFetcher)*
- [x] Implement order book snapshot retrieval *(existing scheduler)*
- [x] Create WebSocket client for real-time prices *(FastAPI `/ws/market-data` already in place)*
- [x] Cache market data appropriately *(Redis caching complete)*
- [x] Handle WebSocket reconnection *(frontend + scheduler logic already implemented)*

### Phase 3: Demo Trading Operations
- [x] Implement place order endpoint (`OKXDemoBroker.place_order`)
- [x] Add cancel order functionality
- [x] Create modify order endpoint (edit order wrapper)
- [x] Add order status checking (`fetch_order`, `fetch_open_orders`)
- [x] Implement position query (`fetch_positions`)
- [x] Add balance/account info retrieval (`fetch_balance`)
- [x] Create trading history fetching (`fetch_trade_history`)
- [x] Add fills and executions tracking (broker maintains execution log)

### Phase 4: Broker Abstraction Layer
- [x] Extract `BaseBroker` interface from existing code
- [x] Refactor `SimulatedBroker` to implement `BaseBroker`
- [x] Implement `OKXDemoBroker` with same interface
- [x] Create broker factory in existing scheduler
- [x] Add broker selection via configuration (`AUTOTRADE_TRADING_BROKER`)
- [x] Ensure consistent API across brokers (async `execute`, feedback hooks)
- [x] Add broker-specific error handling (OKXClient exceptions surfaced as `OKXClientError`)
- [x] Test broker switching without code changes (unit tests cover simulated vs OKX paths)

### Phase 5: Integration with Existing Decision Pipeline
- [x] **Use existing market data** from OKX in prompt builder
- [x] **Route LLM decisions** through broker factory to OKX
- [x] **Keep decision pipeline** completely unchanged
- [x] Update `Scheduler.run_evaluation()` to use broker factory
- [x] Pass OKX positions to `SimulationManager.build_snapshot()`
- [x] Implement position synchronization with portfolio state
- Notes:
  - Demo/live modes must stay entirely separate from the simulator JSON; OKX data is the single source of truth.
  - Add reconciliation logic that compares exchange positions to our cache and raises alerts if they drift.
  - Record an audit entry whenever runtime mode switches between simulator/paper/live.
  - OKX broker now records per-order latency; stats are available via `/internal/autotrade/v1/metrics/latency/okx-order` for ops dashboards (no FE consumption planned yet).
  - Frontend dashboard now exposes a Simulator/Paper/Live dropdown wired to the runtime-mode API.
- [x] Add order execution validation from LLM decisions
- [x] Keep existing feedback loop with OKX trade results
- [x] Expose Simulator / Paper / Live mode selection via API + UI to control broker choice
  - [x] Store selected mode in Postgres (`autotrade_runtime_settings` table)
  - [x] `GET/PATCH /internal/autotrade/v1/runtime-mode` endpoints for FE
  - [x] Broker factory/decision runner read mode from DB at startup (no Redis mirror)
- [ ] Preserve execution latency monitoring

### Phase 6: Portfolio Management Integration
- [x] Update `SimulationManager` to work with both brokers
- [x] Sync OKX positions to existing portfolio snapshot
- [x] Track demo account balance in existing structure
- [x] Calculate unrealized PnL from OKX positions
- [x] Store realized PnL from closed OKX trades
- [x] Keep existing snapshot format for API response
- [x] Add reconciliation between OKX and local state
- [x] Handle position updates via WebSocket in scheduler
- [x] Preserve `get_portfolio_snapshot()` return structure
- Notes:
  - Simulator stays on `SimulatedPortfolio`, while demo/live snapshots come straight from OKX (balances + positions).
  - Track realized/unrealized PnL per OKX position to feed the dashboard charts.
  - Use OKX WebSocket (or tight polling) to push fills/position changes to the UI in near real-time.
  - Both simulator and OKX snapshots are persisted to `auto_portfolios` / `portfolio_positions` so every consumer reads the same source of truth.
  - PositionSyncService polls OKX every 15s and broadcasts `portfolio_update` messages over the existing WebSocket channel (no UI yet).
  - Closed OKX trades now populate `portfolio_closed_positions` using fetched fills so the dashboard's history view stays accurate.

### Phase 7: Risk Management (LLM-Native, Deferred)
- Status: paused by product decision; engineering work documented below for when/if we re-enable it.
- [ ] Enrich LLM prompt with full risk context (equity, exposure, historical drawdown)
- [ ] Teach LLM to output explicit risk rationale + planned mitigations
- [ ] Persist LLM risk reasoning alongside each trade intent
- [ ] Create monitoring dashboard that visualizes model-stated risk vs. realized results
- [ ] Surface “LLM risk confidence” in the UI / logs for human review
- [ ] Implement optional human override (pause) without automated guardrails

#### Design Overview
- **Principle**: the LLM is solely responsible for sizing, leverage, and kill-switch logic. The backend trusts the LLM output and does not alter orders unless the broker/API rejects them.
- **Prompting**: a dedicated “Risk Governance” section forces the LLM to summarize current portfolio health, articulate worst-case scenarios, and justify how the proposed trade keeps the book within bounds.
- **State Sharing**: scheduler passes richer context (`equity`, `realized/unrealized PnL`, `exposure by asset`, `rolling drawdown`, `open orders`), enabling the LLM to reason about risk like a human PM.
- **Observability**: instead of code-level validations, we log the LLM’s risk assessment verbatim so ops can replay decisions and audit whether the model followed its own rules.
- **Human Control**: the only backend control is a manual “pause trading” flag operators can flip through the runtime-mode endpoint; no automatic stoppage occurs.

#### LLM Prompt Additions
1. **Risk Snapshot Block**
   - Tabular summary injected into the system prompt:
     ```
     Equity: $123,450 | Cash: $45,000 | Maintenance Margin Ratio: 28%
     BTC Exposure: 32% (+$15k Unrealized) | ETH Exposure: 8%
     Rolling 24h Drawdown: 3.2% | Max Allowed Drawdown: 6% (soft target)
     ```
   - Includes funding, volatility, and order-book depth metrics so the model can judge liquidity.
2. **Decision Template**
   - Model must answer:
     - `Proposed Trade`
     - `Risk Thesis`
     - `Max Pain Scenario`
     - `Recovery / Hedge Plan`
     - `Confidence (0-1)`
   - Scheduler parses this structure and forwards orders blindly if `confidence >= configured minimum`.
3. **Memory of Prior Breaches**
   - Feedback loop stores past “risk mistakes” (e.g., oversized bet, poor hedge) and reminds the LLM so it self-corrects over time.

#### Data Flow
```
LLM Decision (with embedded risk plan) ──▶ OKXDemoBroker
              │
              ├── Risk narrative stored in Postgres (audit + analytics)
              └── Dashboard displays rationale + realized PnL deltas
```

#### Observability & Tooling
- **Risk Ledger Table**: `autotrade_llm_risk_journal` captures model reasoning, confidence, and post-trade metrics for comparisons.
- **Dashboard Widgets**: charts show “LLM target exposure vs. actual,” “Confidence vs. realized PnL,” and highlight when the LLM ignores its own stated limits.
- **Alerts**: Instead of automated halts, ops receive notifications when realized drawdown exceeds the LLM’s forecast, prompting manual intervention if desired.
- **Replay Tool**: CLI/Notebook utility replays prompt + model response for any trade to understand why the model took a risky stance.

#### API Payload Split (Portfolio vs. Market Data)
- `/internal/autotrade/v1/portfolio` now returns *only* account state (cash, equity, positions, closed trades, recent decisions/events). This keeps the payload lightweight for frequent polling and clarifies separation of concerns.
- Market data continues to flow through the dedicated REST + WebSocket endpoints (`/api/market/v1/prices` and `/ws/market-data`), which the frontend already consumes for the price banner and charts.
- Frontend changes: components no longer read `portfolio.marketData`; they rely on the existing market-data hooks/WebSocket pipeline to stay up to date.
- Benefit: smaller responses, reduced duplication, and clearer API boundaries (portfolio = account info, market endpoints = ticker/candle data).

#### Decisions API Consumption
- Dashboard’s decision log now reads from `/internal/autotrade/v1/decisions` instead of the portfolio payload. Portfolio snapshots stay focused on balances/positions while decisions are fetched via the dedicated endpoint already exposed by the backend.
- A new React hook (`useAutoTradingDecisions`) handles the fetch and caching via React Query, keeping the UI responsive even when evaluations produce large decision batches.
- This separation makes it easier to page/stream decisions later without bloating the portfolio response.
#### 🔧 Decision Persistence Gap

**Problem**: Paper + simulator runs only refresh the in-memory/JSON snapshot. The decision stream exposed via `/internal/autotrade/v1/decisions` reads from `llm_decision_logs`, so every new evaluation looks invisible to the dashboard/API until someone backfills the table manually.

**Objective**: Each evaluation cycle must emit a durable row per decision (plus prompt + chain-of-thought references) within the same async task that already handles execution. The log should exist before orders are handed to the broker so observability does not depend on execution success.

**Why it matters**
- UI regressions: the React decision log shows stale data, making paper trading look idle.
- Feedback loop starvation: outcome trackers cannot link fills to the original reasoning when `decision_id` is missing.
- Compliance/audit: we lose the prompt + model response history, which should be immutable per run.

**Implementation Plan**
1. **Add persistence helper**
   - New module `autotrade_service/persistence/decision_logs.py` with `async def persist_decision_logs(result: DecisionPipelineResult, portfolio_id: str, runtime_mode: RuntimeMode) -> list[str]`.
   - Helper wraps a single DB transaction that:
     1. Upserts prompt + chain-of-thought blobs into `llm_prompt_payloads` (reuse inline `storage_uri` scheme from `docs/tool-payload-live-trading-persistence.md`).
     2. Inserts one row per decision into `llm_decision_logs` including `tool_payload_json`.
     3. Returns the generated UUIDs so brokers/outcome trackers can tag orders/events with the originating `decision_id`.
2. **Hook scheduler output**
   - In `execute_decision_cycle()` call the helper immediately after `decision_pipeline.run_once()` returns and **before** broker execution.
   - Fetch `portfolio_id` from the portfolio snapshot (paper/live) or fall back to `"simulation"` when running offline. When Postgres is unavailable, short-circuit with a warning but keep evaluation running.
   - Attach returned `decision_id`s back onto each `DecisionPayload` (e.g., `decision.decision_log_id = persisted_ids[i]`) so downstream code (brokers, feedback loop, `portfolio_closed_positions`) can reference the correct row.
3. **Schema delta**
   - Ensure `llm_decision_logs.tool_payload_json JSONB NULL` exists (see `docs/tool-payload-live-trading-persistence.md` for migration DDL + index recommendation).
   - No other columns change; reuse existing enums for `action`.
4. **API alignment**
   - `_map_decision()` in `repositories.py` already hydrates prompts; extend it to include `tool_payload_json` (done for simulator parity).
   - `/internal/autotrade/v1/decisions` automatically reflects the new rows because it queries `llm_decision_logs`. No frontend changes besides verifying the feed now updates in lockstep with evaluations.
5. **Backfill (optional)**
   - One-off script `scripts/backfill_decision_logs.py` can read the latest `logs/simulation_state.json` entries and insert them into Postgres to avoid empty history after the deploy.

**Pseudocode**

```python
result = await decision_pipeline.run_once(...)
if result and result.response.decisions:
    portfolio = await fetch_latest_portfolio()
    portfolio_id = portfolio.portfolio_id if portfolio else settings.portfolio_id
    decision_ids = await persist_decision_logs(
        result=result,
        portfolio_id=portfolio_id,
        runtime_mode=runtime_mode,
    )
    for decision, decision_id in zip(result.response.decisions, decision_ids):
        decision.decision_log_id = decision_id
    await broker.execute(...)
```

**Testing**
- Unit test persistence helper with `asyncpg` test double to ensure prompt + COT rows are created once per run and that tool payload JSON survives round-trips.
- Extend `tests/test_scheduler_execution_loop.py` to assert that triggering an evaluation in paper mode inserts the expected `llm_decision_logs` row and surfaces the `decision_log_id` on the returned portfolio snapshot.
- Add regression test for DB-down scenario: helper should log and skip without crashing the scheduler.

**Rollout**
1. Ship migration → deploy backend → verify `/internal/autotrade/v1/decisions` increments after a manual evaluation.
2. Run (optional) backfill script so historical simulator runs populate the table.
3. Enable dashboard polling (already done) to prove the persistence gap is closed.

#### Example Scenarios

| Scenario | LLM Risk Output | Backend Behavior |
|----------|-----------------|------------------|
| Aggressive BTC long | “Target 40% equity, leverage 6×, confidence 0.78, stop at 5% drawdown.” | Scheduler submits order exactly as requested; logs rationale. |
| Market stress spotted | “Volatility spike, standing down until drawdown ≤3%. Confidence 0.32.” | No order placed because the LLM chose to abstain; system waits for next cycle. |
| Self-imposed kill switch | “Equity fell 6.4%, initiating self-pause for 2 cycles.” | Scheduler respects the instruction by skipping the next two runs without extra code-level checks. |
| Hedged pair trade | “Long BTC 20%, short ETH 10% to neutralize beta; expected VaR $800.” | Broker receives both orders; monitoring dashboard compares stated VaR vs. realized loss later. |
| Missed risk target | Model promised ≤5% exposure but executed 12%. | No automatic block; dashboard flags discrepancy so humans can retrain/adjust prompts. |

By concentrating risk logic inside the LLM prompt + reasoning, Phase 7 maximizes flexibility and experimentation speed. The backend simply reflects, records, and visualizes what the model decided, leaving judgment—and accountability—inside the model’s control loop.

### Phase 8: Testing & Monitoring
- [x] Write integration tests with OKX demo API *(scheduler/broker flow covered in `tests/test_scheduler_execution_loop.py`)*
- [x] Create end-to-end trading workflow tests *(headless runner in `scripts/e2e_okx_demo.py` + mock-backed test `tests/test_e2e_runner.py`)*
- [ ] Add performance benchmarks
- [ ] Implement comprehensive logging
- [ ] Create dashboards for monitoring
- [ ] Add alerting for API failures
- [x] Test failover scenarios *(failover drill script + mock-backed tests)*

#### Testing Strategy
1. **Deterministic Fixtures**
   - Stand up WireMock (or FastAPI mock) that replays recorded OKX responses, enabling fully deterministic CI runs without live demo credentials.
   - Capture fixtures for: ticker, order placement, cancel, positions, balance, and error responses (e.g., insufficient margin).
   - ✅ Covered in codebase via the in-memory `MockOKXExchange` helper (`tests/utils/mock_okx_exchange.py`) leveraged by integration tests.
2. **Integration Suite (pytest)**
   - `tests/test_scheduler_execution_loop.py` *(added)* — spins up the scheduler decision runner with a stubbed pipeline + broker to ensure evaluation → execution → portfolio snapshot flow works deterministically.
   - `tests/integration/test_okx_demo_broker_integration.py` *(added)* — runs `OKXDemoBroker` against `MockOKXExchange` to validate order placement, balance/position sync, and trade history without touching real OKX endpoints.
   - `tests/integration/brokers/test_okx_demo.py`
     - Place → fetch → cancel order flow using live demo keys (flagged as `@pytest.mark.okx_demo`).
     - Balance/position sync parity assertions vs. known demo account snapshot.
   - `tests/integration/scheduler/test_execution_loop.py`
     - Spin up scheduler with mocked LLM + OKX client to validate evaluation→broker→feedback flow.
   - CI runs mocks only; a nightly cron job hits live OKX demo to detect API regressions.
3. **End-to-End Workflow Test**
   - ✅ Headless script `scripts/e2e_okx_demo.py`:
     1. Sets runtime mode (`/runtime-mode` PATCH) to Paper Trading.
     2. Triggers scheduler evaluation via `/scheduler/trigger`.
     3. Polls `/portfolio` + latency metrics to ensure data refreshed; prints summary JSON for ops.
   - Automated verification via `tests/test_e2e_runner.py`, which uses an HTTPX mock transport to exercise the workflow without a live server.
4. **Performance & Load**
   - Benchmark `OKXDemoBroker.place_order` + `fetch_positions` under burst conditions (20 concurrent tasks) to ensure async client + rate limiting survive.
   - Capture p95 latency + success rate; fail pipeline if latency >2s in demo env.

#### Monitoring & Observability
1. **Structured Logging**
   - Use JSON logs with correlation IDs (`evaluation_id`, `order_id`) so Kibana/Grafana can trace a trade from LLM intent → OKX result.
   - Log categories:
     - `trade.intent`
     - `trade.execution`
     - `market.data`
     - `system.error`
2. **Metrics**
   - Prometheus exporters inside FastAPI:
     - `okx_orders_total{status}` — count successes/failures.
     - `okx_order_latency_seconds_bucket` — histogram per order type.
     - `scheduler_evaluations_total{result}` — success/skip/failure.
     - `portfolio_drawdown_pct` gauge.
   - Retain existing simulator metrics for comparison dashboards.
3. **Dashboards**
   - Grafana board “Autotrade OKX Demo” with panels:
     - Evaluation throughput + success rate.
     - OKX API latency + error codes.
     - Portfolio equity curve vs. PnL breakdown.
     - LLM confidence vs. realized PnL scatter plot (ties back to Phase 7 data even if deferred).
4. **Alerting**
   - PagerDuty/Slack alerts wired via Prometheus Alertmanager:
     - `okx_orders_total{status="failed"} > 3 in 5m`
     - `scheduler_evaluations_total{result="failure"} > 2 in 10m`
     - `portfolio_drawdown_pct > 0.07` for awareness (manual action required).
   - Include runbook links to restart services or switch runtime mode.

#### Failover Tests
- **Broker fallback drill**: simulate OKX outage. Implemented via `scripts/failover_drill.py`, which triggers the workflow, detects failures, and automatically flips runtime mode to `simulator`. Verified with `tests/test_failover_drill.py`.
- **WebSocket drop**: kill WS connection and ensure reconnection logic re-subscribes within 5s; verify portfolio updates resume.
- **Database outage**: disable Postgres briefly; confirm scheduler queues pending evaluations and resumes without data loss once DB returns.

#### Example Test Case (pytest)
```python
@pytest.mark.asyncio
async def test_okx_demo_order_lifecycle(okx_mock_server, broker_settings):
    broker = OKXDemoBroker(**broker_settings, base_url=okx_mock_server.url)
    order = await broker.place_order("BTC-USDT-SWAP", "buy", "market", Decimal("0.01"))
    assert order.status == "filled"
    positions = await broker.get_positions()
    assert any(p.symbol == "BTC-USDT-SWAP" for p in positions)
    cancel = await broker.cancel_order("BTC-USDT-SWAP", order.id)
    assert cancel.success is True
```

With Phase 8 complete, the team will have reproducible CI coverage, observability into real-time operations, and confidence that OKX demo trading behaves like production before moving toward live trading.

### Phase 9: Documentation
- [ ] Document OKX API setup process
- [ ] Create configuration guide
- [ ] Write troubleshooting guide
- [ ] Document rate limits and constraints
- [ ] Add code examples and usage patterns
- [ ] Create runbook for common issues

### Phase 10: Live Trading Preparation (Future)
- [ ] Security audit of API credentials handling
- [ ] Add live trading confirmation workflows
- [ ] Implement additional safety checks
- [ ] Create kill switch mechanism
- [ ] Add multi-signature approval for live trades
- [ ] Document live trading procedures

---

## Technical Architecture

### Current Auto-Trading System Structure (UNCHANGED)
```
python-auto-trade/src/autotrade_service/
├── main.py                      # FastAPI app with portfolio endpoint
├── scheduler.py                 # Evaluation cycle orchestration
├── config.py                    # Settings and configuration
├── repositories.py              # Database operations
├── pipelines/
│   ├── decision_pipeline.py     # LLM decision orchestration
│   ├── market_pipeline.py       # Market data ingestion
│   └── tick_compactor.py        # OHLCV aggregation
├── llm/
│   ├── prompt_builder.py        # Prompt engineering
│   └── deepseek_client.py       # LLM API client
├── feedback/
│   └── feedback_engine.py       # Learning from trades
├── simulation/
│   ├── broker.py                # SimulatedBroker (existing)
│   └── manager.py               # Portfolio snapshot builder
└── models.py                    # Data models
```

### NEW: OKX Integration Layer (ADDED)
```
python-auto-trade/src/autotrade_service/
├── brokers/                     # ◄── NEW DIRECTORY
│   ├── __init__.py
│   ├── base.py                  # BaseBroker interface (extracted)
│   ├── factory.py               # Broker factory for selection
│   ├── simulated.py             # Refactored SimulatedBroker
│   └── okx_demo.py              # OKXDemoBroker implementation
└── exchanges/                   # ◄── NEW DIRECTORY
    ├── __init__.py
    └── okx/
        ├── __init__.py
        ├── client.py            # OKX REST API client
        ├── websocket.py         # OKX WebSocket client
        ├── models.py            # OKX-specific data models
        ├── auth.py              # Authentication & signing
        ├── enums.py             # Order types, sides, etc.
        └── exceptions.py        # OKX-specific exceptions
```

### Integration Points with Existing System

#### 1. Scheduler Integration (scheduler.py)
```python
# BEFORE: Hard-coded SimulatedBroker
from autotrade_service.simulation.broker import SimulatedBroker

broker = SimulatedBroker(...)

# AFTER: Broker factory with config selection
from autotrade_service.brokers.factory import create_broker

broker = create_broker(settings.trading_broker_type)  # 'simulated' or 'okx_demo'
```

#### 2. Market Data Integration (decision_pipeline.py)
```python
# EXISTING: Uses tool results for market data
market_data = self._extract_market_data(tool_messages)

# ENHANCED: Can use OKX WebSocket for real-time data
if settings.use_okx_market_data:
    market_data = await self.okx_client.get_ticker(symbol)
else:
    # Use existing tool-based market data
    market_data = self._extract_market_data(tool_messages)
```

#### 3. Portfolio Snapshot (manager.py)
```python
# EXISTING: build_snapshot() from SimulatedBroker
def build_snapshot(broker: SimulatedBroker) -> AutoTradePortfolioSnapshot:
    positions = broker.get_positions()
    ...

# UPDATED: Works with any broker implementing BaseBroker
def build_snapshot(broker: BaseBroker) -> AutoTradePortfolioSnapshot:
    positions = await broker.get_positions()  # Works for both brokers
    ...
```

#### 4. Feedback Loop Integration (feedback_engine.py)
```python
# EXISTING: Learns from trade outcomes
recent_trades = await self._fetch_recent_trades()

# UNCHANGED: Works with OKX trades automatically
# Trades from OKX are stored in same format
# Feedback loop processes them identically
```

### Configuration Schema
```yaml
# config/trading.yaml
trading:
  # Broker selection: determines which execution layer to use
  broker_type: "okx_demo"  # Options: simulated, okx_demo, okx_live
  
  # Keep existing decision pipeline settings
  evaluation_interval_minutes: 5
  max_position_size_pct: 50
  confidence_threshold: 0.6
  
  # Keep existing LLM settings
  llm:
    provider: "deepseek"
    model: "deepseek-chat"
    temperature: 0.7
  
  # Keep existing risk management
  risk:
    max_leverage: 10
    daily_loss_cap: 1000
    drawdown_pause_pct: 5
    
okx:
  demo:
    api_key: "${OKX_DEMO_API_KEY}"
    secret_key: "${OKX_DEMO_SECRET_KEY}"
    passphrase: "${OKX_DEMO_PASSPHRASE}"
    base_url: "https://www.okx.com"
    ws_public_url: "wss://ws.okx.com:8443/ws/v5/public"
    ws_private_url: "wss://ws.okx.com:8443/ws/v5/private"
    
  settings:
    rate_limit_per_second: 20
    max_retries: 3
    timeout_seconds: 10
```

---

## Key Integration: Broker Factory Pattern

### Base Broker Interface (Extracted from existing code)
```python
# autotrade_service/brokers/base.py
from abc import ABC, abstractmethod
from typing import List, Optional
from decimal import Decimal
from enum import Enum

class OrderSide(Enum):
    BUY = "buy"
    SELL = "sell"

class OrderType(Enum):
    MARKET = "market"
    LIMIT = "limit"

class BaseBroker(ABC):
    """
    Abstract broker interface.
    Both SimulatedBroker and OKXDemoBroker implement this.
    """
    
    @abstractmethod
    async def place_order(
        self,
        symbol: str,
        side: OrderSide,
        order_type: OrderType,
        quantity: Decimal,
        price: Optional[Decimal] = None,
        **kwargs
    ) -> Order:
        """Place an order. Returns Order with order_id."""
        pass
    
    @abstractmethod
    async def cancel_order(self, symbol: str, order_id: str) -> bool:
        """Cancel an order. Returns True if successful."""
        pass
    
    @abstractmethod
    async def get_positions(self) -> List[Position]:
        """Get all current positions."""
        pass
    
    @abstractmethod
    async def get_balance(self) -> Decimal:
        """Get available balance."""
        pass
    
    @abstractmethod
    async def close_position(self, symbol: str) -> Order:
        """Close entire position for symbol."""
        pass
    
    @abstractmethod
    async def get_market_price(self, symbol: str) -> Decimal:
        """Get current market price."""
        pass

### Broker Factory
```python
# autotrade_service/brokers/factory.py
from .base import BaseBroker
from .simulated import SimulatedBroker
from .okx_demo import OKXDemoBroker
from ..config import Settings

def create_broker(settings: Settings) -> BaseBroker:
    """
    Factory to create broker based on configuration.
    Allows seamless switching between simulated and OKX.
    """
    broker_type = settings.trading_broker_type
    
    if broker_type == "simulated":
        return SimulatedBroker(
            initial_balance=settings.initial_balance,
            symbols=settings.trading_symbols
        )
    
    elif broker_type == "okx_demo":
        return OKXDemoBroker(
            api_key=settings.okx_demo_api_key,
            secret_key=settings.okx_demo_secret_key,
            passphrase=settings.okx_demo_passphrase,
            base_url=settings.okx_demo_base_url
        )
    
    elif broker_type == "okx_live":
        # Future: live trading
        raise NotImplementedError("Live trading not yet enabled")
    
    else:
        raise ValueError(f"Unknown broker type: {broker_type}")
```

### Scheduler Integration (MINIMAL CHANGES)
```python
# autotrade_service/scheduler.py (UPDATED)

# BEFORE:
from .simulation.broker import SimulatedBroker
self.broker = SimulatedBroker(...)

# AFTER:
from .brokers.factory import create_broker
self.broker = create_broker(self.settings)

# Everything else remains the same!
# The scheduler doesn't know or care which broker is used
```

---

## API Integration Details

### 1. Authentication
OKX requires HMAC-SHA256 signing of requests:

```python
# autotrade_service/exchanges/okx/auth.py
import hmac
import base64
from datetime import datetime, timezone

class OKXAuth:
    def __init__(self, api_key: str, secret_key: str, passphrase: str):
        self.api_key = api_key
        self.secret_key = secret_key
        self.passphrase = passphrase
    
    def generate_signature(
        self, 
        timestamp: str, 
        method: str, 
        request_path: str, 
        body: str = ""
    ) -> str:
        """Generate HMAC-SHA256 signature for OKX API request."""
        message = timestamp + method + request_path + body
        mac = hmac.new(
            bytes(self.secret_key, encoding='utf8'),
            bytes(message, encoding='utf-8'),
            digestmod='sha256'
        )
        return base64.b64encode(mac.digest()).decode()
    
    def get_headers(self, method: str, request_path: str, body: str = "") -> dict:
        """Generate authentication headers for OKX API request."""
        timestamp = datetime.now(timezone.utc).isoformat(timespec='milliseconds')[:-6] + 'Z'
        signature = self.generate_signature(timestamp, method, request_path, body)
        
        return {
            'OK-ACCESS-KEY': self.api_key,
            'OK-ACCESS-SIGN': signature,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': self.passphrase,
            'Content-Type': 'application/json'
        }
```

### 2. REST API Client
```python
# autotrade_service/exchanges/okx/client.py
import aiohttp
import asyncio
from typing import Dict, List, Optional, Any
from .auth import OKXAuth
from .models import *
from .exceptions import OKXAPIException

class OKXRestClient:
    def __init__(
        self, 
        api_key: str, 
        secret_key: str, 
        passphrase: str,
        base_url: str = "https://www.okx.com",
        demo_mode: bool = True
    ):
        self.base_url = base_url
        self.demo_mode = demo_mode
        self.auth = OKXAuth(api_key, secret_key, passphrase)
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def _request(
        self, 
        method: str, 
        endpoint: str, 
        params: Optional[Dict] = None,
        data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Make authenticated request to OKX API."""
        if self.session is None:
            self.session = aiohttp.ClientSession()
        
        url = f"{self.base_url}{endpoint}"
        body = json.dumps(data) if data else ""
        headers = self.auth.get_headers(method, endpoint, body)
        
        if self.demo_mode:
            headers['x-simulated-trading'] = '1'
        
        async with self.session.request(
            method, url, headers=headers, params=params, data=body
        ) as response:
            result = await response.json()
            
            if result.get('code') != '0':
                raise OKXAPIException(
                    code=result.get('code'),
                    message=result.get('msg', 'Unknown error')
                )
            
            return result.get('data', [])
    
    # Market Data
    async def get_ticker(self, inst_id: str) -> Dict[str, Any]:
        """Get ticker data for instrument."""
        endpoint = "/api/v5/market/ticker"
        params = {"instId": inst_id}
        data = await self._request("GET", endpoint, params=params)
        return data[0] if data else {}
    
    async def get_candlesticks(
        self, 
        inst_id: str, 
        bar: str = "1H",
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get candlestick data."""
        endpoint = "/api/v5/market/candles"
        params = {
            "instId": inst_id,
            "bar": bar,
            "limit": str(limit)
        }
        return await self._request("GET", endpoint, params=params)
    
    async def get_funding_rate(self, inst_id: str) -> Dict[str, Any]:
        """Get current funding rate."""
        endpoint = "/api/v5/public/funding-rate"
        params = {"instId": inst_id}
        data = await self._request("GET", endpoint, params=params)
        return data[0] if data else {}
    
    # Trading Operations
    async def place_order(
        self,
        inst_id: str,
        side: str,  # "buy" or "sell"
        order_type: str,  # "market", "limit", etc.
        size: str,
        price: Optional[str] = None,
        reduce_only: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """Place an order."""
        endpoint = "/api/v5/trade/order"
        data = {
            "instId": inst_id,
            "tdMode": "cross",  # Trade mode: cross margin
            "side": side,
            "ordType": order_type,
            "sz": size,
        }
        
        if price:
            data["px"] = price
        
        if reduce_only:
            data["reduceOnly"] = "true"
        
        data.update(kwargs)
        
        result = await self._request("POST", endpoint, data=data)
        return result[0] if result else {}
    
    async def cancel_order(self, inst_id: str, order_id: str) -> Dict[str, Any]:
        """Cancel an order."""
        endpoint = "/api/v5/trade/cancel-order"
        data = {
            "instId": inst_id,
            "ordId": order_id
        }
        result = await self._request("POST", endpoint, data=data)
        return result[0] if result else {}
    
    # Account Information
    async def get_account_balance(self) -> List[Dict[str, Any]]:
        """Get account balance."""
        endpoint = "/api/v5/account/balance"
        return await self._request("GET", endpoint)
    
    async def get_positions(self, inst_type: str = "SWAP") -> List[Dict[str, Any]]:
        """Get current positions."""
        endpoint = "/api/v5/account/positions"
        params = {"instType": inst_type}
        return await self._request("GET", endpoint, params=params)
    
    async def get_order_history(
        self, 
        inst_type: str = "SWAP",
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get order history."""
        endpoint = "/api/v5/trade/orders-history"
        params = {
            "instType": inst_type,
            "limit": str(limit)
        }
        return await self._request("GET", endpoint, params=params)
    
    async def close(self):
        """Close the HTTP session."""
        if self.session:
            await self.session.close()
            self.session = None
```

### 3. WebSocket Client
```python
# autotrade_service/exchanges/okx/websocket.py
import json
import asyncio
import websockets
from typing import Callable, Dict, Any, Optional
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

class OKXWebSocket:
    def __init__(
        self,
        ws_url: str,
        auth: Optional[OKXAuth] = None,
        demo_mode: bool = True
    ):
        self.ws_url = ws_url
        self.auth = auth
        self.demo_mode = demo_mode
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.subscriptions: Dict[str, Callable] = {}
        self._running = False
    
    async def connect(self):
        """Connect to OKX WebSocket."""
        headers = {}
        if self.demo_mode:
            headers['x-simulated-trading'] = '1'
        
        self.ws = await websockets.connect(self.ws_url, extra_headers=headers)
        self._running = True
        
        # Authenticate if private endpoint
        if self.auth:
            await self._authenticate()
        
        # Start message handler
        asyncio.create_task(self._handle_messages())
    
    async def _authenticate(self):
        """Authenticate WebSocket connection."""
        timestamp = str(int(datetime.now(timezone.utc).timestamp()))
        signature = self.auth.generate_signature(timestamp, "GET", "/users/self/verify", "")
        
        auth_msg = {
            "op": "login",
            "args": [{
                "apiKey": self.auth.api_key,
                "passphrase": self.auth.passphrase,
                "timestamp": timestamp,
                "sign": signature
            }]
        }
        
        await self.ws.send(json.dumps(auth_msg))
    
    async def subscribe(self, channel: str, inst_id: str, callback: Callable):
        """Subscribe to a channel."""
        sub_key = f"{channel}:{inst_id}"
        self.subscriptions[sub_key] = callback
        
        sub_msg = {
            "op": "subscribe",
            "args": [{
                "channel": channel,
                "instId": inst_id
            }]
        }
        
        await self.ws.send(json.dumps(sub_msg))
        logger.info(f"Subscribed to {channel} for {inst_id}")
    
    async def _handle_messages(self):
        """Handle incoming WebSocket messages."""
        try:
            async for message in self.ws:
                data = json.loads(message)
                
                # Handle subscription confirmation
                if data.get('event') == 'subscribe':
                    logger.info(f"Subscription confirmed: {data}")
                    continue
                
                # Handle data updates
                if 'data' in data:
                    channel = data.get('arg', {}).get('channel')
                    inst_id = data.get('arg', {}).get('instId')
                    sub_key = f"{channel}:{inst_id}"
                    
                    if sub_key in self.subscriptions:
                        callback = self.subscriptions[sub_key]
                        await callback(data['data'])
        
        except websockets.exceptions.ConnectionClosed:
            logger.warning("WebSocket connection closed")
            if self._running:
                await self._reconnect()
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
    
    async def _reconnect(self):
        """Reconnect to WebSocket."""
        logger.info("Attempting to reconnect...")
        await asyncio.sleep(5)
        await self.connect()
        
        # Re-subscribe to channels
        for sub_key, callback in list(self.subscriptions.items()):
            channel, inst_id = sub_key.split(':', 1)
            await self.subscribe(channel, inst_id, callback)
    
    async def close(self):
        """Close WebSocket connection."""
        self._running = False
        if self.ws:
            await self.ws.close()
```

### 4. Broker Implementation
```python
# autotrade_service/brokers/okx_demo.py
from typing import Dict, List, Optional
from decimal import Decimal
from ..exchanges.okx.client import OKXRestClient
from ..exchanges.okx.websocket import OKXWebSocket
from .base import BaseBroker, Position, Order, OrderSide, OrderType

class OKXDemoBroker(BaseBroker):
    """
    OKX demo trading broker implementation.
    Implements BaseBroker interface - drop-in replacement for SimulatedBroker.
    Used by existing scheduler and decision pipeline without modification.
    """
    
    def __init__(self, api_key: str, secret_key: str, passphrase: str, base_url: str):
        self.client = OKXRestClient(
            api_key=api_key,
            secret_key=secret_key,
            passphrase=passphrase,
            base_url=base_url,
            demo_mode=True
        )
        self.ws = OKXWebSocket(
            ws_url=f"{base_url.replace('https', 'wss')}/ws/v5/public",
            demo_mode=True
        )
        self.positions_cache: Dict[str, Position] = {}
        self.balance = Decimal('0')
    
    async def initialize(self):
        """Initialize broker connection."""
        await self.ws.connect()
        await self._sync_account_state()
    
    async def _sync_account_state(self):
        """Sync account balance and positions from OKX."""
        # Get balance
        balance_data = await self.client.get_account_balance()
        if balance_data:
            details = balance_data[0].get('details', [])
            for detail in details:
                if detail['ccy'] == 'USDT':
                    self.balance = Decimal(detail['availBal'])
        
        # Get positions
        positions_data = await self.client.get_positions()
        self.positions_cache.clear()
        
        for pos_data in positions_data:
            position = self._parse_position(pos_data)
            self.positions_cache[position.symbol] = position
    
    def _parse_position(self, data: Dict) -> Position:
        """Parse OKX position data to internal Position model."""
        return Position(
            symbol=data['instId'],
            quantity=Decimal(data['pos']),
            entry_price=Decimal(data['avgPx']),
            mark_price=Decimal(data['markPx']),
            unrealized_pnl=Decimal(data['upl']),
            leverage=int(data.get('lever', 1))
        )
    
    # Implement BaseBroker interface methods
    # These are called by existing scheduler and decision pipeline
    
    async def place_order(
        self,
        symbol: str,
        side: OrderSide,
        order_type: OrderType,
        quantity: Decimal,
        price: Optional[Decimal] = None,
        **kwargs
    ) -> Order:
        """
        Place order on OKX demo exchange.
        Called by scheduler after LLM makes decision.
        """
        result = await self.client.place_order(
            inst_id=symbol,
            side=side.value,
            order_type=order_type.value,
            size=str(quantity),
            price=str(price) if price else None,
            **kwargs
        )
        
        return Order(
            order_id=result['ordId'],
            symbol=symbol,
            side=side,
            order_type=order_type,
            quantity=quantity,
            price=price,
            status=result['sCode']
        )
    
    async def cancel_order(self, symbol: str, order_id: str) -> bool:
        """Cancel an order."""
        result = await self.client.cancel_order(symbol, order_id)
        return result.get('sCode') == '0'
    
    async def get_positions(self) -> List[Position]:
        """
        Get current positions.
        Called by SimulationManager to build portfolio snapshot.
        """
        await self._sync_account_state()
        return list(self.positions_cache.values())
    
    async def get_balance(self) -> Decimal:
        """
        Get available balance.
        Called by risk checks and portfolio snapshot.
        """
        await self._sync_account_state()
        return self.balance
    
    async def close_position(self, symbol: str) -> Order:
        """
        Close entire position.
        Called when LLM decides to exit position.
        """
        position = self.positions_cache.get(symbol)
        if not position:
            raise ValueError(f"No position found for {symbol}")
        
        # Determine close side (opposite of position)
        close_side = OrderSide.SELL if position.quantity > 0 else OrderSide.BUY
        
        return await self.place_order(
            symbol=symbol,
            side=close_side,
            order_type=OrderType.MARKET,
            quantity=abs(position.quantity),
            reduce_only=True
        )
    
    async def get_market_price(self, symbol: str) -> Decimal:
        """
        Get current market price.
        Called by various components for pricing.
        """
        ticker = await self.client.get_ticker(symbol)
        return Decimal(ticker['last'])
    
    async def close(self):
        """Close broker connections."""
        await self.client.close()
        await self.ws.close()
```

---

## Real-World Usage Flow

### Complete Evaluation Cycle with OKX Integration

```python
# autotrade_service/scheduler.py (with minimal modifications)

class AutoTradeScheduler:
    def __init__(self, settings: Settings):
        self.settings = settings
        
        # NEW: Use factory instead of hard-coded SimulatedBroker
        self.broker = create_broker(settings)  # ◄── Only change needed!
        
        # Existing components remain unchanged
        self.decision_pipeline = DecisionPipeline(settings)
        self.prompt_builder = PromptBuilder(settings)
        self.feedback_engine = FeedbackEngine(settings)
        self.simulation_manager = SimulationManager()
    
    async def run_evaluation(self):
        """
        Run one evaluation cycle.
        This method remains COMPLETELY UNCHANGED!
        """
        logger.info("Starting evaluation cycle")
        
        # 1. Get current portfolio state (works with any broker)
        positions = await self.broker.get_positions()
        balance = await self.broker.get_balance()
        
        # 2. Fetch market data (existing logic)
        market_data = await self.market_pipeline.fetch_data()
        
        # 3. Build prompt with current state (unchanged)
        prompt = self.prompt_builder.build_prompt(
            positions=positions,
            balance=balance,
            market_data=market_data
        )
        
        # 4. Get LLM decision (unchanged)
        decisions = await self.decision_pipeline.get_decisions(prompt)
        
        # 5. Apply risk checks (unchanged)
        validated_decisions = self._validate_decisions(decisions)
        
        # 6. Execute decisions through broker (works with any broker!)
        for decision in validated_decisions:
            if decision.action == "buy":
                await self.broker.place_order(
                    symbol=decision.symbol,
                    side=OrderSide.BUY,
                    order_type=OrderType.MARKET,
                    quantity=decision.quantity
                )
            elif decision.action == "sell":
                await self.broker.close_position(decision.symbol)
        
        # 7. Update feedback loop (unchanged)
        await self.feedback_engine.record_decisions(decisions)
        
        # 8. Build portfolio snapshot (works with any broker!)
        snapshot = self.simulation_manager.build_snapshot(self.broker)
        
        logger.info(f"Evaluation complete. Equity: ${snapshot.equity}")
```

**Key Point**: The scheduler doesn't know whether it's using `SimulatedBroker` or `OKXDemoBroker`. It just calls the `BaseBroker` interface methods!

---

## Configuration & Environment Setup

### Environment Variables
```bash
# .env.demo
OKX_DEMO_API_KEY=your-demo-api-key
OKX_DEMO_SECRET_KEY=your-demo-secret-key
OKX_DEMO_PASSPHRASE=your-demo-passphrase

# Broker selection
TRADING_BROKER=okx_demo  # Options: simulated, okx_demo, okx_live
```

### OKX Demo Account Setup
1. Visit [OKX Demo Trading](https://www.okx.com/demo-trading)
2. Create demo account (no KYC required)
3. Generate API credentials:
   - Go to Profile → API Management
   - Create new API key for demo trading
   - Save API key, secret key, and passphrase securely
4. Set permissions: Trading, Reading
5. Whitelist IP addresses (optional for demo)

---

## Testing Strategy

### Unit Tests
```python
# tests/test_okx_client.py
import pytest
from autotrade_service.exchanges.okx.client import OKXRestClient

@pytest.mark.asyncio
async def test_get_ticker():
    client = OKXRestClient(
        api_key="test_key",
        secret_key="test_secret",
        passphrase="test_pass",
        demo_mode=True
    )
    
    ticker = await client.get_ticker("BTC-USDT-SWAP")
    assert 'last' in ticker
    assert float(ticker['last']) > 0
    
    await client.close()

@pytest.mark.asyncio
async def test_place_order():
    client = OKXRestClient(...)
    
    order = await client.place_order(
        inst_id="BTC-USDT-SWAP",
        side="buy",
        order_type="limit",
        size="0.01",
        price="50000"
    )
    
    assert 'ordId' in order
    assert order['sCode'] == '0'
    
    await client.close()
```

### Integration Tests
```python
# tests/integration/test_okx_broker.py
import pytest
from autotrade_service.brokers.okx_broker import OKXDemoBroker

@pytest.mark.asyncio
async def test_full_trading_workflow():
    config = {
        'api_key': os.getenv('OKX_DEMO_API_KEY'),
        'secret_key': os.getenv('OKX_DEMO_SECRET_KEY'),
        'passphrase': os.getenv('OKX_DEMO_PASSPHRASE'),
        'ws_public_url': 'wss://ws.okx.com:8443/ws/v5/public'
    }
    
    broker = OKXDemoBroker(config)
    await broker.initialize()
    
    # Check balance
    balance = await broker.get_balance()
    assert balance > 0
    
    # Place order
    order = await broker.place_order(
        symbol="BTC-USDT-SWAP",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal("0.01")
    )
    assert order.order_id
    
    # Wait for fill
    await asyncio.sleep(2)
    
    # Check position
    positions = await broker.get_positions()
    assert len(positions) > 0
    
    # Close position
    close_order = await broker.close_position("BTC-USDT-SWAP")
    assert close_order.order_id
    
    await broker.close()
```

---

## Migration Path

### From Simulated to OKX Demo

**Zero Code Changes Required in:**
- ✅ `decision_pipeline.py` - LLM decision logic
- ✅ `prompt_builder.py` - Prompt engineering
- ✅ `feedback_engine.py` - Learning from trades
- ✅ `simulation/manager.py` - Portfolio snapshot building
- ✅ Risk management logic
- ✅ API endpoints (`main.py`)

**Minimal Changes Required in:**
- ⚠️ `scheduler.py` - Change 2 lines (broker initialization)
- ⚠️ `config.py` - Add OKX configuration

**Steps:**
1. Set environment variables:
   ```bash
   export TRADING_BROKER=okx_demo
   export OKX_DEMO_API_KEY=your-key
   export OKX_DEMO_SECRET_KEY=your-secret
   export OKX_DEMO_PASSPHRASE=your-passphrase
   ```

2. Update `scheduler.py`:
   ```python
   # Line 50: Change from
   from autotrade_service.simulation.broker import SimulatedBroker
   self.broker = SimulatedBroker(...)
   
   # To
   from autotrade_service.brokers.factory import create_broker
   self.broker = create_broker(self.settings)
   ```

3. Restart auto-trading service:
   ```bash
   PYTHONPATH=src uvicorn autotrade_service.main:app --reload
   ```

4. **That's it!** LLM decisions now execute on OKX demo exchange

### Switching Back to Simulated
```bash
export TRADING_BROKER=simulated
# Restart service - no code changes needed
```

### From OKX Demo to OKX Live (Future)
1. Complete thorough testing in demo environment
2. Obtain live API credentials with proper security
3. Implement additional safety checks
4. Update configuration: `TRADING_BROKER=okx_live`
5. Start with minimal position sizes
6. Gradually increase exposure
7. Monitor closely for first 24-48 hours

---

## Risk Considerations

### API Rate Limits
- Public endpoints: 20 requests/2s
- Private endpoints: 60 requests/2s
- WebSocket: 1 connection per account
- Implement exponential backoff on rate limit errors

### Error Handling
- Network failures: Retry with backoff
- API errors: Log and alert
- Position sync failures: Reconcile manually
- WebSocket disconnects: Auto-reconnect
- Order failures: Don't retry market orders automatically

### Monitoring
- Track API response times
- Monitor error rates
- Alert on connection failures
- Track order fill rates
- Monitor slippage vs. expectations

---

## Success Metrics

### Technical Metrics
- API uptime > 99.5%
- Average API latency < 200ms
- Order fill rate > 95%
- Position sync accuracy: 100%
- WebSocket uptime > 99%

### Trading Metrics
- Demo P&L tracking
- Sharpe ratio calculation
- Maximum drawdown monitoring
- Win rate and profit factor
- Execution quality (slippage)

---

## Resources

### OKX Documentation
- [API Documentation](https://www.okx.com/docs-v5/en/)
- [Demo Trading Guide](https://www.okx.com/demo-trading)
- [WebSocket API](https://www.okx.com/docs-v5/en/#websocket-api)
- [Rate Limits](https://www.okx.com/docs-v5/en/#overview-rate-limit)

### Related Documents
- `auto-trading-api-contract.md` - API specifications
- `auto-trading-build-roadmap.md` - Development timeline
- `auto-trading-ops-runbook.md` - Operations guide
- `okx-derivatives-data-integration.md` - Data integration details

---

## Timeline Estimate

| Phase | Duration | Priority |
|-------|----------|----------|
| Phase 1: API Client Setup | 3-5 days | High |
| Phase 2: Market Data | 2-3 days | High |
| Phase 3: Trading Operations | 3-4 days | High |
| Phase 4: Broker Abstraction | 2-3 days | Medium |
| Phase 5: Pipeline Integration | 3-4 days | High |
| Phase 6: Portfolio Management | 2-3 days | High |
| Phase 7: Risk Management | 3-4 days | High |
| Phase 8: Testing & Monitoring | 4-5 days | High |
| Phase 9: Documentation | 2-3 days | Medium |
| **Total** | **24-34 days** | |

---

## Next Steps

1. **Immediate**: Create OKX demo account and obtain API credentials
2. **Week 1**: Implement OKX API client and authentication
3. **Week 2**: Integrate market data and WebSocket feeds
4. **Week 3**: Implement trading operations and broker layer
5. **Week 4**: Testing, monitoring, and documentation

---

## Appendix: Code Examples

### Example: Simple Trading Bot
```python
# This is NOT needed - just for illustration
# Your existing scheduler already does this!

async def example_evaluation_cycle():
    """
    This shows what happens in one evaluation cycle.
    The scheduler already does this - no new code needed.
    """
    
    # Broker is created by factory based on config
    broker = create_broker(settings)  # Returns SimulatedBroker or OKXDemoBroker
    
    # Everything else is unchanged from current system
    
    # 1. Build prompt (existing PromptBuilder)
    prompt = prompt_builder.build_prompt(...)
    
    # 2. Get LLM decision (existing DecisionPipeline)
    decisions = await decision_pipeline.get_decisions(prompt)
    # DeepSeek returns: action="buy", symbol="BTC-USDT-SWAP", size=0.01, confidence=0.75
    
    # 3. Execute through broker (broker is OKX or simulated - doesn't matter!)
    for decision in decisions:
        if decision.action == "buy" and decision.confidence > 0.6:
            order = await broker.place_order(
                symbol=decision.symbol,
                side=OrderSide.BUY,
                order_type=OrderType.MARKET,
                quantity=decision.size
            )
            # If broker is OKXDemoBroker, this executes on OKX
            # If broker is SimulatedBroker, this executes in-memory
    
    # 4. Build snapshot (existing SimulationManager)
    snapshot = simulation_manager.build_snapshot(broker)
    
    # 5. Learn from results (existing FeedbackEngine)
    await feedback_engine.record_decisions(decisions)
```

### Real Integration Example
```python
# autotrade_service/scheduler.py
# This is the ACTUAL integration point - only 2 lines change!

class AutoTradeScheduler:
    def __init__(self, settings: Settings):
        # BEFORE (old code):
        # from .simulation.broker import SimulatedBroker
        # self.broker = SimulatedBroker(initial_balance=20000)
        
        # AFTER (new code):
        from .brokers.factory import create_broker
        self.broker = create_broker(settings)  # ◄── NEW LINE
        
        # Everything else stays exactly the same
        self.decision_pipeline = DecisionPipeline(settings)
        self.prompt_builder = PromptBuilder(settings)
        self.feedback_engine = FeedbackEngine(settings)
        self.simulation_manager = SimulationManager()
        self.market_pipeline = MarketPipeline(settings)
    
    async def run_evaluation(self):
        """
        This method needs ZERO changes!
        It works with both SimulatedBroker and OKXDemoBroker.
        """
        # Existing code - no modifications needed
        positions = await self.broker.get_positions()
        balance = await self.broker.get_balance()
        
        market_data = await self.market_pipeline.fetch_data()
        
        prompt = self.prompt_builder.build_prompt(
            positions=positions,
            balance=balance,
            market_data=market_data
        )
        
        decisions = await self.decision_pipeline.get_decisions(prompt)
        
        for decision in validated_decisions:
            if decision.action == "buy":
                await self.broker.place_order(...)  # Works with any broker!
            elif decision.action == "close":
                await self.broker.close_position(...)  # Works with any broker!
        
        snapshot = self.simulation_manager.build_snapshot(self.broker)
        await self.feedback_engine.record_decisions(decisions)
```

---

**Document Status**: Draft  
**Last Updated**: November 6, 2025  
**Owner**: Auto-Trading Team  
**Reviewers**: TBD

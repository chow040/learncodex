# Simulation Execution Blueprint

## Overview
- Goal: let the LLM evaluate and manage a live-looking book without sending trades to a real exchange.
- Approach: insert a simulated broker between the decision pipeline and portfolio repository, using cached market data for fills and PnL.

## Components
- **State Store**
  - `SimulatedPortfolio` dataclass (cash, equity, positions, trade log).
  - Each position holds quantity, entry/current prices, risk metrics, exit plan fields (stop_loss, take_profit, invalidation_condition).
  - Persistence via JSON/SQLite helpers (`load_state`, `save_state`) so sessions survive restarts.

- **Broker Facade (`SimulatedBroker`)**
  - `execute(decisions, market_snapshots)`: processes BUY/SELL/HOLD/CLOSE.
    - BUY/SELL: fill at latest mid-price, enforce `max_slippage_bps`, adjust cash and positions.
    - CLOSE: close matching position, realise PnL.
    - HOLD: refresh exit plan/confidence values.
  - `mark_to_market()`: refresh position pricing from latest tool cache and recompute equity/unrealised PnL.
  - Maintains trade ledger entries (timestamp, symbol, action, price, size, realised PnL).

- **Stop / TP / Invalidation Handling**
  - Each cycle compare current price to stops/targets; auto-close when breached.
  - Parse simple invalidation rules (e.g., “close below 4000 on 3-minute candle”) using recent bars; log phrases that cannot be parsed.

- **Integration Points**
  - Modify `fetch_latest_portfolio()` to return the simulated snapshot if available, otherwise fall back to the DB state.
  - After `DecisionPipeline.run_once()` completes, pass decisions plus the same tool-cache market payload to `SimulatedBroker.execute()` before persisting state.
  - Ensure the portfolio snapshot reuses the schema expected by `PromptBuilder` so the LLM sees identical fields to production.

- **Driver Loop**
  - Add `scripts/run_simulation.py`:
    1. Initialise simulated state (seed cash, symbols).
    2. Await `DecisionPipeline.run_once()` on a configurable cadence.
    3. Invoke broker execution and mark-to-market.
    4. Persist state + append summary log (equity, positions, trades).
  - Provide CLI flags for interval, initial capital, slippage model, and symbol list.

- **Reporting**
  - Periodically dump CSV/JSON snapshots (equity curve, open positions, closed trades).
  - Optional: lightweight API endpoint (`/simulation/portfolio`) or CLI command for quick inspection.

- **Testing Strategy**
  - Unit tests for broker fills, stop-loss enforcement, and cash/equity math using canned market candles.
  - Integration test to verify a decision run updates the simulated portfolio and is reflected in the subsequent LLM prompt.
  - Regression test covering restart/resume by loading persisted state.

## Next Steps
1. Scaffold the `autotrade_service/simulation/` package with state, broker, and persistence modules.
2. Update `repositories.fetch_latest_portfolio()` to read from the simulator when enabled (feature flag).
3. Implement the async driver script and add documentation on how to run a paper session.

## Implementation Checklist
- [ ] Define `SimulatedPortfolio` data model and persistence helpers.
- [ ] Implement `SimulatedBroker` with execute/mark-to-market logic.
- [ ] Support stop-loss, take-profit, and invalidation triggers.
- [ ] Wire simulated state into `fetch_latest_portfolio()` behind a feature flag.
- [ ] Create driver script for recurring simulation runs.
- [ ] Add reporting/logging for equity, trades, and position state.
- [ ] Write unit tests for broker math and stop handling.
- [ ] Write integration test covering decision-to-portfolio feedback loop.

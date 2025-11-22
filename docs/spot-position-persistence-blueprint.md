# Spot Position Persistence & Execution Failure Handling

## Context
- The auto-trade service now routes LLM BUY/SELL decisions to the OKX spot venue (e.g. BTC-USD).
- OKX spot APIs do not expose rich position metadata (entry price, exit plan, rationale).
- The portfolio dashboard expects the same structured data the simulated broker persisted locally.
- OKX orders can fail (insufficient balance, compliance block, network errors) and currently only log the error.

## Objectives
1. Persist spot position entries locally once an OKX order succeeds so the UI can render full details.
2. Emit actionable feedback when execution fails (option 4) without pausing automation: surface a banner/warning and allow the operator to retry.

## Proposed Design

### 1. Persist spot positions in DB
- Extend the broker (`OKXDemoBroker.execute`) to call a new helper after OKX confirms a BUY:
  - `persist_position_entry(decision, fill_price, quantity)` writes to `portfolio_positions` (or a new `spot_positions` table) including:
    - symbol, quantity, entry_price (fill price), leverage (per decision), rationale, stop/target, decision_id for traceability.
  - `fetch_latest_portfolio()` continues to read from the DB to build the dashboard snapshot (no longer depends on `fetch_positions()`).
- On SELL/CLOSE success:
  - Move the entry to `portfolio_closed_positions` (or equivalent) with realized PnL and exit reason, then delete/mark the open record.
- Optional reconciliation: periodically compare OKX balances with local positions to detect drift, but not required for the primary path.

### 2. Execution failure handling (option 4)
- When OKX rejects an order:
  - Capture the `sMsg`/error code (e.g. `51008 insufficient balance`) and attach it to the decision log.
  - Add a new DB table or event stream (`autotrade_events`) entry `execution_failed` with details.
  - Surface the latest failure in the API response so the frontend can show a banner (e.g. “BTC buy failed: insufficient balance. Top up USDT and retry.”).
  - Provide a CTA (via `/scheduler/trigger` or a dedicated endpoint) to retry the run once the operator resolves the issue.
- Do NOT pause automation automatically; the next scheduler run continues, but the operator has clear visibility into the failure.

### API/UI adjustments
- `/internal/autotrade/v1/portfolio` includes a `latestExecutionError` field when present.
- Dashboard banner displays the error and a “Retry execution” button (invokes `/scheduler/trigger`).
- Decision log shows execution status badge (“failed”, “succeeded”).

## Implementation Checklist
- [ ] Create persistence helpers for open/closed spot positions.
- [ ] Update `OKXDemoBroker` to invoke persistence after successful fills.
- [ ] Modify `fetch_latest_portfolio` to build positions from local storage.
- [ ] Add execution failure event logging + API exposure.
- [ ] Update frontend to consume `latestExecutionError` and show warning/cta.

Once these pieces land, the dashboard reflects spot positions reliably, and failed executions are actionable without halting automation.

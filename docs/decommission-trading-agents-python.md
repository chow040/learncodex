## Decommission Legacy TradingAgents Endpoint

> Objective: Retire the `/api/trading/decision` route and Python HTTP runner now that the LangGraph orchestrator is stable, leaving `/api/trading/decision/internal` (or its successor) as the single trading orchestration path.

### Phase 0 – Readiness
- [x] Confirm `/api/trading/decision/internal` is feature-complete: aligns with expected response schema, logging, timeouts, metrics.
- [x] Inventory all consumers (frontend, scripts, integrations) that still call `/api/trading/decision`.
- [x] Snapshot current logs/metrics for both routes to baseline post-cutover behaviour.

### Phase 1 – Code Cleanup
- [x] Remove legacy imports/usages:
  - Delete `requestTradingAgentsDecision` export and references.
  - Drop the `/api/trading/decision` Express handler in `tradingRoutes.ts`.
  - Remove the Python runner service layer (`tradingAgentsService.ts`) and any env/config only used for the HTTP bridge.
- [x] Drop the legacy `TradingOrchestrator` fallback:
  - Simplify `tradingAgentsEngineService.ts` to call the LangGraph workflow directly.
  - Delete the legacy agent classes under `src/taEngine/agents/**` and associated state agents/tests once the fallback path is gone.
  - Remove feature flags/env vars that toggled the legacy path (`TRADING_AGENTS_ENGINE_MODE`, `USE_LANGCHAIN_ANALYSTS`, etc.).
- [x] Clean up `.env` placeholders (`TA_SERVER_URL`, Python paths) and documentation that mentions the Python service.
- [x] Delete unused scripts/assets in `backend/python/` once no other tooling depends on them.

### Phase 2 – Frontend & Client Changes
- [ ] Switch any remaining UI/API clients to call the new endpoint (or updated unified route).
- [x] Update frontend feature flags and environment variables (e.g., remove `VITE_TA_USE_INTERNAL` if redundant).
- [ ] Regenerate API typings or mocks if applicable.

### Phase 3 – Verification
- [ ] Run automated test suite (backend + frontend) focused on trading flows.
- [ ] Conduct manual smoke tests: trigger Trading Agents report, check logs (`logs/`, `eval_results/`) for correct entries, inspect error handling.
- [ ] Monitor runtime metrics post-removal; ensure no consumer still issues requests to the removed route (404 monitoring).

### Phase 4 – Documentation & Rollout
- [ ] Update README / docs to reflect single-orchestrator architecture.
- [ ] Communicate deployment checklist: configuration changes, restart requirements, rollback plan.
- [ ] Tag release / change management notes referencing the decommission.

### Dependencies / Risks
- Ensure no external automation relies on the Python runner (double-check cron jobs, notebooks, partner integrations).
- Validate logging parity: Python logs vs LangGraph logs may have different structure—document any intentional deviations.
- Keep a short-term rollback branch to reintroduce legacy code if critical regression discovered.

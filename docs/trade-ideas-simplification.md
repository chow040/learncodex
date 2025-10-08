# Trade Ideas Simplification & Debate Progress

## Latest Enhancements (2025-10-07)

- **Timeframe Quick Select:** Replaced the free-text field with three toggleable pills (`1 Hours`, `4 Hours`, `1 Day`). Tap once to set the timeframe, tap again to clear it.
- **Live Debate Progress:** Chart debates now run asynchronously. The frontend polls job status and visualises each milestone (Trader analysis, Risk review, Referee merge) while the conversation unfolds.
- **Job-Based API:** `POST /api/trading/trade-ideas/:id/chart-debate` responds immediately with `{ jobId }`. Clients poll `GET /api/trading/trade-ideas/chart-debate/jobs/:jobId` for progress, errors, and the final debate payload.
- **Configurable Logging:** New env vars `TA_LOG_DIR` and `CHART_DEBATE_LOG_DIR` let each environment control where TradingAgents and chart debate logs are written.

## Streamlined Workflow

1. Upload a chart image (drag & drop or click).
2. Optionally select a timeframe pill.
3. Watch the debate progress list update as Trader ↔ Risk Manager ↔ Referee steps complete.
4. Review the referee consensus, Signal Strength score, and capture a screenshot if needed.

## Key Technical Changes

### Frontend (`src/pages/TradeIdeas.tsx`)
- Added timeframe pill buttons, debate job polling, and progress UI.
- Wrapped chart debate requests in a job flow (start → poll → render).
- Preserved screenshot/share actions and Signal Strength rendering.

### Backend
- `chartDebateService.ts`: emits progress events and still logs full conversations.
- `chartDebateJobService.ts`: lightweight in-memory job tracker with auto-expiry.
- `tradingRoutes.ts`: new status endpoint (`GET /trade-ideas/chart-debate/jobs/:jobId`) and async job kickoff.
- Env config (`env.ts`, `.env.example`): added logging directory overrides and chart debate defaults.

## Operational Notes

- Debate jobs expire after 30 minutes to prevent stale memory usage.
- Logs respect `TA_LOG_DIR` (TradingAgents) and `CHART_DEBATE_LOG_DIR` (chart debates).
- Existing single-shot chart analysis route remains unchanged for non-debate workflows.

The Trade Ideas experience now keeps users engaged with real-time debate progress while preserving the concise analysis and Signal Strength scoring that were already in place.

# Trading Agents – Background Runs Blueprint

Enable traders to launch an assessment, browse other modules, and return later to see live progress or the final verdict—without losing the run.

---

## Goals
- Allow `/api/trading/decision/internal` runs to continue after the user navigates away.
- Surface progress/state anywhere in the app (dashboard badge, header pill, notification tray).
- Guarantee that reconnecting to a run replays progress events and delivers the final decision.
- Persist final output so a hard refresh still retrieves the result.

---

## Current Capabilities (Baseline)
- **Run kickoff** → `POST /api/trading/decision/internal` returns `{ runId, ...decision? }`.
- **Progress stream** → `GET /api/trading/decision/internal/events/:runId` (SSE) streams progress, completion, errors.
  - Implemented by `tradingProgressService.ts` with an in-memory event buffer.
  - `useTradingProgress(runId)` hook wraps EventSource and exposes reducer state.
- **Persistence** → `insertTaDecision` writes final decision to Postgres (`ta_decisions` table).
- **History API** → `GET /api/trading/assessments/:runId` fetches persisted decision details.

We already have durability and replay; the missing pieces are cross-page listeners and UX surfacing.

---

## Architecture Blueprint

### 1. Global Progress Store (Frontend)
- Create a `ProgressProvider` (React context) that:
  - Holds an in-memory map: `runId -> { status, percent, currentStage, result, startedAt, lastEvent }`.
  - Uses the existing `useTradingProgress` hook under the hood but scoped per run.
  - Persists `activeRunIds` to `localStorage` so refreshes restore subscriptions.
  - Publishes updates via context to any component (badge, banner, command palette).

### 2. Launch Workflow
1. User submits ticker → `TradingAgents` page calls `POST /api/trading/decision/internal`.
2. Store the returned `runId` in:
   - context (`ProgressProvider.startTracking(runId)`),
   - optional `?runId=` query parameter for deep-linking,
   - localStorage `tradingAgents.activeRuns[]`.
3. The provider spins up an EventSource (via `useTradingProgress`) and caches progress.
4. `TradingAgents` page renders directly from provider state; no tight coupling to `useTradingProgress`.

### 3. Navigate Away & Return
- Leaving the page does **not** clear provider state.
- On mount, `TradingAgents` asks provider: `getRun(runIdFromURL || provider.latestRunId)`.
- If `status === 'complete'`, render the cached `result`. Otherwise show live progress.
- Optionally show a floating banner on other pages (e.g., `TradeIdeas`, dashboard) when there is an in-flight run.

### 4. Stopping Runs
- “Cancel” button stays local: abort the HTTP request, close EventSource, remove from provider/localStorage.
- Backend run continues unless we add explicit cancellation support in future (out of scope here).

### 5. Crash / Hard Refresh Recovery
- On load, provider reads `localStorage.activeRuns`.
- For each `runId`, re‑subscribe via EventSource:
  - `tradingProgressService` replays buffered events, so state reconstructs.
- If SSE endpoint returns 404 (run expired), fallback to `GET /api/trading/assessments/:runId`.
- If assessment exists → mark as `complete`, cache result, remove from `activeRuns`.
- If not found → treat as failed and drop.

### 6. Notifications (Optional Enhancements)
- Trigger toast/banner on completion with CTA “View result”.
- Allow background desktop notifications when tab unfocused.
- Provide quick actions in header (a dropdown list of active/recent runs).

### 7. API Considerations
- SSE endpoint already idempotent; no changes needed.
- Ensure `publishCompletion` fires both for success and errors (already done).
- Consider extending payload with `startedAt` timestamp so UI can show elapsed time (present via `ProgressEvent.timestamp` + metadata).
- For long-lived runs, consider server-side eviction strategy (currently in-memory Map; acceptable if traffic low).

---

## Implementation Checklist

### Frontend
- [x] Create `contexts/ProgressContext.tsx` (provider + hook) — currently tracks a single active run.
- [x] Refactor `TradingAgents.tsx` to consume context instead of calling `useTradingProgress` directly.
- [x] Persist active run IDs in `localStorage` (`tradingAgents.activeRuns_v1`) — stored as single active run record; multi-run list still TODO.
- [x] On provider mount, rehydrate IDs and call `subscribe(runId)` — limited to single run.
- [ ] Add optional global banner component (`components/nav/ActiveRunBanner.tsx`).
- [ ] Expose helper `useActiveRuns()` hook for other pages.

### Backend (optional touch-ups)
- [ ] Include `startedAt` & `executionMs` in SSE payload (progress metadata already carries `timestamp`; ensure `runStartedAt` set in metadata—done in `decisionWorkflow`).
- [ ] Document run retention (how long `tradingProgressService` keeps events; consider TTL).
- [ ] Add `/api/trading/assessments/:runId` to Postman collection / API docs.

### QA
- [ ] Launch run, navigate Home → banner shows status, return to page → progress preserved.
- [ ] Hard refresh mid-run → state restored, SSE continues.
- [ ] Complete run, refresh → provider loads from DB and shows final result instantly.
- [ ] Cancel run removes it from banner and localStorage.

---

## Risks & Mitigations
- **Memory leak**: Many active runs could expand provider state → limit tracked runs (e.g., max 5), drop oldest completed.
- **Stale data**: If EventSource closes unexpectedly, provider should retry or fall back to REST fetch.
- **Concurrent runs**: Ensure provider supports multiple runIds; UI needs a selector when more than one in flight.
- **Unauthenticated access**: Maintain existing `ProtectedRoute`; provider should stop tracking on logout.

---

## Future Enhancements
- Integrate with notification center/toast system for cross-page alerts.
- Add ability to initiate runs from the dashboard and deep-link into Trading Agents with preselected run.
- Expose run history summary in provider so other modules (e.g., Equity Insight) can reference latest verdicts.
- Support explicit cancellation (`DELETE /api/trading/decision/internal/:runId`) if we introduce job queue.

---

By layering a global progress context over the existing SSE/webhook infrastructure, we can decouple the Trading Agents UI from the run lifecycle, delivering a background-friendly experience without touching the LangGraph pipeline.***

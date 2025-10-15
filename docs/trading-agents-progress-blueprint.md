## Trading Agents Progress Indicator Blueprint

Objective: Surface real-time progress for the Trading Agents manually-triggered workflow so users can see LangGraph stages advance while the backend executes.

### 1. Experience Goals
- Replace the current “Run Trading Agents” spinner with a staged progress UI (progress bar + step list) that reflects each major phase of the LangGraph workflow.
- Provide meaningful status messages (e.g., “Gathering analysts”, “Investment debate”, “Risk review”) so users understand where the run currently sits.
- Maintain parity with existing behavior on completion: final decision data populates once the workflow ends; errors surface clearly.
- Ensure the UI gracefully handles slow/long-running cases without freezing or locking the page.

### 2. Architecture Overview
- **Event source**: Introduce a streaming channel from backend to frontend.
  - Preferred: Server-Sent Events (SSE) endpoint (`/api/trading/decision/events`) keyed by run id.
  - Alternative: WebSocket channel if SSE not feasible; fall back to polling as last resort.
- **Progress publisher**: Augment LangGraph execution to emit structured events before/after key nodes:
  ```ts
  publishProgress({ runId, stage: 'analysts', label: 'Analysts', percent: 25 })
  ```
- **Client consumption**: Frontend opens stream when `Run` button is pressed, updates a reducer with incoming events, and closes on completion/cancel/error.
- **Synchronization**: Progress stream can start immediately; final REST response still provides the decision payload. Use run ids to correlate.

### 3. Backend Enhancements
- Add a UUID `runId` when `runTradingAgentsInternal` is invoked.
- Build `ProgressEmitter` utility (wrapping Node `EventEmitter` or Redis pub/sub for multi-instance) to broadcast stage events.
- Wire into LangGraph nodes:
  - Analysts start/finish
  - Debate loop iterations
  - Manager/trader/risk nodes
  - Finalization
- Create SSE route:
  ```ts
  router.get('/decision/events/:runId', sseHandler);
  ```
  - Stream `event: progress` messages with JSON data.
  - Emit `event: complete` or `event: error` at end.
- Update existing POST `/decision/internal` to:
  1. Issue `runId`
  2. Kick off workflow (async)
  3. Return `{ runId }` immediately or await final result (if needed for current flow)
- Ensure proper cleanup: remove listeners once complete, handle disconnects.

### 4. Frontend Updates
- Extend `runTradingAgents` action to:
  1. Request run (receive `runId`).
  2. Open SSE stream `/api/trading/decision/events/${runId}` via `EventSource`.
  3. Update local `progressState` (current stage, percent, message).
  4. Resolve final decision when `complete` event arrives (or fallback to existing fetch).
- Build `TradingProgress` component:
  - shadcn `Progress` bar reflecting percent.
  - Step list with active stage highlight.
  - Optional stage icon/label and subtext from event payload.
- Handle errors:
  - If stream errors, show toast + revert to spinner fallback.
  - Allow user to cancel (closing stream and aborting backend if supported).

### 5. Event Contract
```json
{
  "runId": "uuid",
  "stage": "analysts|debate|manager|trader|risk|complete",
  "label": "Analyst synthesis",
  "percent": 45,
  "message": "Gathering analyst updates"
}
```
- Percent optional; frontend can map stage order to implied percent when missing.
- Include `iteration` for loops (e.g., debate rounds) if helpful.

### 6. Edge Cases
- **Multiple runs**: Disable button or queue runs; ensure new run cancels previous progress display.
- **Timeouts**: Backend emits `error` stage; frontend resets state.
- **Browser refresh**: Without persistent store, progress resets; consider storing latest run id in session storage if long durations expected.

### 7. Checklist
- [ ] Define canonical stage order + labels with product team.
- [ ] Implement backend `ProgressEmitter` and SSE endpoint.
- [ ] Hook LangGraph nodes to emit stage events.
- [ ] Update POST handler to supply `runId` and coordinate SSE lifecycle.
- [ ] Create `useTradingProgress` hook to manage EventSource connection + reducer.
- [ ] Build `TradingProgress` UI component (progress bar, stage list, status text).
- [ ] Integrate component into Trading Agents card, replacing spinner.
- [ ] Add error handling (stream disconnect, backend error) with toasts/fallback.
- [ ] Write unit tests for reducer + stage mapping; integration test SSE stream.
- [ ] QA long-running manual run, cancel/retry scenarios, and ensure final decision still renders correctly.

### 8. Future Enhancements
- Persist progress history for analytics.
- Show estimated time per stage based on prior runs.
- Allow multi-user view (e.g., live progress for collaborators) via shared channel.

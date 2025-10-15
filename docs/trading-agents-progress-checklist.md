## Trading Agents Progress Indicator Checklist

### Backend
- [x] Add `runId` generation + propagation for manual Trading Agents runs.
- [x] Implement `ProgressEmitter` (in-memory or Redis-backed) to broadcast stage updates.
- [x] Hook LangGraph nodes to emit `progress` events before/after key stages (analysts, debates, manager, trader, risk, finalize).
- [x] Create SSE endpoint `/api/trading/decision/events/:runId` streaming progress + completion/error events.
- [x] Update `/api/trading/decision/internal` to return or include `runId` and ensure events are cleaned up after completion.
- [x] Add graceful handling for SSE disconnects (unsubscribe, timeout).

### Frontend
- [x] Build `useTradingProgress(runId)` hook wrapping `EventSource`, reducer, and cleanup.
- [x] Create `TradingProgress` UI component (progress bar + stage list + status text), leverage on shadcn component.
- [x] Update Trading Agents card to show progress component while `status === "running"`.
- [x] Extend action handler to start stream after `runId` is received; handle completion + error transitions.
- [x] Provide fallback/toasts on stream errors and allow manual cancel.

### Testing & QA
- [ ] Unit test progress reducer and hook behavior for stage events, completion, errors.
- [ ] Integration test SSE endpoint (mock LangGraph run) to verify events flow to client.
- [ ] Manual QA long-running run, retrigger while running, and cancel scenarios.
- [ ] Verify final decision still renders correctly post-progress and no memory leaks (EventSource closed).

### Documentation & Launch
- [ ] Document event contract, stage definitions, and backend configuration.
- [ ] Update developer onboarding with SSE requirements (reverse proxies, timeouts).
- [ ] Feature flag the progress UI; monitor initial rollout for streaming issues.

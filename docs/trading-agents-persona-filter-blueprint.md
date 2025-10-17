# Trading Agents Persona Filter Blueprint

## Objective
Align the Trading Agents backend with the persona configuration selected in the command center. Today the workflow always executes the full analyst cohort (fundamental, market, news, social) even when the user disables personas. We need to gate LangGraph nodes, SSE progress, and persistence so a “market only” run truly limits itself to market agents.

## Scope
- Honor the `analysts` array that ships from the frontend by skipping unused personas in the LangGraph orchestrator.
- Ensure downstream artifacts (payload, history records, progress events, logs) only reference personas that actually executed.
- Maintain backwards compatibility when no analysts are provided (default to the full set).

## Goals
- Respect persona selection for a run, including debate loops and tool calls.
- Return consistent analyst metadata to the UI (progress stream, final decision payload, history endpoints).
- Keep history filters accurate (only the enabled personas persisted).

## Non-Goals
- Rewriting agent prompts or tooling.
- Changing persona definitions or adding/removing analysts.
- Adjusting UI copy beyond what is required to reflect the new behaviour.

## Current State
- `TradingAgents.tsx` posts the selected analysts to `/api/trading/decision/internal` and exposes the list in SSE progress.
- `tradingAgentsEngineService` forwards the analysts to `runDecisionGraph`, but the workflow still instantiates every persona.
- LangGraph nodes (`analystsNode`, `bullNode`, `bearNode`, etc.) do not inspect the `enabledAnalysts` metadata.
- Persisted decisions store the full cohort regardless of selection.
- History view displays the stored analysts array but warns that filtering is informational.

## Proposal
1. **Metadata Plumbing**
   - Ensure `enabledAnalysts` is propagated through LangGraph state metadata.
   - Attach the filtered list to SSE progress updates and final payload post-processing.
2. **Workflow Gating**
   - Wrap each persona node invocation in a guard that checks `enabledAnalysts`.
   - Short-circuit debate loops when the paired personas are disabled.
   - Default to the full cohort when the array is empty or undefined.
3. **Output Normalisation**
   - Remove unused persona sections from the final decision payload (e.g., omit `fundamentalsReport` when the fundamental analyst is disabled).
   - Persist only the executed analysts in `ta_runs` / `ta_decisions`.
4. **Frontend Feedback**
   - Update `TradingAgents` to drop the “informational” warning once backend support lands.
   - Optionally surface inline hints (e.g., disabled personas are greyed out in history rows).

## Implementation Checklist
### Backend
- [ ] Extend LangGraph state annotations to carry `enabledAnalysts`.
- [ ] Update analyst nodes to no-op when their persona is not enabled.
- [ ] Skip investment/risk debates if the required personas are disabled.
- [x] Adjust final payload shaping to omit unused reports.
- [ ] Persist filtered analysts list in `insertTaDecision`.
- [ ] Add tests covering single-analyst, dual-analyst, and full-cohort runs.

### Frontend
- [ ] Remove “informational” disclaimer once backend ships.
- [ ] Highlight custom cohorts in the history table (already partially implemented).
- [ ] Add regression test or story showing persona-specific output (optional).

### QA
- [ ] Manual run: market-only, verify absence of fundamental/news/social output in UI, payload, and history.
- [ ] Manual run: fundamental + social, confirm debate stages skip market/news.
- [ ] Confirm SSE progress stream only emits enabled personas.
- [ ] History detail view shows the filtered analyst list and payload sections.
- [ ] Regression: full cohort behaves exactly as before.

## Risks & Mitigations
- **State Divergence**: Skipping nodes may leave downstream state references undefined. Mitigate by initialising role outputs to `null` and guarding access.
- **SSE Expectations**: Consumers might assume fixed stage ordering. Document any skipped stages and consider emitting stub progress events marked as “skipped.”
- **Testing Complexity**: Persona combinations grow quickly. Focus tests on representative subsets (single/paired/full).

## Open Questions
- Should we show explicit “skipped persona” indicators in progress/event logs?
- Do we need to retain empty payload keys for disabled personas to preserve API compatibility?
- Are there analytics dashboards that assume all four personas run every time? If so, coordinate updates.

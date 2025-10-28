# Trading Agents History Analyst Display Blueprint

## Objective
Enhance the Trading Agents history detail experience to surface the four analyst assessments (Fundamental, News, Social, Market) captured during each run so operators can audit and compare reasoning without replaying the workflow.

## Scope
- Backend REST payloads returned by history endpoints.
- Frontend history detail view (`TradingAgentsHistoryDetail`) and related hooks/types.
- Optional persistence migrations if legacy records do not store per-analyst text.
- Excludes modifying real-time progress UX or adding new analyst personas.

## Current State
- `GET /api/trading/assessments/:runId` returns decision metadata and a combined narrative but omits individual analyst sections.
- `TradingAssessmentsService` and `taDecisionRepository` store raw JSON payloads that include analyst responses under nested fields (verified in run logs), yet they are not extracted.
- `useTradingAssessmentDetail` exposes `decisionSummary`, risk arguments, and prompts, but the UI only shows the overall decision plus risk persona debate.
- History screen layout has space for additional panels but currently renders a single markdown block.

## Desired UX
- Add a “Analyst Assessments” card on the history detail page with four clearly labeled sections: `Fundamental Analyst`, `News Analyst`, `Social Analyst`, `Market Analyst`.
- Each section shows the AI-generated assessment in markdown (with copy action) and lightweight metadata (confidence score if available).
- Handle legacy runs gracefully: display “Not captured” copy if the field is missing.
- Maintain responsive layout: stack cards vertically on mobile, two-column grid on desktop.

## Architecture Impact
```
backend/src/
├─ services/tradingAssessmentsService.ts     // normalize analyst fields
├─ routes/tradingRoutes.ts                   // extend history payload
└─ taEngine/langgraph/decisionWorkflow.ts    // confirm persistence writes four analyst outputs

frontend/src/
├─ hooks/useTradingAssessmentDetail.ts       // extend query shape
├─ types/tradingAgents.ts                    // add analyst assessment types
└─ pages/TradingAgentsHistoryDetail.tsx      // render analyst cards
```

## Implementation Phases & Tasks

### Phase 1 — Data Modeling
- [x] Confirm persistence schema: locate analyst outputs within stored decision payload (`taDecisionRepository.ts`, `TradingAssessmentsService`).
- [x] Define TypeScript interfaces (backend) for `AnalystAssessment` with fields `{ role: 'fundamental' | 'news' | 'social' | 'market'; content: string; confidence?: number; updatedAt?: string }`.
- [x] Update service layer to extract assessments from stored JSON, normalize missing fields to `null`, and return alongside existing history DTOs.
- [ ] Adjust OpenAPI/API docs if present to describe the new fields.

### Phase 2 — API & Persistence Changes
- [x] Extend `getTradingAssessmentByRunId` (service + repository) to include `analystAssessments: AnalystAssessment[]`.
- [ ] Add optional migration or backfill script if historical records lack structured analyst payloads; otherwise document fallback behavior.
- [x] Update unit tests in `backend/src/services/__tests__/` to assert the new fields are populated.
- [ ] Validate feature flag or versioning requirements; ensure older clients continue to function (fields should be additive).

### Phase 3 — Frontend Data Layer
- [x] Update shared types in `equity-insight-react/src/types/tradingAgents.ts` to include `analystAssessments`.
- [x] Modify `useTradingAssessmentDetail.ts` to map the new response into a memoized structure keyed by analyst role for easy consumption.
- [x] Provide default placeholders for missing assessments so the UI remains predictable.

### Phase 4 — UI Integration
- [x] Implement analyst assessment card UI (inline component) with copy action support.
- [x] In `TradingAgentsHistoryDetail.tsx`, render a four-card grid using the hook data; collapse to single column below breakpoint.
- [x] Add empty-state messaging when assessments are missing.
- [x] Ensure markdown rendering uses existing safe renderer (e.g., `MarkdownViewer`).
- [x] Wire analytics/event logging if product requires tracking of card views or copy actions.

### Phase 5 — QA & Documentation
- [ ] Write backend integration tests hitting `/api/trading/assessments/:runId` to verify analyst fields appear.
- [ ] Add frontend tests (React Testing Library or Storybook stories) covering populated and empty states.
- [ ] Update release notes / internal docs highlighting the new analyst visibility.
- [ ] Coordinate with support/ops for any data backfill before feature flag enablement.

## Validation Checklist
- [x] History API returns four analyst assessments for new runs; legacy runs gracefully degrade.
- [x] Frontend displays the assessments with correct labeling and respects responsive layout.
- [x] Copy-to-clipboard (if added) works and logs telemetry.
- [x] No breaking changes to existing history consumers; CI and lint pass.

## Open Questions
- Do we expose analyst confidence scores or raw model metadata? If yes, confirm availability in stored payload.
- Should users be able to toggle markdown/code view or download the full analyst outputs?
- Is there a requirement to show timestamps or persona model versions per analyst?

## Rollout
- Behind frontend feature flag `SHOW_ANALYST_HISTORY_DETAIL` (or reuse existing history flag) to allow phased enablement.
- Deploy backend changes first, monitor payload size/performance, then ship frontend toggle in staging before production rollout.

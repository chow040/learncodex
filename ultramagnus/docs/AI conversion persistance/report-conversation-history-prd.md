# Report Conversation History PRD

## Purpose & Context
- Persist chat context shown alongside a saved report card so users can revisit prior follow-up Q&A.
- Control storage cost on Supabase/Postgres by capping, summarizing, and pruning old turns.
- Keep the visible transcript fast to load and scoped to the owning user.

## Goals
1. Capture chat turns for a report session with minimal overhead.
2. Let users reopen a report and see recent exchanges plus a summary of earlier context.
3. Bound storage via per-report limits, retention, and automated summarization.

## Non-Goals
- Full long-term archival of every token; cold storage is optional and deferred.
- Cross-report/shared chat threads.
- Advanced search/semantic retrieval over chat history in v1.

## User Stories
- As a user, when I reopen a saved report, I can read the last N exchanges with Ultramagnus AI.
- As a user, I see a concise summary of older context so I understand the conversation without loading everything.
- As a user, my chat history is private to me and linked to the report it belongs to.

## Scope (v1)
- Store chat turns per report card session in Postgres.
- Keep only the most recent messages (e.g., last 20) plus an auto-generated summary of older context.
- Enforce per-report byte/row caps and a retention window (e.g., 90 days) with cleanup jobs.
- No cold storage offload in v1; design a pointer for future offload if needed.

## Functional Requirements
- Persist turns: `role`, `content`, `tokensEstimate`, `createdAt`, `sessionId`, `reportId`, `userId`.
- Read: `GET /api/reports/:id/chat` returns recent turns plus the current summary if requester is owner.
- Append: `POST /api/reports/:id/chat` accepts a new user or assistant message; enforces caps.
- Summarize: Background job (or on-threshold) creates/updates a summary blob once turns exceed `N` or `X KB`, replacing older turns with the summary.
- Retention: Delete chats older than the retention window per plan; keep a summary of the retained portion.
- Limits: Reject messages that would exceed the per-report byte cap with a clear error; truncate assistant responses server-side if oversized.

## Non-Functional Requirements
- Performance: Chat fetch p95 <400ms for recent turns; summary generation off the critical path.
- Storage: Cap per-report chat storage (e.g., 200–300 KB) and per-message length; store as text/jsonb.
- Security: Ownership check on all chat endpoints; no cross-user access.
- Observability: Metrics for rejected messages, summaries created, bytes stored per report.

## Data Model (proposed)
- `conversation_sessions`: `id (uuid pk)`, `reportId fk`, `userId`, `model`, `createdAt`, `tokenEstimate`, `status`.
- `conversation_messages`: `id (uuid pk)`, `sessionId fk`, `reportId fk`, `userId`, `role (user|assistant|system)`, `content text`, `tokensEstimate int`, `createdAt`; indexes on `reportId`, `sessionId`, `createdAt`.
- `conversation_summaries`: `id (uuid pk)`, `reportId fk`, `sessionId fk nullable`, `summary text`, `updatedAt`, `coverageUpTo (message createdAt)`, `tokensEstimate`.

## API/Integration Contracts
- `GET /api/reports/:id/chat?limit=` → `{ summary?, messages: [...] }` (recent first or last; default last 20).
- `POST /api/reports/:id/chat` body `{ role, content }` → persists message, returns updated recent window; enforces limits.
- Summarization job can be a worker route or cron: input `reportId`, `thresholdMessages`, `thresholdBytes`.
- Frontend: when opening a saved report, fetch chat; render summary above the recent transcript; show truncation notice if clipped.

## Cost & Retention Controls
- Per-message max length (e.g., 4–6 KB) and per-report cap (e.g., 200–300 KB).
- Retention window (e.g., 90 days) with periodic purge; configurable by plan.
- Summarize after `N` turns (e.g., 20) or `X KB` (e.g., 50 KB) and drop older turns once summarized.
- No embeddings stored; only text plus summary. Consider gzip on cold storage if/when added.

## Risks & Mitigations
- Storage creep: hard caps plus purge job; observability on bytes per report.
- Slow fetches: index `reportId/createdAt`; return only the recent window; keep summary small.
- Data leakage: strict ownership checks; never trust client userId; validate report ownership matches chat records.
- Summarization drift: include `coverageUpTo` and refresh summary when coverage changes; keep the last few raw turns to anchor.

## Rollout
- Gate behind a feature flag per environment.
- Start with small caps and a manual summarization job; adjust thresholds after measuring usage.
- Add smoke tests: save/fetch chat, cap enforcement, unauthorized access blocked, summarization replaces older turns.

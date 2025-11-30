# Saved Reports & Bookmarks PRD

## Purpose & Context
- Persist full report content server-side so users can reopen saved analyses and bookmarks from any device.
- Replace local/demo library with per-user, authorized data backed by the database.
- Ensure bookmarks resolve to stored reports (or fetchable references) with clear fallbacks for stale or unauthorized items.

## Goals
1. Save complete report payloads to the database with ownership and timestamps.
2. Allow users to reopen saved/bookmarked reports from the dashboard/library/bookmark list, loading the stored content without re-running analysis.
3. Support bookmark CRUD tied to stored reports; handle stale/unauthorized targets gracefully.
4. Keep data scoped to the authenticated user (or shared ACL) and available across sessions/devices.

## Non-Goals
- Multi-user collaboration/sharing flows beyond basic ownership (future).
- Offline mode or local-only drafts.
- Report editing within the dashboard (open the report view instead).

## User Stories
- As a user, I can save a generated report and reopen it later with the same content.
- As a user, when I click a bookmarked report, it opens immediately using stored data; if unavailable, I see a clear error and a retry/regenerate option.
- As a user, my saved reports and bookmarks follow me across devices after login.
- As a user, removing a bookmark does not delete the report; deleting a report removes it from bookmarks/library.
- As a user, I only see reports I own (or that are explicitly shared with me).

## Scope (v1)
- Persist full report JSON (verbatim model output plus metadata) in the backend DB.
- Endpoints: save report, get report by id, list my reports (with pagination), bookmark add/remove, list my bookmarks, dashboard aggregation updates.
- Dashboard/library/bookmark clicks open stored reports; no duplicate in-page dashboard UIs.
- Handle stale/unauthorized items with inline toasts/errors and optional regenerate CTA.
- Minimal sharing: ownership only; no cross-user sharing UI in v1.

## Functional Requirements
- Save: On analysis completion, POST full report payload to backend; store `reportId`, `ownerId`, `ticker`, `title`, `status`, `type`, `createdAt`, `updatedAt`, `payload`.
- Fetch: `GET /api/reports/:id` returns stored report if requester is owner; 403 otherwise.
- List: `GET /api/reports?mine=true&page=&pageSize=&sort=&status=` returns summaries (id, title, ticker, status, updatedAt).
- Bookmarks: `POST /api/bookmarks` with `targetId` (reportId) creates a bookmark for the user; `DELETE /api/bookmarks/:id` removes it; listing bookmarks resolves report summaries.
- Dashboard integration: Dashboard uses personalized payload backed by DB reports/bookmarks; clicking entries opens stored reports.
- Error handling: 404 for missing/stale report; 403 for unauthorized; frontend shows toast and offers regenerate if relevant.
- Data limits: Cap payload size per report (e.g., 1–2 MB); reject oversize with clear error.
- Retention: Keep reports until user deletes; bookmarks removal does not delete report.
- Auth/session: Access tokens are short-lived (~1h) with refresh tokens (~7d) and silent refresh; session must remain valid for save/fetch/bookmark actions.

## Non-Functional Requirements
- Security: Enforce ownership/ACL on every read/write; never return another user’s data.
- Performance: Report fetch p95 <500ms from cache/DB; list endpoints paginated (default 20).
- Reliability: Graceful degradation—bookmark list should skip missing items and surface error.
- Storage: Store full payload as JSONB; index by `ownerId`, `updatedAt`, `ticker`.

## Data Model (proposed)
- Reports table: `id (uuid pk)`, `ownerId (fk users)`, `title`, `ticker`, `status`, `type`, `payload (jsonb)`, `createdAt`, `updatedAt`; indexes (`ownerId`, `updatedAt`), (`ownerId`, `ticker`).
- Bookmarks table: `id (uuid pk)`, `userId`, `targetId (reportId fk)`, `targetType='report'`, `pinned bool`, `createdAt`, `updatedAt`; index (`userId`, `updatedAt`).
- Activity (optional here): log `view`/`open` as `ActivityEvent` with `occurredAt`.

## API/Integration Contracts (v1)
- `POST /api/reports` body `{ title, ticker, status, type, payload }` → `{ reportId }`.
- `GET /api/reports/:id` → stored report (403 if not owner).
- `GET /api/reports?mine=true&page=&pageSize=&status=&sort=` → paginated summaries.
- `POST /api/bookmarks` `{ targetId, targetType='report', pinned? }` → bookmark.
- `DELETE /api/bookmarks/:id`.
- Dashboard continues to call `/api/dashboard` which now resolves reports/bookmarks from DB.

## UX Notes
- Library/Bookmarks open stored reports immediately; show skeleton while fetching.
- On 404/403, display inline error + CTA to regenerate (if analysis is allowed) or close.
- Bookmarks indicate pinned state; removal confirmation optional.
- Preserve existing dashboard layout; no duplicate dashboard surfaces.

## Risks & Mitigations
- Large payloads: enforce size limits; compress if needed.
- Stale bookmarks: handle missing targets gracefully; offer cleanup.
- Data leakage: strict server-side ownership checks; never trust client userId.
- Migration risk: backfill existing local/demo library with a one-time import or reset on first save.

## Rollout
- Start behind a feature flag; seed a few demo reports for test accounts.
- Migrate dashboard to use server-backed lists before removing local/demo data.
- Add smoke tests: save/fetch report, bookmark add/remove, unauthorized access blocked, dashboard opens stored report.

# Saved Reports Tech Spec

Reference PRD: `docs/Save report card/saved-reports-prd.md`

## Scope & Objectives
- Persist full report payloads (model output + metadata) per user so reports reopen without regenerating.
- Wire save + reopen flows across dashboard, library, and bookmark entry points; handle stale/unauthorized items with inline errors.
- Replace local/demo storage with DB-backed reports/bookmarks while keeping latency <500ms p95 for fetch.
- Enforce ownership ACL at every endpoint; cap payload size (~1.5 MB) with clear rejection messaging.

## Architecture Overview
- **Frontend (moonshot)**: React 19 (Vite). Add save/reopen hooks and UI states in the report experience and reuse existing dashboard/bookmark surfaces; use API client module for report/bookmark CRUD.
- **Backend (backend)**: Express + TypeScript + Drizzle ORM. Routes in `src/routes/reports.ts` and `src/routes/bookmarks.ts`; services under `src/services/reportService.ts` and `src/services/bookmarkService.ts`; shared validation in `src/utils/validators.ts`.
- **Auth**: Supabase/JWT middleware injects `userId`; all queries scoped by server-side `userId` + optional feature flag for rollout.
- **Activity/analytics**: Emit activity events on open/save/bookmark to `activities` table/service; frontend fires analytics hook for CTA usage.

## Data Model & Storage
- **reports** (existing): `id uuid pk`, `ownerId uuid`, `title text`, `ticker text`, `status text`, `type text`, `payload jsonb`, `createdAt timestamptz`, `updatedAt timestamptz`; indexes (`owner_id`, `updated_at`), (`owner_id`, `ticker`). Enforce row-level ACL via `ownerId` filter; validate payload size (~1.5 MB max).
- **bookmarks** (existing): `id uuid pk`, `userId uuid`, `targetId uuid`, `targetType text default 'report'`, `pinned boolean`, `createdAt`, `updatedAt`; index (`user_id`, `updated_at`). Reject bookmarks whose `targetId` does not exist or is not owned by the user.
- **activities** (existing): `id uuid pk`, `userId`, `targetId`, `targetType`, `verb`, `occurredAt`; index (`user_id`, `occurred_at`). Log `view`/`open` events for saved reports.
- Add Drizzle migrations if schema diverges (constraints, indexes) from current tables.

## API Contracts
- `POST /api/reports`  
  - Auth required. Body `{ title, ticker, status, type, payload }`. Validate payload size and required fields. Returns `{ reportId }`. Respond `413` on oversize, `400` on invalid input.
- `GET /api/reports/:id`  
  - Auth required. Returns full stored report if `ownerId === userId`; `403` otherwise; `404` if missing/stale.
- `GET /api/reports?mine=true&page=&pageSize=&sort=&status=`  
  - Auth required. Returns `{ items: ReportSummary[], page, pageSize, total }` scoped to user; defaults `pageSize=20`.
- `POST /api/aiassessment`  
  - Public generation endpoint for report content (does not persist). Body `{ ticker }`. Returns full report JSON used by the frontend prior to calling `POST /api/reports` for persistence.
- `POST /api/bookmarks`  
  - Auth required. Body `{ targetId, targetType='report', pinned? }`; validates ownership of target; returns `{ bookmarkId }`.
- `DELETE /api/bookmarks/:id`  
  - Auth required. Deletes bookmark only if `userId` owns it; `404` if not found.
- Response shape notes: include `errors[]` for partial failures when resolving bookmark targets; include `generatedAt` timestamp on list responses for cache tagging.

### TypeScript Shapes
- `ReportSummary`: `{ id: string; title: string; ticker: string; status: 'draft'|'running'|'complete'|'failed'; type: string; updatedAt: string; createdAt: string; }`
- `Report`: `ReportSummary & { ownerId: string; payload: Record<string, unknown>; }`
- `Bookmark`: `{ id: string; targetId: string; targetType: 'report'; userId: string; pinned: boolean; createdAt: string; updatedAt?: string; report?: ReportSummary }`
- `Paginated<T>`: `{ items: T[]; page: number; pageSize: number; total: number; generatedAt?: string; errors?: { section: string; message: string }[] }`

## Frontend Flow & UX
- **Save report**: After analysis completes, call `POST /api/reports` with full payload; show inline toast on success/failure. Disable save if already persisted; do not expose a "Save as new" path to avoid duplicate reports. On failure, keep the generated payload in memory for the session, surface a persistent inline alert with “Retry save” (replays the request) and a “Download report JSON” fallback; if the cause is 413, message that the report is too large and offer a trimmed export (no auto-regeneration).
- **Reopen report**: Dashboard/library/bookmark cards call `GET /api/reports/:id`; render skeleton while loading, cache payload in memory; on 404/403, show inline error with CTA to regenerate or remove bookmark.
- **Bookmarks**: Add/remove/pin buttons call bookmark endpoints with optimistic UI; fall back to server state on failure. Bookmark cards resolve target summary and surface stale targets with clear messaging.
- **Error states**: Map HTTP codes to user copy: `403` ("You don't have access"), `404` ("Report no longer exists"), `413` ("Report too large to save"), generic retry for 5xx.
- **Performance**: Parallelize bookmark + report fetches on dashboard; memoize summaries; debounce repeated opens; default page size 20 with "load more".
- **Analytics**: Fire events `report_saved`, `report_opened`, `bookmark_added`, `bookmark_removed`, `bookmark_pin_toggled` with `{ userId, reportId, source }`.

## Backend Implementation Notes
- **Validation**: Centralize zod (or existing validator) schemas for report save/list params and bookmark CRUD; enforce payload size limit at middleware before hitting DB.
- **Services**: `reportService.save(userId, dto)`, `reportService.get(userId, id)`, `reportService.list(userId, filters)`, `bookmarkService.create(userId, dto)`, `bookmarkService.remove(userId, id)`. Resolve bookmark list by joining report summaries; skip missing targets with `errors` entry.
- **Error handling**: Map validation errors to 400, oversize to 413, missing to 404, ACL to 403; log server errors with correlation id.
- **Pagination & sorting**: Default sort `updatedAt desc`; allow `status` filter and `ticker` filter; clamp `pageSize` (max 50).
- **Observability**: Add structured logs for save/open/bookmark operations with `userId`, `reportId`, latency, size; count oversize rejects.

## Risk Mitigations
- **Large payloads**: Enforce size limit and warn client before upload; consider gzip in transit if needed.
- **Stale bookmarks**: Resolve targets and return `errors[]` with IDs; frontend offers cleanup CTA.
- **Data leakage**: Strictly derive `userId` server-side; never accept userId from client.
- **Reliability**: Use transactions for save + bookmark combos if batched; default to idempotent saves using generated `reportId`.

## Implementation Checklist (phased)
- **Phase 1: Frontend scaffolding (mocked)**  
  - [x] Add report save CTA and hook; show loading/success/error toasts.  
  - [x] Implement reopen flow with skeleton + error states (403/404/413).  
  - [x] Add bookmark add/remove/pin UI with optimistic state and rollback on failure; cleanup CTA for stale targets.  
  - [x] Add pagination/load-more controls for reports/bookmarks; cache last fetched page per session.  
  - [ ] Fire analytics events for save/open/bookmark actions; clear cached data on logout/auth change.
- **Phase 2: Backend foundations**  
  - [ ] Confirm/extend Drizzle migrations: payload size constraint, report/bookmark indexes, FK validation where applicable.  
  - [x] Add validators for report save/list and bookmark CRUD (page bounds, payload size -> 413).  
  - [x] Implement service/controller for `POST /api/reports`, `GET /api/reports/:id`, list endpoint, bookmark create/delete with ACL filters.  
  - [x] Create/verify Drizzle migration files that create `reports`, `bookmarks`, and `activities` tables (with indexes/FKs) and apply them to dev/stage DBs.  
  - [ ] Add structured logs with correlation id and payload size metrics; gate behind feature flag.
- **Phase 3: Wire frontend to backend**  
  - [x] Swap mock hooks to real API client; map HTTP codes to UX copy; keep optimistic updates with server reconciliation.  
  - [x] Resolve bookmark list with server data; surface `errors[]` for stale targets and expose cleanup action.  
  - [x] Ensure dashboard/library/bookmark entry points reopen stored reports (no regeneration).
- **Phase 4: Testing & hardening**  
  - [ ] Backend tests: save/fetch/list/bookmark ACL, oversize rejection, stale bookmark handling.  
  - [ ] Frontend tests: loading/error/empty states, optimistic bookmark flows, save/open interactions, accessibility checks.  
  - [ ] Manual QA: happy path save→reopen, unauthorized access, stale bookmark cleanup, pagination, mobile.
- **Phase 5: Rollout**  
  - [ ] Enable feature flag per env; seed demo reports for test users.  
  - [ ] Monitor latency, errors, oversize rejects; adjust limits.  
  - [ ] Remove legacy/local storage once dashboard uses DB-backed data.

## Rollout Plan
- Enable behind feature flag per environment; seed a few demo reports for test accounts.
- Migrate dashboard/bookmark views to DB-backed data before removing local/demo data.
- Monitor latency, error rates, and oversize rejects; fallback shows local warning + retry CTA if backend unavailable.

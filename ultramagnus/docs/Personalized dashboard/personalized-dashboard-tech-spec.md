# Personalized Dashboard Tech Spec

Reference PRD: `docs/personalized dashboard/personalized-dashboard-prd.md`

## Scope & Objectives
- Implement a post-login dashboard showing My Reports, Recent Activity, Bookmarks, and Quick Actions per user.
- Enforce strict auth/authorization; no cross-user leakage.
- Deliver p50 initial render <2s via parallel fetching and caching; degrade gracefully on partial failures.
- Integrate personalization into the existing dashboard page (`App.tsx`/Dashboard component) rather than rendering a parallel dashboard; replace local/demo data with backend-scoped payloads.

## Architecture
- **Frontend (moonshot)**: React 19 (Vite). New page component `DashboardPage` under `src/pages`. Section components under `src/components/dashboard/`.
- **Backend (backend)**: Express (TypeScript). New route `GET /api/dashboard` plus supporting bookmark/report endpoints. Services in `src/services/dashboardService.ts`, `bookmarkService.ts`, `reportService.ts` as needed.
- **Auth**: Supabase/JWT session enforced via existing middleware. Dashboard endpoints require authenticated user; derive `userId` and tenant/scope from token.
- **Analytics**: Fire events via existing analytics hook (or stub console) with `userId`, `section`, `action`, `context`.
- **Data storage**: Move from stubbed data to DB-backed tables for reports, bookmarks, and activity with ownership enforced at query level.

## Data Contracts (TypeScript interfaces)
- `DashboardView`: `userId: string; reports: ReportSummary[]; bookmarks: Bookmark[]; recentActivity: ActivityEvent[]; generatedAt: string;`
- `ReportSummary`: `id`, `title`, `status` (`draft|running|complete|failed`), `ownerId`, `type`, `createdAt`, `updatedAt`.
- `Bookmark`: `id`, `targetId`, `targetType` (`report`), `userId`, `createdAt`, `pinned: boolean`, optional `updatedAt`.
- `ActivityEvent`: `id`, `userId`, `targetId`, `targetType`, `verb` (`view|edit|share|generate`), `occurredAt`, optional `metadata`.
- Pagination shape (where applicable): `page`, `pageSize`, `total`, `items`.

## API Surface (backend)
- `GET /api/dashboard?reportsPage=&reportsPageSize=&reportsStatus=&reportsType=&bookmarksPage=&bookmarksPageSize=&activityLimit=`  
  - Auth required. Returns `DashboardView` (reports/bookmarks/activity). Partial failures returned via `errors: { section, message }[]`.
- `GET /api/reports?mine=true&status=&type=&sort=&page=&pageSize=`  
  - Auth required. Returns paginated report summaries scoped to the authenticated user.
- `GET /api/reports/:id`  
  - Auth required. Returns full stored report payload if requester is owner; 403 otherwise; 404 if missing.
- `POST /api/reports`  
  - Auth required. Body `{ title, ticker, status, type, payload }`; saves full report; returns `{ reportId }`.
- `POST /api/bookmarks`  
  - Auth required. Body `{ targetId, targetType='report', pinned? }`; creates bookmark for user; returns `{ bookmarkId }`.
- `DELETE /api/bookmarks/:id`  
  - Auth required. Removes bookmark owned by the user.
- **AuthZ guard**: All list/read/actions scoped by `userId` + ACL; 403 on unauthorized.

## Backend Implementation Notes
- **Route wiring**: Add `dashboardRoutes` in `src/routes/dashboard.ts`; register in route index. Use existing auth middleware to inject `req.user`.
- **Service layer**: `dashboardService.fetchDashboard(userId, filters)` calls:
  - `reportService.listMine(userId, filters)` with pagination/sort/status/type.
  - `bookmarkService.list(userId, filters)` with pinned/recency sort.
  - `activityService.list(userId, { limit })` ordered desc by `occurredAt`.
  - Execute in `Promise.allSettled` to enable partial success; attach `generatedAt = new Date().toISOString()`.
- **Persistence**:
  - Reports table: `id`, `ownerId`, `title`, `status`, `type`, `createdAt`, `updatedAt`; index (`ownerId`, `updatedAt`).
  - Bookmarks table: `id`, `userId`, `targetId`, `targetType`, `pinned`, `createdAt`, `updatedAt`; index (`userId`, `updatedAt`).
  - Activity table: `id`, `userId`, `targetId`, `targetType`, `verb`, `occurredAt`; index (`userId`, `occurredAt`).
  - Enforce ACL in queries (filter by userId); validate inputs; prefer soft delete for activity if ever needed.
- **Error handling**: Map service errors to HTTP 500/503; unauthorized to 403. Include `errors` array in success response when partial.
- **Performance**: Index on `user_id` for reports/bookmarks/activity tables; paginate defaults (e.g., 20 per page). Consider caching recent dashboard payload per user for a short TTL if data sources are slow.
- **Validation**: Use schema (zod or internal validator) for query/body params; enforce page/pageSize bounds.

## Frontend Implementation Notes
- **Page structure**: `App.tsx`/`Dashboard` triggers parallel fetch of reports/bookmarks/activity via `apiClient` or dedicated `dashboardClient`; no duplicate dashboard surfaces.
- **Section components**:
  - `MyReportsSection`: list/grid with filters, pagination, status/type pills; actions (open, duplicate, export, share).
  - `RecentActivitySection`: chronological list with timestamps and deep links; capped to limit; “view more” link.
  - `BookmarksSection`: list with pin/unpin, remove with confirm, sort by pinned/recency/alpha; search input.
  - `QuickActions`: buttons for new report, upload data, import template (wired to existing flows).
- **State management**: Local component state with React Query (if present) or custom hooks; optimistic updates for bookmark add/remove and pin toggles.
- **Error/empty states**: Per section messaging with retry; if dashboard API returns `errors`, show inline alerts per section but render available data.
- **Loading**: Skeletons per section; parallel fetch to meet p50 target.
- **Analytics**: Fire events on dashboard load, section view, report open, bookmark add/remove, quick action clicks with `{ userId, section, action, context }`.
- **Accessibility**: Keyboard focus on section headers/actions; ARIA labels for lists and buttons; truncate long titles with tooltip.

## Security & AuthZ
- Require valid session before loading dashboard.
- All client actions call scoped endpoints; hide UI actions when not permitted but rely on server enforcement.
- Sanitize and validate query/body inputs; never trust client-provided userId.

## Performance Targets
- Initial dashboard load p50 <2s with cached data; p95 <4s.
- Reports/bookmarks pagination pageSize default 20; activity limit default 50.
- Parallel fetch; lazy-load secondary sections if needed on slow links.

## Testing Plan
- Backend: unit tests for dashboard service (parallel fetch, partial failure), auth guard, validators; integration test for `GET /api/dashboard` with owned vs. unauthorized items; bookmark CRUD tests.
- Frontend: component tests for sections (empty/error/loading states); interaction tests for bookmark add/remove/pin and report actions; accessibility checks on keyboard nav.
- Manual QA: happy/failure paths, partial failure rendering, performance spot-check, mobile layout.

## Rollout
- Gate with feature flag per user/tenant.
- Monitor error rates, latency, and analytics events post-launch.
- Fallback: if dashboard fails entirely, redirect to landing with retry toast or show full-page error with re-fetch.

## Implementation Checklist
- [ ] Phase 1: Backend scaffolding
  - [x] Add dashboard types (ReportSummary, Bookmark, ActivityEvent, DashboardView, error shape).
  - [x] Add `dashboardRoutes` with `GET /api/dashboard` behind auth middleware.
  - [x] Implement `dashboardService` aggregation using `Promise.allSettled` with partial-failure response.
  - [x] Return `errors[]` with section keys; include `generatedAt`.
  - [ ] Add unit test for dashboard service (success + partial failure).
- [ ] Phase 2: Backend CRUD & guards
  - [x] Add DB tables/migrations:
    - Reports: `id`, `ownerId`, `title`, `status`, `type`, `createdAt`, `updatedAt`; indexes on (`ownerId`, `updatedAt`).
    - Bookmarks: `id`, `userId`, `targetId`, `targetType` (report), `pinned`, `createdAt`, `updatedAt`; indexes on (`userId`, `updatedAt`).
    - Activity: `id`, `userId`, `targetId`, `targetType`, `verb`, `occurredAt`; indexes on (`userId`, `occurredAt`).
  - [x] Add bookmark `POST /api/bookmarks` and `DELETE /api/bookmarks/:id` with validation + ACL.
  - [ ] Ensure report duplicate/share/export endpoints honor ownership/ACL and return 403/404/500 appropriately.
  - [ ] Enforce pagination/query bounds (page/pageSize/status/type) and validate inputs.
  - [x] Update services to read/write from DB instead of stubbed data; add seed/demo data if needed.
  - [ ] Add integration tests for bookmark CRUD and auth gating.
- [ ] Phase 3: Frontend data layer
  - [x] Create dashboard fetch helper/hook; include refresh and error propagation.
  - [x] Add section-level loading/skeleton and error banner handling for partial failures.
  - [x] Wire `App.tsx`/`Dashboard` to use personalized payload (replace local/demo library for reports/bookmarks/activity).
  - [x] Gate fetch on authenticated state and view mode; clear data on logout.
- [ ] Phase 4: Frontend UI & interactions
  - [x] Build Reports section with list and status badges (filters/pagination still pending).
  - [x] Build Activity section with chronological list and timestamps (view more pending).
  - [x] Build Bookmarks section with list and pinned indicator (pin/unpin/remove/sort/search pending).
  - [x] Build Quick Actions (new report, upload data, import template) stubs.
  - [ ] Implement optimistic updates for bookmark add/remove/pin and list updates.
- [ ] Phase 5: Analytics
  - [ ] Instrument dashboard load, section view, report open, bookmark add/remove/pin, quick action clicks.
  - [ ] Ensure events carry `userId`, `section`, `action`, `context`; debounce if needed.
- [ ] Phase 6: Testing/QA
  - [ ] Backend: dashboard service/route tests, bookmark CRUD tests, auth gating tests.
  - [ ] Frontend: component tests for loading/error/empty states and interactions; accessibility checks for keyboard nav/ARIA.
  - [ ] Manual QA: auth gate redirect, partial failure rendering, bookmark CRUD, report actions, performance spot-check, mobile layout.

## Open Questions
- Do we enable caching layer (server-side) for dashboard response, and what TTL? (Propose 60–120s, opt-out for users with high activity.)
- Should Quick Actions vary by tier (e.g., hide upload for guests) once tier metadata is available?

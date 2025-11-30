# Personalized Dashboard PRD

## Purpose & Context
- Ensure that after sign-in every user lands on a personalized dashboard with their own reports, bookmarks, and recent activity, scoped to their identity and permissions.
- Complements the existing auth modal flow by defining the post-login experience and data contracts needed for user-specific content.

## Goals
1. Show each user their owned or shared-with-me reports with fast access to open, duplicate, export, or share.
2. Provide a recent activity stream so users can resume work (views, edits, generations, shares).
3. Enable bookmark CRUD that persists across devices and sessions.
4. Offer quick actions to start core tasks (new report, upload data, import template).
5. Enforce authorization so no cross-user data leakage occurs on any dashboard fetch or action.

## Non-Goals
- Team/org-level rollups or recommendations.
- In-dashboard editing of reports (open detail pages instead).
- Offline mode or advanced ML ranking.

## Personas & Core Jobs
- **Analyst**: Creates reports, bookmarks references, resumes where they left off.
- **Manager**: Monitors report statuses and recent activity relevant to their work.
- **Admin**: Audits activity and ensures access is correctly enforced.

## User Stories
- View my reports with title, status, created/updated time, owner; filter/sort and paginate.
- Resume work from recent activity (viewed, edited, generated, shared) with timestamps and deep links.
- Add/remove bookmarks from reports; see a sorted list of pinned/recent items; confirm removal.
- Use quick actions to start a new report, upload data, or import from a template.
- Only see items I own or that are explicitly shared with me; unauthorized items are hidden or 403.
- Dashboard state persists across devices (tied to account, not device).

## Scope (v1)
- Dashboard page after login with sections: My Reports, Recent Activity, Bookmarks, Quick Actions.
- Report actions: open, duplicate, export, share (if permitted).
- Bookmark CRUD with sorting (pinned, recency, alpha) and search.
- Recent activity capped (e.g., 50 items) with “view more”.
- Empty/error states per section with inline retry.
- Analytics events for dashboard load, section views, report opens, bookmark add/remove, quick action clicks.
- Performance target: initial render <2s p50 using parallel fetch + cache.
- Personalized data must drive the primary dashboard page (`App.tsx`/Dashboard); do not overlay a second dashboard UI. Replace demo/local library data with user-scoped payloads from the backend.

## Out of Scope (v1)
- Org rollups, recommendations, dashboards for teams.
- In-dashboard editing or complex workflow automation.
- Offline caching and sync.

## Functional Requirements
- **Auth gate**: Unauthenticated users are redirected to login; dashboard requires valid session.
- **Ownership enforcement**: All fetches scoped server-side by `userId` and item ACLs; client never trusts local filters alone.
- **My Reports**: List endpoint supports `mine=true`, filters (status/date/type), sort, and pagination/infinite scroll; item actions include duplicate, export, share if authorized.
- **Recent Activity**: Chronological events (view/edit/share/generate) with deep links; capped list with “view more”; degrade gracefully if fetch fails.
- **Bookmarks**: `POST` add, `DELETE` remove; list shows title, type, last updated; confirm removal; respect ACL changes (remove hidden items on next fetch).
- **Quick Actions**: Buttons for new report, upload data, import template; configurable per tier; fire analytics.
- **Empty/Error states**: Friendly messages + CTA per section; inline retry on fetch failure.
- **Analytics**: Emit events for dashboard load, section view, report open, bookmark add/remove, quick action clicks; include `userId` + context for debugging.
- **Performance**: Parallelize section fetches; cache per user; avoid blocking the whole page if one section fails (render others).

## Non-Functional Requirements
- **Security**: Strict server-side authorization on every list/read/action; no data leakage across users or tenants.
- **Reliability**: Partial failure tolerance—one failing section should not block others.
- **Accessibility**: Keyboard navigation, focus states, ARIA labels for lists/actions.
- **Maintainability**: Shared dashboard types/interfaces for reports, bookmarks, activity events across frontend/backends.

## Data Model (examples)
- **DashboardView**: `userId`, `reports[]`, `bookmarks[]`, `recentActivity[]`, `generatedAt`.
- **ReportSummary**: `id`, `title`, `status`, `ownerId`, `type`, `createdAt`, `updatedAt`.
- **Bookmark**: `id`, `targetId`, `targetType`, `userId`, `createdAt`, `pinned`.
- **ActivityEvent**: `id`, `userId`, `targetId`, `targetType`, `verb` (view/edit/share/generate), `occurredAt`.

## API/Integration Contracts (high level)
- `GET /api/dashboard` → personalized payload (reports, bookmarks, recentActivity); accepts filters for pagination/sorting.
- `GET /api/reports?mine=true&status=&type=&sort=&page=` for report lists.
- `POST /api/reports/:id/duplicate`, `POST /api/reports/:id/share`, `GET /api/reports/:id/export`.
- `POST /api/bookmarks` (create), `DELETE /api/bookmarks/:id` (remove).
- Events pipeline for analytics logs (client → collector).

## UX Outline
- Layout: Hero/top summary with quick actions; three cards/sections below (My Reports, Recent Activity, Bookmarks) with inline filters.
- Filters/sorts inline per section; pills for status/date; badges for status (Draft, Running, Complete, Failed).
- Kebab menus for secondary actions; tooltips for actions; truncated long titles with tooltip on hover.
- Responsive: Vertical stacking on mobile; condensed quick actions.
- Empty states: e.g., “Create your first report” CTA; “No bookmarks yet” CTA to browse reports.

## Edge Cases
- No reports/bookmarks/activity → show empty states with CTA.
- Access revoked → item disappears on next fetch; opening a stale link shows toast/403.
- Duplicate/Export/Share failure → toast with retry guidance.
- Large lists → paginate or virtualize to protect performance.

## Risks & Mitigations
- **Data leakage**: Enforce server-side scoping and ACL checks; avoid trusting client filters.
- **Slow load**: Parallel fetch, caching, pagination, and virtualization for large lists.
- **Analytics noise**: Debounce and sample if needed; include context keys.

## Rollout & Testing
- Feature-flag by user/tenant; gradual enablement and monitor error rates + load times.
- Smoke tests: auth required, correct scoping, bookmark CRUD, report actions, partial-failure rendering.
- Manual QA: happy/failure paths for each section; ensure degraded mode renders remaining sections when one fails.

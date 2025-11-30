# Personalized Dashboard Tech Spec

Reference PRD: `docs/Personalized dashboard/personalized-dashboard-prd.md`

## Scope & Objectives
- Implement a post-login dashboard showing My Reports, Recent Activity, Bookmarks, and Quick Actions.
- Enforce strict auth/authorization; no cross-user leakage.
- Deliver p50 initial render <2s via parallel fetching.
- Integrate personalization into the existing dashboard page.

## Architecture

### Backend (Node.js/Express)
- **Service:** `DashboardService` (`src/services/dashboardService.ts`)
    - Aggregates data from `ReportService`, `BookmarkService`, and `ActivityService`.
- **Routes:**
    - `src/routes/dashboard.ts`: Endpoint for fetching the dashboard payload.
- **Auth:**
    - Supabase/JWT session enforced via middleware.

### Frontend (React/Vite)
- **Components:**
    - `DashboardPage.tsx`: Main container.
    - `MyReportsSection.tsx`, `RecentActivitySection.tsx`, `BookmarksSection.tsx`.
- **State Management:**
    - Parallel fetching of dashboard sections.
    - Optimistic updates for bookmarks.

## Data Model & Schema

### Database (PostgreSQL/Drizzle)

**`reports` Table:**
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | |
| `owner_id` | `uuid` | FK to `users.id` |
| `title` | `text` | |
| `status` | `text` | |
| `created_at` | `timestamptz` | |

**`bookmarks` Table:**
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | |
| `user_id` | `uuid` | FK to `users.id` |
| `target_id` | `uuid` | FK to `reports.id` |
| `pinned` | `boolean` | |

**`activity_events` Table:**
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | |
| `user_id` | `uuid` | FK to `users.id` |
| `verb` | `text` | 'view', 'edit', 'share' |
| `occurred_at` | `timestamptz` | |

## Logic & Algorithms

### Aggregation Strategy
- **Parallel Execution:** `DashboardService` calls `listMine`, `listBookmarks`, and `listActivity` concurrently using `Promise.allSettled`.
- **Partial Failure:** If one service fails, the dashboard still loads with an error indicator for that specific section.

## API Design

### `GET /api/dashboard`

**Query Params:** `?reportsPage=1&activityLimit=10`

**Response Payload:**
```json
{
  "reports": {
    "items": [
      { "id": "r1", "title": "NVDA Analysis", "status": "complete", "updatedAt": "..." }
    ],
    "total": 5
  },
  "bookmarks": {
    "items": [
      { "id": "b1", "targetId": "r2", "pinned": true, "title": "TSLA Report" }
    ]
  },
  "recentActivity": {
    "items": [
      { "id": "a1", "verb": "view", "targetId": "r1", "occurredAt": "..." }
    ]
  },
  "errors": []
}
```

## Implementation Plan

### Phase 1: Backend Scaffolding
1.  Implement `DashboardService` aggregation logic.
2.  Create `GET /api/dashboard` endpoint.
3.  Add unit tests for partial failure scenarios.

### Phase 2: Frontend Integration
1.  Create `DashboardPage` and section components.
2.  Wire up API fetching with loading skeletons.
3.  Implement error handling for partial failures.

### Phase 3: Polish
1.  Add "Quick Actions" UI.
2.  Implement optimistic updates for bookmarks.
3.  Add analytics events.

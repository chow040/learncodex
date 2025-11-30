# Saved Reports & Bookmarks Tech Spec

Reference PRD: `docs/Save report card/saved-reports-prd.md`

## Scope & Objectives
- Persist full report payloads (model output + metadata) per user so reports reopen without regenerating.
- Wire save + reopen flows across dashboard, library, and bookmark entry points.
- Replace local/demo storage with DB-backed reports/bookmarks while keeping latency <500ms p95.
- Enforce ownership ACL at every endpoint; cap payload size (~1.5 MB).

## Architecture

### Backend (Node.js/Express)
- **Services:**
    - `ReportService` (`src/services/reportService.ts`): Handles CRUD for reports, enforcing ACLs.
    - `BookmarkService` (`src/services/bookmarkService.ts`): Manages user bookmarks.
- **Routes:**
    - `src/routes/reports.ts`: Endpoints for saving, retrieving, and listing reports.
    - `src/routes/bookmarks.ts`: Endpoints for managing bookmarks.
- **Validation:**
    - Shared validation in `src/utils/validators.ts` (Zod schemas).
    - Payload size checks in middleware.

### Frontend (React/Vite)
- **Components:**
    - `ReportCard.tsx`: Add "Save" button and state handling.
    - `Dashboard.tsx`: Display saved reports and bookmarks.
- **State Management:**
    - Use API client for report/bookmark CRUD.
    - Optimistic UI updates for bookmarking.

## Data Model & Schema

### Database (PostgreSQL/Drizzle)

**`reports` Table:**
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | |
| `owner_id` | `uuid` | FK to `user_profiles.id` |
| `title` | `text` | |
| `ticker` | `text` | |
| `status` | `text` | 'draft', 'complete', 'failed' |
| `type` | `text` | 'equity', 'crypto', etc. |
| `payload` | `jsonb` | Full report data |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

**`bookmarks` Table:**
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | |
| `user_id` | `uuid` | FK to `user_profiles.id` |
| `target_id` | `uuid` | FK to `reports.id` |
| `target_type` | `text` | Default 'report' |
| `pinned` | `boolean` | |
| `created_at` | `timestamptz` | |

## Logic & Algorithms

### Access Control (ACL)
- **Ownership:** Users can only access reports where `owner_id` matches their `user_id`.
- **Bookmarks:** Users can only bookmark reports they have access to (currently own).

### Payload Management
- **Size Limit:** Max payload size ~1.5MB.
- **Validation:** Reject oversize payloads with `413 Payload Too Large`.

## API Design

### `POST /api/reports`

**Request Body:**
```json
{
  "title": "ELTP Equity Report",
  "ticker": "ELTP",
  "status": "complete",
  "type": "equity",
  "payload": {
    "summary": "Strong Q2 growth...",
    "verdict": "BUY",
    "rocketScore": 88
  }
}
```

**Response Payload:**
```json
{
  "reportId": "53cb9b14-43f7-47ab-8669-a602aff5a2d8"
}
```

### `GET /api/reports/:id`

**Response Payload:**
```json
{
  "report": {
    "id": "53cb9b14-...",
    "ownerId": "acbd2e1f-...",
    "title": "ELTP Equity Report",
    "ticker": "ELTP",
    "status": "complete",
    "type": "equity",
    "payload": { ... },
    "createdAt": "2025-11-29T10:00:00Z",
    "updatedAt": "2025-11-30T10:00:00Z"
  }
}
```

### `GET /api/reports`

**Query Params:** `?mine=true&page=1&pageSize=20`

**Response Payload:**
```json
{
  "items": [
    {
      "id": "53cb9b14-...",
      "title": "ELTP Equity Report",
      "ticker": "ELTP",
      "status": "complete",
      "updatedAt": "2025-11-30T10:00:00Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

### `POST /api/bookmarks`

**Request Body:**
```json
{
  "targetId": "53cb9b14-...",
  "targetType": "report",
  "pinned": true
}
```

**Response Payload:**
```json
{
  "bookmarkId": "a4c3d2b1-..."
}
```

## Implementation Plan

### Phase 1: Backend Foundations
1.  Create Drizzle migrations for `reports` and `bookmarks` tables.
2.  Implement `ReportService` and `BookmarkService`.
3.  Add validation middleware (Zod).

### Phase 2: API Implementation
1.  Implement `POST /api/reports` and `GET /api/reports/:id`.
2.  Implement `GET /api/reports` (list).
3.  Implement Bookmark CRUD endpoints.

### Phase 3: Frontend Integration
1.  Update `ReportCard` to call save API.
2.  Update Dashboard to fetch saved reports and bookmarks.
3.  Handle error states (413, 403, 404).

### Phase 4: Polish & Testing
1.  Add analytics events.
2.  Test large payloads and ACL enforcement.

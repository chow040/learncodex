# Report Conversation History Tech Spec

Reference PRD: `docs/AI conversion persistance/report-conversation-history-prd.md`

## Scope & Objectives
- Persist and serve chat transcripts associated with saved report cards.
- Provide recent turns plus a summary of older context for instant reopening.
- Enforce hard caps, retention, and summarization to control storage costs.
- Ensure privacy: conversations are scoped to specific report instances and owners.

## Architecture

### Backend (Node.js/Express)
- **Service:** `ConversationService` (`src/services/conversation.ts`)
    - Manages message persistence, retrieval, and summarization triggers.
- **Routes:**
    - `src/routes/conversation.ts`: Endpoints for fetching and appending chat messages.
    - `src/routes/ai.ts`: Extended to persist chat turns during generation.
- **Worker:**
    - Background job for summarization and purging old messages.

### Frontend (React/Vite)
- **Components:**
    - `ChatPanel.tsx`: Updated to render summaries and fetch history.
- **State Management:**
    - Optimistic updates for chat messages.
    - Handling of "cap exceeded" errors.

## Data Model & Schema

### Database (PostgreSQL/Drizzle)

**`conversation_sessions` Table:**
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | |
| `report_id` | `uuid` | FK to `reports.id` |
| `user_id` | `uuid` | FK to `users.id` |
| `status` | `text` | 'active', 'closed' |
| `created_at` | `timestamptz` | |

**`conversation_messages` Table:**
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | |
| `session_id` | `uuid` | FK to `conversation_sessions.id` |
| `report_id` | `uuid` | FK to `reports.id` |
| `role` | `text` | 'user', 'assistant' |
| `content` | `text` | Trimmed server-side |
| `created_at` | `timestamptz` | |

**`conversation_summaries` Table:**
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | |
| `report_id` | `uuid` | FK to `reports.id` |
| `summary` | `text` | Condensed history |
| `coverage_up_to` | `timestamptz` | Last message included |
| `updated_at` | `timestamptz` | |

## Logic & Algorithms

### Summarization Strategy
1.  **Trigger:** Message count > 20 OR Total bytes > 50KB.
2.  **Process:**
    - Fetch messages older than the "recent window".
    - Generate a bulleted summary using LLM.
    - Store summary in `conversation_summaries`.
    - Delete summarized messages (keeping 3 anchor turns).

### Limits & Retention
- **Per-message:** Max 6KB.
- **Per-report:** Max 300KB (messages + summary).
- **Retention:** 90 days.

## API Design

### `POST /api/reports/:id/chat`

**Request Body:**
```json
{
  "role": "user",
  "content": "What are the main risks?",
  "model": "gemini-3-pro-preview"
}
```

**Response Payload:**
```json
{
  "text": "Key risks: pricing pressure...",
  "messageId": "d15f1c24-...",
  "sessionId": "2c0a5a10-...",
  "summaryResult": { "summarized": false },
  "conversation": {
    "summary": null,
    "messages": [
      { "id": "d15f1c24-...", "role": "assistant", "content": "Key risks...", "createdAt": "..." },
      { "id": "3b2b6a88-...", "role": "user", "content": "What are the main risks?", "createdAt": "..." }
    ]
  }
}
```

### `GET /api/reports/:id/chat`

**Query Params:** `?limit=20`

**Response Payload:**
```json
{
  "summary": {
    "text": "Earlier convo: user asked about earnings...",
    "coverageUpTo": "2025-11-29T10:00:00Z"
  },
  "messages": [
    { "id": "e1", "role": "assistant", "content": "Risks: pricing pressure...", "createdAt": "..." },
    { "id": "u1", "role": "user", "content": "What are the main risks?", "createdAt": "..." }
  ]
}
```

## Implementation Plan

### Phase 1: Schema & Services
1.  Create tables and indexes.
2.  Implement `ConversationService` (append, fetch).
3.  Wire persistence into `ai` route.

### Phase 2: API & Frontend
1.  Implement `GET/POST /api/reports/:id/chat`.
2.  Update Frontend to load summary + recent turns.
3.  Handle optimistic updates and errors.

### Phase 3: Summarization
1.  Implement background worker for summarization.
2.  Implement retention purge logic.
3.  Add observability metrics.

# Sign-In & Authentication Tech Spec

Reference PRD: `docs/Sign-in function/sign-in-create-account-prd.md`

## Scope & Objectives
- Operationalize the sign-in/create-account PRD by detailing the architecture, data flows, and engineering plan.
- Move from `localStorage`-driven mock auth to Supabase-backed sessions with contextual gating.
- Enforce the "3 guest searches" limit before prompting the create-account modal.
- Persist user profiles and bookmarks in PostgreSQL.
- Instrument modal usage analytics.

## Architecture

### Backend (Node.js/Express)
- **New Service:** `AuthService` (`src/services/authService.ts`)
    - Handles user registration, login, and session management via Supabase Auth.
    - Manages user profiles in the `user_profiles` table.
- **New Middleware:** `authMiddleware` (`src/middleware/auth.ts`)
    - Verifies Supabase JWT tokens attached to requests.
    - Populates `req.user` with the authenticated user's context.
- **Modified Endpoint:** `POST /api/ai/generate`
    - Checks `req.user` to enforce rate limits based on user tier (Guest vs. Pro).

### Frontend (React/Vite)
- **Modified Components:**
    - `AuthModal.tsx`: Replaces fake timeout with real Supabase email/password and Google SSO flows.
    - `App.tsx`: Hydrates user session from Supabase on load and manages global auth state.
- **State Management:**
    - Sync Supabase session state with local React state (`user` context).
    - Persist a lightweight user object in `localStorage` for optimistic UI rendering.

## Data Model & Schema

### Database (PostgreSQL/Supabase)

**`public.user_profiles` Table:**
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | `uuid` (PK) | Matches `auth.users.id` |
| `email` | `text` | Unique, same as auth user |
| `display_name` | `text` | Derived from email or provided during signup |
| `tier` | `text` | Default `'Pro'`, future use for billing |
| `avatar_url` | `text` | Nullable |
| `created_at` | `timestamptz` | Default `now()` |
| `updated_at` | `timestamptz` | Default `now()` |

**RLS Policies:**
- "Users can manage own profile": `auth.uid() = id`

## Logic & Algorithms

### Guest Limit Enforcement
The frontend and backend will collaborate to enforce the guest search limit.

1.  **Frontend Check:** `App.tsx` tracks `guestUsageCount` in `localStorage`.
2.  **Trigger:** If `guestUsageCount >= 3` and user is not logged in:
    - Block the search request.
    - Open `AuthModal` with message: "You've reached the free preview limit. Create a free account to keep analyzing."
3.  **Backend Enforcement:** Unauthenticated requests to `/api/ai/generate` will be rate-limited by IP or fingerprint (future scope) to prevent bypass.

### Authentication Flow
1.  **Sign Up/Login:** User submits credentials via `AuthModal`.
2.  **Supabase Auth:** Frontend calls `supabase.auth.signUp()` or `signInWithPassword()`.
3.  **Session Hydration:** On success, `App.tsx` receives the session, fetches the profile from `user_profiles`, and updates the UI.

## API Design

### `POST /api/auth/signup` (Proxy to Supabase)

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "displayName": "John Doe"
}
```

**Response Payload:**
```json
{
  "user": {
    "id": "d0a3b1-...",
    "email": "user@example.com",
    "tier": "Pro"
  },
  "session": {
    "access_token": "eyJhbG...",
    "refresh_token": "..."
  }
}
```

### `GET /api/auth/me`

**Headers:**
`Authorization: Bearer <access_token>`

**Response Payload:**
```json
{
  "id": "d0a3b1-...",
  "email": "user@example.com",
  "displayName": "John Doe",
  "tier": "Pro",
  "avatarUrl": null,
  "createdAt": "2023-10-27T10:00:00Z"
}
```

## Implementation Plan

### Phase 1: Backend & Database
1.  Enable Supabase Auth providers (Email, Google).
2.  Create `user_profiles` table and RLS policies.
3.  Implement `AuthService` and `authMiddleware`.

### Phase 2: Frontend Integration
1.  Install Supabase client and configure `VITE_SUPABASE_URL`.
2.  Update `AuthModal` to use real auth methods.
3.  Implement session hydration in `App.tsx`.
4.  Add guest limit logic and UI gating.

### Phase 3: Analytics & Polish
1.  Instrument `auth_modal_open`, `auth_modal_submit`, `auth_modal_success` events.
2.  Handle edge cases (email verification pending, offline mode).

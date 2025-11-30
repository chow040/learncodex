# Ultramagnus Sign-In & Auth Tech Spec

## 1. Overview
This spec operationalizes the sign-in/create-account PRD by detailing the architecture, data flows, and engineering plan to move from the current localStorage-driven mock auth to Supabase-backed sessions with contextual gating. Scope includes wiring Supabase auth, persisting user profiles/bookmarks, enforcing the guest search limit, and instrumenting modal usage.

## 2. Goals & Non-goals
- **Goals**
  - Replace the fake timeout in `components/AuthModal.tsx` with real Supabase email/password + Google SSO flows.
  - Persist canonical session + user profile data in Supabase/Postgres, while keeping a lightweight local cache for optimistic UI in `App.tsx`.
  - Enforce the "3 guest searches" limit (PRD decision) before prompting the create-account modal.
  - Maintain the teaser experience (locked `ReportCard` sections) with contextual copy.
  - Capture analytics for modal opens, submissions, and success/error outcomes.
- **Non-goals**
  - Billing/tier enforcement beyond displaying `user.tier` (remains `Pro`/`Institutional` placeholder).
  - Provisioning or managing user API keys (explicitly deferred).
  - Broader account management (password reset, MFA) beyond Supabase defaults.

## 3. Current State Summary
- `App.tsx` manages `user`, `isAuthModalOpen`, `authModalMessage`, `guestUsageCount`, and saves everything to `localStorage`.
- `components/AuthModal.tsx` fakes auth via `setTimeout`, toggles sign-in vs. create-account, and calls `onLogin` with mocked data.
- Locked `ReportCard` sections and bookmark actions call `handleOpenAuth()` which only updates modal state.
- No telemetry is captured.

## 4. Target Architecture
```
Landing/Header/ReportCard actions
        │                                   
        ▼
handleOpenAuth(context)
        │
AuthModal (email/password + Google)
        │
        ├─ Supabase Auth (email/password)
        │    ├─ signup → Supabase session + verification email (if needed)
        │    └─ login → Supabase session
        │
        ├─ Supabase Auth (Google provider)
        │
        └─ Success callback →
              fetch profile from `public.user_profiles`
              hydrate React `user` state
              persist optimistic cache (localStorage)

Background sync: on app load, check Supabase session → fetch profile → set user → mirror to cache.
Logout clears Supabase session + cache.
```

## 5. Data Model & Storage
### Supabase Auth
- Use built-in `auth.users` for credentials + session tokens.
- Enable email verifications for email/password signups (per PRD decision); skip for Google SSO.

### `public.user_profiles` table (new)
| column           | type        | notes |
|------------------|-------------|-------|
| id               | uuid (PK)   | matches `auth.users.id` |
| email            | text        | unique, same as auth user |
| display_name     | text        | stored from AuthModal form (default derived from email) |
| tier             | text        | default `Pro`; future use |
| join_date        | timestamptz | default `now()` |
| avatar_url       | text        | nullable |
| created_at       | timestamptz | default `now()` |
| updated_at       | timestamptz | default `now()` |

### Saved Reports
- Future work: move `ultramagnus_library_v1` into `public.saved_reports`. For this sprint, keep localStorage but design schema for later.

### Local Cache
- Keys remain (`ultramagnus_user`, `ultramagnus_library_v1`, `ultramagnus_guest_usage`, `ultramagnus_user_api_key`). Cache hydrates from Supabase session and expires when Supabase session ends.

## 6. Frontend Changes
### `App.tsx`
- Load session from backend `/api/auth/me` and cache user locally.
- Update `handleLogin` to use backend auth (email/password + Google) and hydrate profile.
- Implement `handleLogout` to clear cookies (backend) and local state.
- Guest usage logic: call `/api/limits/search` and enforce 1 lifetime search for unauthenticated + guest tier (masked/unmasked accordingly).

### `components/AuthModal.tsx`
- Replace fake timeout with backend email/password auth. Show validation errors from responses.
- Support verification state: if backend returns "verification required", show inline message instructing the user to check inbox and block session hydration until verified (implementation pending).
- Google button hits backend OAuth start endpoint and completes via callback.

### `services` additions
- Auth/limits clients point to backend endpoints (`/api/auth/*`, `/api/limits/search`).

### Telemetry Hook
- Create `services/analytics.ts` (stub) with `trackAuthModalEvent({ context, action, status })`. Initially logs to console; future integration to Rudderstack/Amplitude.

## 7. Backend / SQL Work
1. **Enable Supabase Auth providers**
   - Email/password (default).
   - Google OAuth (configure credentials + redirect URIs).
2. **Create `user_profiles` table**
```sql
create table public.user_profiles (
  id uuid references auth.users primary key,
  email text unique not null,
  display_name text not null,
  tier text not null default 'Pro',
  join_date timestamptz not null default now(),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_profiles_updated
  before update on public.user_profiles
  for each row execute procedure trigger_set_timestamp();
```
3. **Row Level Security**
```sql
alter table public.user_profiles enable row level security;
create policy "Users can manage own profile"
  on public.user_profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);
```
4. (Future) `saved_reports` table spec to be added once timeline confirmed.

## 8. Guest Search Limit Logic
- In `handleSearch` increment `guestUsageCount` when no Supabase session.
- After incrementing, if `guestUsageCount >= 3` and modal closed, set `authModalMessage = "You've reached the free preview limit. Create a free account to keep analyzing."` and open modal.
- Reset counter upon successful login (optional) or continue tracking to see if user relogs as guest.

## 9. Edge Cases
- **Email verification pending:** keep user in guest state until `supabase.auth.getSession()` returns a confirmed email. Show inline message in modal.
- **OAuth popup blocked:** fallback link that opens `supabase.auth.signInWithOAuth({ provider: 'google', options: { skipBrowserRedirect: true } })` to obtain URL.
- **Offline mode:** surface toast and allow retry without closing modal.
- **Session expiration:** listen to `supabase.auth.onAuthStateChange` to clear `user` and caches.

## 10. Analytics Events
| Event | Payload |
|-------|---------|
| `auth_modal_open` | `{ context, initialMode }` |
| `auth_modal_submit` | `{ context, mode }` |
| `auth_modal_success` | `{ mode, provider }` |
| `auth_modal_error` | `{ mode, provider, errorCode }` |
| `guest_limit_triggered` | `{ guestUsageCount }` |

## 11. Rollout Plan & Checklist
Use this as an at-a-glance tracker. Update the checkboxes as work progresses; no need for a separate tracking doc unless the effort expands beyond this scope.

### Prep
- [x] Confirm all modal copy variants with design/PM.
- [x] (N/A with Drizzle backend) Populate `.env.local` + deployment secrets with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- [x] Configure Google OAuth client (dev + prod redirect URIs).
- [x] Configure Resend (or equivalent) for verification emails (env: RESEND_API_KEY, MAIL_FROM); add templates for prod.

### Backend
- [x] Ship SQL migration for auth tables (`auth_users`, `user_profiles`) + timestamp trigger.
- [x] (N/A with Drizzle auth) Enable RLS and add "Users can manage own profile" policy.
- [x] Test email templates + verification links (verification tokens/endpoint implemented; Resend send wired and verified delivered).
- [x] Add server-side guest usage enforcement (windowed count) keyed by `guest_id` cookie or `user_id` when tier = Guest. Responses should 429 with `{ error: 'guest_limit' }` when exceeded.

### Frontend Implementation
- [ ] (N/A with Drizzle backend) Add Supabase client (`services/supabaseClient.ts`) and auth helper layer.
- [x] Replace `AuthModal` fake timeout with real backend signup/login flows + error states.
- [x] Update `App.tsx` lifecycle hooks to hydrate from backend session (`/api/auth/me`) and listen for auth state changes via cookies.
- [x] Implement guest search limit logic + contextual messaging (1 lifetime search; masked for unauthenticated, unmasked for guest tier).
- [x] Wire telemetry stub (`trackAuthModalEvent`) across modal actions.

### Testing
- [x] Email/password signup up to verification email message (token-based flow + Resend send verified).
- [x] Post-verification login to ensure session hydration works.
- [x] Google OAuth happy path (desktop + popup fallback).
- [x] Guest search limit: unauthenticated = 1 lifetime masked; guest tier = 1 lifetime unmasked.
- [x] Multi-tab scenario: logout/login reflects across tabs via BroadcastChannel.

### Docs & Handoff
- [ ] Reference PRD + tech spec in PR description with summary of completed checklist items.
- [ ] Attach Supabase screenshots (OAuth config, RLS policy, verification email) for reviewers.

## 12. Risks & Mitigations
- **OAuth configuration drift:** capture client IDs in 1Password and document redirect URIs.
- **Local cache drift:** rely on `supabase.auth.onAuthStateChange` plus TTL on cached user object.
- **Guest limit backlash:** ensure copy clearly communicates unlimited access after signup; allow product to tweak threshold via config.

## 13. Open Items
- Confirm redirect URLs for Google OAuth in staging/prod.
- Decide whether to auto-create `user_profiles` row via Edge Function or client-side RPC immediately after sign-up.
- Determine analytics destination (Amplitude vs. PostHog) before replacing console logs.

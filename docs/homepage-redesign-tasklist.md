## Home Experience Redesign Task List

### Track A · Pre-Implementation
- [x] Collect Google OAuth client IDs/secrets and configure redirect URIs for local, staging, prod.
- [x] Decide on primary session strategy (secure cookie vs JWT + refresh) with backend owners.
- [x] Finalize hero copy, value props, and iconography for authenticated cards.

### Track B · Theme & UI Foundations
- [x] Insert provided CSS tokens into `:root`/`.dark` and wire them into Tailwind `theme.extend`.
- [x] Scaffold required shadcn components (Button, Card, Badge, Avatar, Container, Separator, Toast).
- [x] Load Inter (or approved typeface) and configure Tailwind `fontFamily`.
- [x] Implement background vignette/noise treatment aligned with reference design.

### Track C · Authentication & Session Flow
- [x] Integrate `@react-oauth/google` with Authorization Code + PKCE (GIS button).
- [x] Build `AuthProvider` + `useAuth()` to manage login/logout, status, and error surfaces.
- [x] Add `ProtectedRoute` guard that redirects unauthenticated users to `/` preserving intended path.
- [x] Implement logout flow to clear session cookie/JWT and reset client state.

### Track D · Backend & Persistence
- [x] Create Drizzle migrations for `users`, `user_identities`, and `sessions` tables (indexes, constraints).
- [x] Implement repositories/services for user upsert by provider `sub` and session lifecycle management.
- [x] Ship `/auth/google`, `/auth/google/callback`, `/auth/logout`, `/auth/refresh` (if JWT), and `/me` endpoints.
- [x] Validate Google ID token signature/claims (iss, aud, exp, nonce) using JWKS.
- [ ] Update analytics hooks to emit `auth_login_success` and other events once session created.

### Track E · Profile Persistence & Hydration
- [x] Upsert user + identity on login (capture `last_login_at`) and return canonical profile payload.
- [x] Hydrate frontend auth context from `/me` with `name`, `email`, `avatar`, and session metadata.
- [x] Render avatar dropdown showing profile info and logout action.

### Track F · Unauthenticated Experience
- [x] Build hero band with headline, supporting copy, trust indicators, and Google CTA.
- [x] Create feature highlight strip with three token-driven cards (Equity Insight, Chart Analysis, Platform).
- [x] Ensure navigation to protected routes while logged out redirects to `/` with stored intent.
- [x] Conduct accessibility pass for button labels, focus order, and skip-to-content link.

### Track G · Authenticated Experience
- [x] Render two primary cards (Equity Insight, Chart Analysis) with actions, hover treatment, and learn-more links.
- [x] Surface status snippets in cards when data available (e.g., "Latest insight generated …").
- [x] Provide skeleton/loading state while auth/session initializes.
- [x] Integrate theme toggle and user avatar menu in sticky top nav.

### Track H · Security & Compliance
- [x] Enforce HTTPS (non-local) and cookie flags `HttpOnly`, `Secure`, `SameSite=Lax/Strict`.
- [x] Persist and validate PKCE verifier securely; include `state` + `nonce` checks.
- [ ] Rate-limit auth endpoints and log anomalies without sensitive payloads.
- [x] Store secrets via env/secret manager; avoid persisting Google tokens unless required (encrypt if stored).

### Track I · QA, Testing & Rollout
- [ ] Unit test token verification helpers, PKCE utilities, session issuance logic.
- [x] Integration test end-to-end OAuth flow with Google staging credentials.
- [x] Validate UX paths (first login, returning user, logout, denial/cancel, multi-tab behavior).
- [ ] Run accessibility + responsive audits (360/768/1024/1440 breakpoints); confirm other routes respect new tokens.
- [ ] Instrument structured logs/metrics for auth flow; document setup in onboarding.
- [ ] Launch behind feature flag, dogfood internally, monitor metrics, then promote to production.

### Milestones
- **M1**: Theme + auth scaffolding complete; migrations and endpoints deployed behind flag.
- **M2**: Unauthenticated hero + feature highlights live with copy sign-off; OAuth flow functional in staging.
- **M3**: Authenticated hub, session persistence, and QA sign-off ready for production rollout.

Dependencies: Google OAuth credentials, session secret keys, backend infrastructure for new tables/endpoints, approved design assets.

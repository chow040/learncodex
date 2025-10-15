## Home Experience Redesign Blueprint

Objective: Deliver a dark-mode, authentication-aware home experience that mirrors the shadcn/ui reference aesthetic, enables Google OAuth sign-in, persists local user profiles, and funnels authenticated users directly into Equity Insight or Chart Analysis.

### 1. Goals & Scope
- Let users authenticate with Google (OAuth 2.0 + OpenID Connect) using Authorization Code + PKCE.
- Create or update a local user record mapped to the Google identity and persist session state for the app.
- Issue and manage first-party sessions (secure cookie or JWT) including logout, refresh, and optional account linking.
- Replace the current marketing-heavy landing page with an auth-aware, dark-themed hub aligned to the provided token set.

### 2. High-Level Architecture
- **Frontend (React + Vite)** renders “Continue with Google” via Google Identity Services (GIS).
- On click, user is redirected to Google, approves access, and returns to the backend redirect URI with authorization code (PKCE).
- **Backend (Node/Express)** exchanges the code for ID & access tokens, verifies claims, upserts local user entities, and issues an application session.
- Frontend receives session confirmation (cookie or token), hydrates profile context, and treats the user as authenticated.
- Authenticated home renders two primary navigation options (Equity Insight, Chart Analysis); unauthenticated state shows hero with CTA.

### 3. Key Standards & Concepts
- **OAuth 2.0 Authorization Code Grant + PKCE** for browser-based flows.
- **OpenID Connect** to retrieve an ID Token (JWT) describing the Google user.
- Minimum scopes: `openid`, `email`, `profile`.
- Critical ID token claims: `sub`, `email`, `email_verified`, `name`, `picture`, `nonce`.
- Always validate token signature, issuer (`https://accounts.google.com`), audience (client ID), and expiry.

### 4. Google Cloud Setup
- In Google Cloud Console → APIs & Services → Credentials, create OAuth 2.0 client IDs.
  - **Web client** for browser flow (Frontend).
  - If backend performs exchange, configure its client with secret.
- Configure Authorized JavaScript Origins (e.g., `http://localhost:5173`, production domain) and Redirect URIs (e.g., `http://localhost:4000/auth/google/callback`).
- Store `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and redirect URIs in secrets manager / `.env.local`.
- Enable Google People API only if additional profile fields are required.

### 5. Experience Architecture
- **Unauthenticated state**: Hero-led marketing band with headline, supporting copy, feature highlights, and the single primary CTA `Continue with Google`. Secondary content (product tiles, testimonials) remains browsable but protected routes redirect back to login.
- **Authentication flow**: Use a dedicated AuthGateway module that triggers GIS, relays the authorization code to backend, and tracks loading/error states.
- **Authenticated state**: Replace legacy mega-menu with a distilled command center showing two primary cards—`Equity Insight` and `Chart Analysis`—each with summary copy, quick links, and call-to-action buttons.
- **Global guardrails**: React Router protects `/equity-insight`, `/trade-ideas`, etc. Unauthenticated access redirects to `/` and preserves intended destination for post-login navigation.

### 6. Layout & Interaction Model
- **Hero band**: Centered stack (100vh minus nav) featuring headline, value props, Google button, and trust indicators. Built with shadcn `Container`, `Button`, `Badge`.
- **Feature highlight strip**: Horizontal cards teasing platform capabilities, using token-driven gradients (`--primary`, `--secondary`).
- **Authenticated dashboard tiles**: Two equal cards (stack on mobile) with iconography, hover motion, key stats (e.g., “Latest insight generated 2h ago”) and `Enter` buttons.
- **Global shell**: Sticky top navigation with brand mark, user avatar dropdown, theme toggle, and background vignette mirroring the provided screenshot.
- **Responsiveness**: Collapse to single column <768px, maintain ≥48px tap targets, ensure hero CTA stays above the fold.

### 7. Authentication & Session Management
- **Frontend library**: `@react-oauth/google` (GIS code flow) for Vite. Prefer Authorization Code with PKCE (over implicit credential flow).
- **Auth context**: Implement `AuthProvider` and `useAuth()` to initialize GIS, trigger login, store session metadata, and expose `logout`.
- **Session strategy**: Backend issues HttpOnly Secure SameSite cookie (session ID) or short-lived JWT (15–60 min) + refresh token endpoint. Feature flag to switch strategies if needed.
- **Token refresh**: If using JWT, add `/auth/refresh` to rotate tokens. Cookies rely on server-managed `sessions` table with expiry.
- **Route protection**: `ProtectedRoute` component checks `status === "authenticated"`, otherwise pushes to `/` with `state.from`.
- **Error handling**: Show toast notifications for GIS errors, denial, or token exchange failures; include retry path and fallback instructions for blocked third-party cookies.

### 8. User Data Persistence
- **Data contract**: Capture Google `sub`, `email`, `email_verified`, `name`, `picture`, and app-specific metadata (`last_login_at`, optional `role`).
- **Database schema** (Drizzle/Postgres):
  - `users`: `id` (uuid PK), `email` (unique), `email_verified` (bool), `full_name`, `avatar_url`, `created_at`, `updated_at`.
  - `user_identities`: `id` (uuid PK), `user_id` (FK), `provider` (enum, e.g., `google`), `provider_sub` (unique per provider), `access_token` (nullable/encrypted), `refresh_token` (nullable/encrypted), `id_token` (optional), `expires_at`, `raw_profile` (jsonb), timestamps.
  - `sessions`: `id` (uuid), `user_id` (FK), `created_at`, `expires_at`, optional `ip` + `user_agent`.
- **Repository layer**: Add utilities to upsert user + identity by `provider_sub`, refresh profile fields, and manage session lifecycle.
- **API surface**: `/auth/google` (initiate), `/auth/google/callback` (complete), `/auth/logout`, `/auth/refresh` (if JWT), `/me` (session profile).
- **Client integration**: On login success, hydrate auth context with canonical profile from `/me` for avatar dropdown and greetings; cache in memory/localStorage cautiously.

### 9. Visual System & Theming
- **Token source of truth**: Insert provided CSS custom properties into `src/index.css` for `:root` and `.dark`; ensure Tailwind `theme.extend` maps to these tokens (colors, border radius, ring).
- **Component styling**: Favor shadcn primitives (`Button`, `Card`, `Separator`, `Avatar`, `Badge`) to reduce bespoke class usage and ensure consistent radius (`--radius` ~0.625rem).
- **Background treatment**: Solid `--background` base, subtle vignette, noise texture overlay to match reference screenshot.
- **Typography**: Load Inter (variable) or equivalent sans via Tailwind `fontFamily`. Headings weight 700, body 400; limit excessive uppercase to hero chips for readability.
- **Accessibility**: Maintain contrast ≥4.5:1, provide focus outlines via `--ring`, ensure keyboard navigation order and skip links.

### 10. Information Architecture Updates
- Deprecate mega-navigation; surface detailed links within authenticated cards via `Learn more`.
- Update `<title>`/meta descriptions to reflect new marketing copy.
- Emit analytics events (`auth_login_success`, `home_primary_card_click`) for instrumentation.

### 11. Security Requirements
- Enforce PKCE for all public clients and include `state` + `nonce` to defeat CSRF/replay.
- Require HTTPS in staging/production; set cookies `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict` if compatible).
- Validate ID token signature via Google JWKS, and confirm `aud`, `iss`, `exp`, `iat`.
- Trust email only when `email_verified === true`; otherwise prompt user to verify.
- Manage secrets via environment variables / secret manager; never commit client secrets.
- Avoid storing Google access/refresh tokens unless needed; if stored, encrypt at rest and rotate keys.
- Add rate limiting to auth endpoints and basic bot protection.
- Handle account linking carefully: if a verified email already exists, require re-auth confirmation before linking to prevent takeover.

### 12. Detailed Flow (Happy Path)
1. User clicks Google button → frontend POSTs to `/auth/google`.
2. Backend generates `state`, `nonce`, `code_verifier`, stores verifier (server session or encrypted cookie), and redirects to Google with `code_challenge`.
3. User authorizes → Google redirects to `/auth/google/callback?code&state`.
4. Backend validates `state`, exchanges code + verifier for tokens, verifies ID token claims.
5. Backend upserts into `users` and `user_identities`, updates `last_login_at`, creates session row, issues session cookie or JWT.
6. Backend redirects to frontend home; frontend calls `/me` to hydrate profile.
7. Authenticated home renders two-option hub; downstream routes unlock.

### 13. API Endpoints
- `GET /auth/google` — Initiate OAuth with PKCE, redirect to Google.
- `GET /auth/google/callback` — Handle Google response, exchange tokens, create session, redirect.
- `POST /auth/logout` — Revoke session (delete cookie, invalidate session row).
- `GET /me` — Return authenticated user profile plus identity metadata.
- `POST /auth/refresh` — Issue new JWT/refresh (optional depending on session strategy).

### 14. Configuration & Environments
- **Local**: Frontend `http://localhost:5173`, Backend `http://localhost:4000`, Redirect URI `http://localhost:4000/auth/google/callback`.
- **Staging/Prod**: Register real origins and redirect URIs; enforce HTTPS.
- **Environment variables**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `SESSION_SECRET`, `JWT_SIGNING_KEY` (if JWT), `ENCRYPTION_KEY` (if storing tokens).

### 15. Implementation Sequencing
1. **Theme foundation**: integrate CSS tokens, update Tailwind config, scaffold shadcn components.
2. **Auth scaffolding**: add GIS provider, `AuthProvider`, login/logout handling, and router guards.
3. **Backend persistence**: create migrations for `users`, `user_identities`, `sessions`; build repositories/services and auth endpoints.
4. **Unauthenticated UI**: implement hero, Google CTA, feature highlights with new tokens.
5. **Authenticated UI**: build two-option hub, avatar menu, integrate profile data.
6. **Session lifecycle**: wire `/me`, logout, optional refresh flow; ensure client hydrates profile after login.
7. **QA & polish**: responsive checks, keyboard navigation, copy approval, regression tests on existing routes under new theme.

### 16. Observability & Audit
- Structured logs (no PII) for auth events: `event`, `user_id`, `provider`, `status`, `latency`, correlation IDs.
- Metrics: login success rate, error distribution, callback latency, drop-off points.
- Optional audit table capturing sign-in events, IP, hashed user agent for security review.

### 17. Testing Plan
- **Unit**: token verification helpers, PKCE generator, session issuance logic.
- **Integration**: end-to-end OAuth flow with Google test account (staging), ensuring upsert + session behavior.
- **Security**: attempt CSRF/state replay, invalid nonce, expired code, unverified email, cookie flag inspection.
- **UX**: first login (new user), returning login, logout, refresh, denial/cancel, multi-tab behavior. Validate Safari ITP handling of cookies.

### 18. Rollout Plan
- Ship behind feature flag and deploy to staging with registered Google credentials.
- Dogfood internally, monitor logs/metrics, ensure fallback path if login fails.
- Promote to production during low-traffic window; keep emergency rollback (re-enable legacy flow) ready.

### 19. Optional Enhancements
- Account linking UI to attach Google to existing accounts after password re-auth.
- Domain-based role assignment (e.g., `@yourbank.com` auto-maps to “Institutional” role).
- Progressive profiling to collect additional fields post-login.
- Just-in-time provisioning toggles for first-login behavior.
- Evaluate managed auth (Auth.js, Firebase, Supabase) if speed outweighs custom control.

### 20. Open Questions
- Do we require long-lived refresh tokens or will short-lived sessions suffice initially?
- Should we support guest exploration without sign-in for marketing?
- Are analytics hooks already standardized elsewhere?
- Does the data model need RBAC or team/org tables in this iteration?
- Any compliance constraints (PII retention, audit logging) that affect storage/retention policies?

### 21. Implementation Checklist
- **Pre-Implementation**
  - Confirm Google OAuth client IDs, secrets, and redirect URIs for local, staging, and production.
  - Align on session strategy (secure cookie vs JWT + refresh) with backend stakeholders.
  - Approve hero copy, value props, and iconography for authenticated cards.
- **Theme & UI Foundations**
  - Install required shadcn components (Button, Card, Badge, Avatar, Container, Separator, Toast).
  - Apply CSS tokens under `:root`/`.dark` and map them via Tailwind `theme.extend`.
  - Load typography (e.g., Inter) and configure Tailwind `fontFamily`.
  - Rebuild background vignette/noise treatment matching reference design.
- **Authentication Flow**
  - Integrate `@react-oauth/google` with PKCE-enabled GIS button.
  - Implement `AuthProvider` + `useAuth()` handling login, logout, status, and error states.
  - Add `ProtectedRoute` guard and redirect unauthenticated users back to `/` with intent memory.
  - Implement logout to clear session cookie/JWT and reset client auth state.
- **Backend Services**
  - Ship Drizzle migrations for `users`, `user_identities`, and `sessions` tables with constraints/indexes.
  - Build repository/service layer for user upsert by provider `sub` and session lifecycle.
  - Implement `/auth/google`, `/auth/google/callback`, `/auth/logout`, `/auth/refresh` (if used), and `/me`.
  - Verify Google ID token signature/claims via JWKS (iss, aud, exp, nonce).
- **Profile Persistence**
  - Upsert profile on login (capture `last_login_at`) and return canonical payload.
  - Hydrate frontend context with profile (`name`, `email`, `avatar`) from `/me`.
  - Display avatar dropdown with profile info and logout action.
- **Unauthenticated Experience**
  - Build hero band with CTA, supporting copy, and trust indicators.
  - Implement feature highlight strip with three token-driven cards.
  - Ensure guarded routes redirect unauthenticated users to `/` with preserved destination.
- **Authenticated Experience**
  - Render two primary cards (Equity Insight, Chart Analysis) with actions and hover states.
  - Include “Learn more” links for deeper navigation and status snippets when available.
  - Provide loading/skeleton state while session/profile resolves.
- **Security & Compliance**
  - Enforce HTTPS (non-local) and cookie flags `HttpOnly`, `Secure`, `SameSite=Lax/Strict`.
  - Use `state` + `nonce` and securely persist PKCE verifier between auth steps.
  - Rate-limit auth endpoints and log anomalies (without sensitive payloads).
  - Store secrets in env/secret manager; avoid persisting Google access/refresh tokens unless required (encrypt if stored).
- **QA & Testing**
  - Unit test token verification, PKCE utilities, and session issuance.
  - Integration test full OAuth flow with Google staging credentials.
  - Validate UX paths: first login, returning user, logout, denial/cancel, multi-tab behavior.
  - Run accessibility and responsive audits (360/768/1024/1440 breakpoints).
  - Confirm existing routes inherit new theme tokens without regressions.
- **Observability & Rollout**
  - Instrument structured auth logs and metrics (success/error counts, latency).
  - Document Google OAuth setup and env configuration in onboarding docs.
  - Launch behind feature flag, dogfood internally, monitor metrics, then graduate to production.

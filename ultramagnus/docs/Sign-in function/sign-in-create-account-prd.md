# Ultramagnus Sign-In & Account Creation PRD

## Purpose & Context
- Ultramagnus currently lets guests run one teaser analyses, but key surfaces (saved reports, settings, premium report modules) are locked behind an `AuthModal` flow defined in `components/AuthModal.tsx` and invoked across `LandingPage`, `Header`, `ReportCard`, and `AccountSettingsPage` via `App.tsx`.
- The goal of this PRD is to formalize how we convert high-intent researchers from the teaser funnel into authenticated users who can save work, configure settings, and unlock the full report. The same modal handles both "Sign in" and "Create account" modes today; this document clarifies UX, states, and open questions so the flow can be productionized (e.g., wired to Supabase down the line).

## Goals
1. Provide a consistent authentication experience across every entry point (landing CTA, dashboard header, gated features, demo modal) with contextual messaging that nudges the right action (sign in vs. create free account).
2. Capture the minimum data required to personalize the workspace (email, preferred display name) while preparing the UI for a real Supabase session + tiering model (`Guest`, `Pro`, `Institutional`).
3. Preserve the teaser experience: guests can search one tickers in the entire span of the account, but premium modules (verdicts, thesis evolution, scenario modeling, institutional data) remain blurred with clear unlock affordances inside `ReportCard`'s `LockedFeature` wrappers.
4. Track authentication state via Supabase-auth sessions persisted in the database (with a lightweight local cache for optimistic UI) so the dashboard, settings, and save/bookmark flows stay in sync across refreshes and devices.

## Non-Goals
- Building the backend auth service, including Supabase auth/schema work
- Authorizing API usage or billing tiers; the flow only differentiates Guest vs. signed-in user.
- Supporting password reset, MFA, or OAuth beyond the pre-existing "Sign in with Google" stub button.

## Personas & Core Jobs
- **Curious Guest Analyst**: lands on marketing site, runs a few teaser searches, gets prompted to create a free account when they try to bookmark or unlock blurred data.
- **Returning Pro User**: has already created a free account, expects quick access to dashboard and saved analyses from any device.
- **Enterprise Evaluator**: watches the demo modal, needs a low-friction way to create an account while context (`message` prop) reminds them what they unlock (settings, export, institutional data).

## User Stories
- As a guest, when I click "Sign In" on the landing nav or header, I see the modal in **sign-in mode** with password field and optional Google SSO so I can access my saved reports.
- As a guest, when I interact with a locked module or bookmark button, I see **create-account mode** with teaser-specific copy so I understand that creating an account unlocks the content I just requested.
- As an authenticated user, when I log out, I return to the landing page and the modal no longer appears automatically.
- As a product owner, I can set contextual copy (via `authModalMessage`) for any gating surface so conversion intent stays high.

## Experience Architecture
### Entry Points (all trigger `setIsAuthModalOpen(true)` in `App.tsx`)
1. **LandingPage nav button** (`components/LandingPage.tsx`): Shows `Sign In` CTA → opens modal in sign-in mode (no message prop).
2. **Dashboard header** (`components/Header.tsx`): Displays `Sign In` pill for guests; same behavior as landing nav.
3. **Report gating**: Any `LockedFeature` or bookmark action while unauthenticated calls `handleOpenAuth()` → sets `authModalMessage = "Unlock full access to Ultramagnus."`, so modal defaults to create-account mode with CTA "Create Free Account".
4. **Demo modal footer CTA**: `Create Free Account` button uses the same handler as locked features.
5. **Settings access**: If a guest tries to open account settings, we override the message to `"Please sign in to configure account settings."` to push them toward sign-in mode.

### Modal Behavior (`components/AuthModal.tsx`)
- Two stacked states toggled by `isLoginMode`. Initial mode is derived from whether a contextual `message` is passed (message → default to create-account mode to emphasize unlock messaging).
- Shared form fields: email + password, both required with inline icons (Mail, Lock). Inputs use dark theme consistent with dashboard.
- Primary action label changes with mode (`Sign In` vs. `Create Free Account`). CTA disabled until both fields have values; spinner displayed during simulated API call.
- Supporting CTA: mode toggle link below the form, e.g., "New to Moonshot? Create an account".
- Social login button (Google) only appears in sign-in mode, calling `onLogin` with a stubbed profile.
- Context banner: message string (if provided) renders under the title to explain why the modal appeared (unlock data, settings, etc.).

### Authentication State & Navigation (`App.tsx`)
- Successful login constructs a `UserProfile` (id, name, tier=`Pro`, joinDate) and persists it to `localStorage` under `ultramagnus_user`, then forces view mode to `DASHBOARD`.
- Logout clears that key and always returns the user to the landing page.
- The landing view auto-redirects to the dashboard if a user object is present on load.
- Guest usage counter (`ultramagnus_guest_usage`) tracks how often unauthenticated users run analyses; future experiments can use it to throttle or prompt sign-up after N searches.
- Custom API key support: if `ultramagnus_user_api_key` exists, teaser restrictions lift even for guests; the modal should eventually surface API-key linkage post-auth.

## Functional Requirements
1. **Form Validation**
   - Email must include `@` and domain (basic regex acceptable until Supabase integration).
   - Password cannot be empty; we do not enforce strength yet but plan to require ≥8 chars when backend hooks up.
   - Submit button remains disabled until both fields pass validation; error copy sits below the respective field.
2. **Loading & Success States**
   - Show inline spinner for ~1.5s to mimic network call; on success the modal closes, dashboard updates with user name initial in header, and any open demo modal closes.
3. **Messaging Logic**
   - Default copy for create-account mode: "Create a free account to continue analyzing." (already present).
   - When `authModalMessage` is set (e.g., "Unlock full access to Ultramagnus."), display it verbatim and route the initial view to create-account mode.
   - Provide a string table in code to reuse curated messages for each trigger.
4. **Teaser Gate Hooks**
   - `ReportCard` should call `onUnlock` for every locked block, which opens the modal with unlock copy.
   - Bookmark/save buttons while logged out must also open the modal rather than silently failing.
5. **State Synchronization**
   - Update header (`Header.tsx`) to reflect `user.tier` badge, `Saved Reports` count, and dropdown actions immediately after login or logout.
   - Ensure `AccountSettingsPage` only mounts when `user` is defined; otherwise, intercept with the modal.
6. **Analytics (future)**
   - Instrument `AuthModal` open events with `context` (landing-nav, header, lock, settings) and `initialMode`.
   - Instrument `AuthModal` submit attempts, success, errors, and toggle interactions.

## UX & Visual Guidelines
- Modal sits centered on a blurred slate backdrop,  max-width ~384px, 24px padding to align with rest of product.
- Title stack icon uses Rocket glyph inside indigo badge (already implemented). Maintain this to reinforce brand.
- Keep copy concise (<80 chars) so it fits on two lines maximum.
- Buttons use existing gradients (#4F46E5-#9333EA) for primary actions; use slate backgrounds for secondary.
- Mobile: ensure modal width respects viewport minus 32px padding and inputs remain easily tappable (min height 44px).

## Data & Storage Considerations
- `localStorage` keys in play: `ultramagnus_user`, `ultramagnus_library_v1`, `ultramagnus_guest_usage`, and optional `ultramagnus_user_api_key`, but they only serve as an optimistic cache while the authoritative login session is persisted by Supabase/Postgres.
- Supabase (`VITE_SUPABASE_URL` + anon key from `.env.local`) becomes the source of truth for authentication. Replace the fake timeout within `AuthModal` with Supabase auth calls that write session rows/tokens to the database and hydrate React state from that response on every launch.
- Local cache must be invalidated whenever Supabase expires the session (respect refresh tokens, revoke on logout) to prevent drift between UI and database state.
- User profile currently defaults to tier `Pro` upon login. The PRD assumes we will map tiers based on backend metadata later, but UI should remain flexible (badge is uppercase string, no special casing beyond color ramp).

## Edge Cases & Error Handling
- Missing internet / failed request: show toast or inline error message ("We couldn't reach Ultramagnus. Please retry.") and keep modal open with form enabled.
- Duplicate accounts: once Supabase is live, handle backend conflict errors by surfacing guidance like "Looks like you already have an account—try signing in instead." (For now, keep toggle link visible so users can self-correct.)
- Google SSO stub should display tooltip or toast noting that it currently uses demo credentials if backend OAuth is not wired up.
- If a user closes the modal without completing auth, the original action should remain blocked. Example: tapping bookmark while logged out → modal closes → bookmark still not saved, and locked copy persists.

## Success Metrics
- Modal conversion rate (unique modal opens → successful auth) segmented by trigger source.
- Share of locked-feature clicks that result in account creation within the same session.
- Reduction in guest users attempting to access Account Settings without logging in (should drop toward zero once messaging is clear).

## Dependencies & Future Work
- **Backend**: Supabase auth schema + tables for storing `UserProfile`, saved reports (currently in localStorage), and optional user API keys.
- **Design System**: Document the authentication modal pattern to re-use within other React surfaces (e.g., paywall overlays).
- **Security**: Replace placeholder password handling with secure hashing/token exchange; ensure `.env.local` never ships with real keys.

## Open Questions & Decisions
1. Should we cap guest analyses (e.g., prompt to create an account after 3 searches) using the existing `guestUsageCount` state?
   - **Decision:** Yes. Trigger the create-account modal after the third unauthenticated search to encourage conversion while still showcasing value.
2. Do we need email verification before granting full dashboard access once Supabase launches?
   - **Decision:** Yes for email + password signups (require verification email before unlocking settings/saves). Google SSO remains auto-verified because identity is handled upstream.
3. How will API key linking behave—does creating an account automatically provision a key, or do we prompt users to paste an existing key in Account Settings?
   - **Decision:** Defer. Skip automatic provisioning for the initial release and keep the feature on the backlog until we finalize the broader API distribution strategy.
4. Should Google SSO remain a single-click shortcut, or do we defer it until the Supabase OAuth config is ready?
   - **Decision:** Keep the single-click shortcut. Once Supabase OAuth is wired up, the existing button simply needs to point at the new provider configuration.

## Rollout Plan
1. **Finalize UI copy** for each entry point and confirm with design/PM.
2. **Instrument modal events** (temporary console logs or analytics hook) to gather baseline conversion data even before real auth.
3. **Implement backend auth** (separate effort) and swap the fake timeout with actual API calls.
4. **QA Scenarios**: landing sign-in, locked-feature create account, settings sign-in, Google stub, logout/login persistence, mobile layout.
5. **Document** the flow in `docs/` (this PRD) and reference it in future Supabase integration tasks.

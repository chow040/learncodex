# Ultramagnus Backend-for-Frontend (BFF) Architecture Spec

## 1. Goals
- Move auth, data aggregation, and LLM orchestration server-side to protect secrets, add rate limits, and improve reliability.
- Expose a stable API tailored for the React app (one client-facing contract), while allowing backend modules to evolve independently.
- Prepare for scale: caching, streaming responses, observability, and clean separation of concerns.

## 2. High-Level Design
- **Frontend (Vite/React)**: UI only. Calls BFF for auth, data fetch, and report generation. No direct Supabase/LLM/data API calls.
- **BFF (Node/TS, Fastify/Express)**: Single entrypoint for the UI. Modules: auth/session, user profile, data aggregation, report/LLM orchestration, telemetry.
- **Supabase/Postgres**: Source of truth for users/profiles/saved reports. BFF uses service key; RLS enforced per user. Frontend does not see keys.
- **External APIs**: Market data, news, LLM providers. Accessed only from BFF with server-held secrets.

Request flow (example: generate report):
1) Frontend calls `POST /api/reports` with ticker and options.
2) BFF verifies session, rate limits, fetches/caches market/news data, orchestrates LLM prompt, streams response via SSE.
3) BFF persists metadata (saved report) to Supabase and returns a client-friendly payload.

## 3. Auth & Session Model
- BFF uses Supabase service key to perform auth (email/password + OAuth). Frontend exchanges credentials with BFF; BFF handles Supabase interaction.
- BFF issues a short-lived session token (JWT or signed HTTP-only cookie). Refresh via backend endpoint.
- `user_profiles` table remains source for display name/tier. BFF reads/writes profiles; RLS ensures user-only access.
- Guest usage: tracked server-side; enforce 3-search prompt rule via BFF responses.

## 4. API Surface (initial)
- `POST /api/auth/signup` → { email, password, displayName } → sets session cookie; triggers verification email if required.
- `POST /api/auth/login` → { email, password } → sets session cookie.
- `POST /api/auth/logout` → clears session.
- `GET /api/auth/me` → returns profile and tier from Supabase.
- `POST /api/reports` → { ticker } → orchestrates data + LLM, streams via SSE; saves summary.
- `GET /api/reports` → list saved reports for user.
- `DELETE /api/reports/:id` → delete saved report.

## 5. Modules & Responsibilities
- **Auth Module**: Supabase service client, session issuance/validation, rate limiting per IP/user.
- **Profile Module**: CRUD on `user_profiles` (display name, tier), uses RLS.
- **Data Module**: Market/news fetchers with caching (memory/Redis-ready), retries/backoff.
- **LLM Module**: Prompt templates, safety checks, cost logging, retries, streaming responses.
- **Reports Module**: Orchestrates data + LLM, persists saved report metadata.
- **Telemetry**: Structured logging, request IDs, metrics hooks.

## 6. Caching & Rate Limits
- In-memory cache (initial) for hot market/news lookups; interface to swap to Redis.
- Rate limit middleware per IP/user/tier (lower limits for guests). Reject with 429 and friendly message.

## 7. Streaming
- Use SSE for long-running/LLM responses (`/api/reports`), with heartbeat to keep connection alive. Fallback to polling if needed.

## 8. Security & Secrets
- Secrets (Supabase service key, data API keys, LLM keys) live only in the BFF env (not in the client). Use `.env.example` to document required vars.
- CORS locked to frontend origin(s). HTTPS required in prod.
- Input validation on all endpoints (zod/yup) to prevent prompt injection and abuse.

## 9. Deployment
- Package as Node/TS service. Targets: Render/Fly/Vercel serverless/containers.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, data API keys, LLM keys, `SESSION_SECRET`, allowed origins.
- Apply Supabase migrations (`user_profiles`, saved reports when ready) before deploy.

## 10. Migration Plan
- Phase 1: Scaffold BFF with auth endpoints using Supabase service key; integrate session cookies.
- Phase 2: Frontend swaps to BFF auth endpoints; remove direct `supabase.auth.*` from client.
- Phase 3: Add report/data endpoints; frontend points report generation to BFF; remove client-side LLM calls.
- Phase 4: Add caching/rate limits/telemetry; optional Redis.

## 11. Open Decisions
- Session transport: HTTP-only cookie vs. bearer JWT (recommend cookies to reduce token leakage; CORS/same-site must be set).
- SSE vs. websockets for streaming (SSE recommended to start).
- Redis adoption timing (start in-memory, add Redis when needed).

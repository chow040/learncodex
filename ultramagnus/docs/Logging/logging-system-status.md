# Logging System Implementation Notes

## Backend (Ultramagnus BFF)
- Introduced structured logging with Winston (`src/utils/logger.ts`) emitting JSON with timestamps, levels, service metadata, correlation IDs, and user identifiers when available.
- Added middlewares:
  - `correlationIdMiddleware` to propagate `X-Request-ID` headers or generate UUIDs and mirror them in responses.
  - `requestLogger` to capture inbound/outbound HTTP events, response times, and status-aware log levels while avoiding sensitive payloads.
  - `errorHandler` to centralize error responses, attach correlation IDs, and capture stack traces without leaking PII.
- Created `bootstrapLog` helper so early-start modules (e.g., env loader) can still emit structured warnings before the main logger initializes.
- Updated `requireAuth` to enrich request logs with authenticated `userId`s so downstream entries remain traceable.
- Replaced previous `console.*` usage across routes with contextual logger calls that hash email addresses before logging.
- Server startup (`src/server.ts`) now logs readiness and captures `unhandledRejection` / `uncaughtException` events.

## Configuration
- New env vars: `LOG_LEVEL` (defaults to `debug` outside prod) and `SERVICE_NAME` (defaults to `backend-bff`). See `backend/.env.example` for usage.
- Request/response logs can be tailed via stdout; pipe to your log shipper of choice for aggregation.

## Verification
1. `cd backend && npm run dev` – invoke a few API endpoints and observe JSON logs in the terminal. Each entry should include `correlationId`, `path`, and `userId` (post-auth).
2. Hitting `/health` with or without `X-Request-ID` should echo the ID back in the response header and logs.
3. Trigger auth/AI errors to confirm `errorHandler` emits structured payloads plus correlation IDs.

> **Note:** `npm run build` currently fails because TypeScript requires either `.js` extensions on imports or `allowImportingTsExtensions` with `noEmit`. This pre-existing limitation affects the entire backend and was not addressed here; see TS errors for guidance if you plan to ship compiled artifacts.

## Next Steps
- Frontend logging utilities, error boundaries, and `X-Request-ID` propagation (Phase 2 of PRD).
- Wire backend logs into the chosen aggregation/alerting platform (CloudWatch/DataDog/etc.).
- Decide whether to accept `.ts` import rewrites or adjust the TypeScript build pipeline so production bundles can be generated.

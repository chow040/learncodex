# Streaming AI Assessment & Chat PRD

## Purpose
- Reduce perceived latency and avoid serverless timeouts by streaming model responses for full assessments and chat.
- Preserve UX fidelity: show partial output as it arrives; persist only complete, valid payloads.

## Scope (v1)
 - Stream `POST /api/ai/stream-report` (report generation) to the client; buffer end-to-end JSON for persistence after stream completes.
- Stream chat replies in `/api/chat`; render incremental assistant text while continuing to save turns after completion.
- Keep existing synchronous endpoints as fallback behind a feature flag.

## User Value
- Faster feedback (tokens appear quickly); fewer request timeouts on longer generations; clearer error states when streams fail.

## Constraints & Assumptions
- Vercel Free timeouts remain (~10s); streaming does not extend execution budget. Aim to keep streams < timeout or use client-side model calls.
- Parsing: assessment returns a single JSON report; chat returns plain text. Persist only after full payload is assembled/validated.
- Auth/ACL unchanged; ownership enforced on save.

## Functional Requirements
- Assessment:
  - Client initiates streaming request; receives token chunks and displays progressive text.
  - Client buffers full text; on stream end, parse JSON; on success, persist via existing save flow; on parse failure, show retry.
  - Stream error/abort: surface toast + retry CTA; do not persist partials.
- Chat:
  - Stream assistant tokens; render incrementally.
  - On stream end, persist full assistant message + latest user turn; enforce caps as today.
  - Stream error/abort: surface toast; do not persist partial assistant text.
- Feature flags to toggle streaming per endpoint (assessment/chat) and per environment.

## Non-Functional Requirements
- Performance: first token <1s when model responds; entire stream under serverless timeout or move to client-side call.
- Reliability: if streaming unavailable, fall back to non-streaming path.
- Security: API keys not exposed; if client-side model calls are used, proxy/sign requests.

## API/Integration Notes
- Assessment:
  - New streaming endpoint variant (or mode flag) returns chunked text/SSE. Client assembles and parses JSON at end; then calls `POST /api/reports` to save.
- Chat:
  - Streaming mode on `/api/chat` returns incremental assistant text; final payload includes messageId/sessionId for persistence.
- Logging: include correlationId, stream start/end, duration, and error cause (abort, parse_error, upstream_error).

## Risks & Mitigations
- Timeout on serverless: keep prompts small; consider client-side model call for long runs.
- Parse failures on assessment JSON: apply final cleanup before parse; if failure, show retry and do not save.
- Partial persistence: disable persistence until stream completes successfully.
- Complex UX states: add “streaming”/“failed” states and retries.

## Delivery Plan
- Backend: add streaming mode for assessment/chat routes; expose flags; ensure final buffering/parse/persist flow; update logging.
- Frontend: add streaming client helpers; incremental render; buffer and parse assessment JSON at end; persist via existing save; add error/retry UX.
- QA: stream success, stream error/abort, parse error, fallback to non-streaming.

# Streaming AI Assessment & Chat Tech Spec

Reference PRD: `docs/Smart Updates/streaming-prd.md`

## Scope & Objectives
- **Objective:** Reduce perceived latency and eliminate serverless timeouts for long-running AI tasks.
- **Key Features:**
    - Stream AI responses for Stock Reports (`/api/ai/stream-report` only; legacy `/api/aiassessment` removed).
    - Stream AI responses for Chat (`/api/chat/stream` in the same controller module).
    - Real-time UI feedback (progressive rendering).
    - Robust error handling and fallback mechanisms.
- **User Value:** Immediate feedback (<1s TTFT), higher success rate for complex reports, better visibility into the generation process.

## Architecture

### Backend (Node.js/Express)
- **Streaming Infrastructure:**
    - Utilize Vercel AI SDK or native Node.js `ReadableStream` for efficient streaming.
    - **Assessment Stream:** Stream raw text chunks to client. *Do not* attempt to parse JSON on the fly on the server (too complex/brittle).
    - **Chat Stream:** Stream text chunks directly.
    - **Transport Guardrails (post-merge fixes):**
        - Flush headers immediately after creating the stream so the client gets TTFT and avoids hanging connections.
        - Track whether any chunk was written; return `502` if the stream produced zero bytes to surface silent provider failures.
        - Log provider/model/request metadata on both success and failure for root-cause analysis.
        - All routes consolidated into `src/routes/ai.ts`; no duplicate controllers.
- **Controller Behavior (implementation outline in `src/routes/ai.ts`):**
    - Set headers early: `Content-Type: text/plain; charset=utf-8`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Transfer-Encoding: chunked`.
    - Construct Gemini messages with a single leading `user` message containing schema/system prompt in `contents`, followed by normalized history (merge consecutive same-role turns).
    - Start stream via SDK; immediately `res.flushHeaders()`; stream with `for await` to `res.write(chunk)`, increment `bytesWritten`.
    - On end: if `bytesWritten === 0` -> `res.status(502).end('Stream produced no content')`; else `res.end()`.
    - Errors: catch, log structured metadata (sessionId, requestId, model, ticker/reportId), and `res.status(500/502).end(message)`.
- **Persistence Strategy:**
    - **Assessment:** The *Client* is responsible for buffering the full stream, parsing the JSON, and then calling a separate `POST /api/reports/save` endpoint to persist the valid report. This offloads the timeout risk from the generation phase.
    - **Chat:** The *Server* can use `onFinish` callbacks (if using Vercel AI SDK) or a parallel "fire-and-forget" save operation once the stream completes, but the Client-side save pattern is safer for serverless limits. *Decision:* Hybrid. Stream to client. Client sends "save turn" request on completion to ensure data consistency with what was rendered.

### Frontend (React/Vite)
- **Client Clients:**
    - `StreamingClient`: A wrapper around `fetch` or `useChat` (Vercel AI SDK) to handle stream reading, decoding, and state updates.
    - Detects zero-length buffers at end-of-stream and surfaces an explicit error (prevents silent success on empty 200 responses).
- **State Management:**
    - **Report Generation:** `isStreaming`, `streamBuffer` (raw text), `parsedReport` (final object).
    - **Chat:** Optimistic UI updates as tokens arrive.
- **UX Components:**
    - `StreamingReportView`: Shows raw text or a "thinking" animation while buffering, then switches to the structured report view upon successful JSON parse.
    - `TypingIndicator`: Enhanced to show actual activity.

## Data Model & Schema

### Database (PostgreSQL/Drizzle)
No schema changes required for the streaming mechanism itself. The persistence endpoints (`/api/reports`, `/api/chat/save`) will use existing schemas.

## Logic & Algorithms

### 1. Assessment Streaming Flow (`POST /api/ai/stream-report`)
1.  **Client** sends request with `ticker`.
2.  **Server** validates request and initiates LLM stream (e.g., OpenAI `stream: true`).
3.  **Server** pipes chunks to response immediately and flushes headers once the stream object is ready.
4.  **Client** receives chunks and appends to `buffer`.
5.  **Stream Ends**:
    - **Client** attempts `JSON.parse(buffer)`.
    - **If Success:** Client calls `POST /api/reports` with the parsed JSON to save it to DB.
    - **If Fail:** Client triggers "Retry" UI (or attempts heuristic repair).

### 2. Chat Streaming Flow (`POST /api/chat/stream`)
1.  **Client** sends message history.
2.  **Server** streams assistant response.
3.  **Client** updates UI in real-time.
4.  **Stream Ends**:
    - **Client** calls `POST /api/chat/save` (or similar) to persist the conversation turn.

## API Design

### `POST /api/ai/stream-report`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "ticker": "NVDA"
  }
  ```
- **Response:**
  - **Headers:** `Content-Type: text/plain; charset=utf-8`, `Transfer-Encoding: chunked`
  - **Body:** Raw text stream of the generated JSON report. The client is responsible for buffering the stream and parsing the final JSON.

### `POST /api/chat/stream`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "report": {
      "companyName": "NVIDIA Corp",
      "ticker": "NVDA",
      "currentPrice": "135.50",
      "priceChange": "+2.5%",
      "verdict": "BUY",
      "rocketScore": 85,
      "summary": "...",
      "scenarioAnalysis": { ... },
      "shortTermFactors": { ... }
    },
    "reportId": "uuid-string",
    "messageHistory": [
      { "role": "user", "text": "Is this a good buy?" },
      { "role": "assistant", "text": "Yes, based on..." }
    ],
    "userNotes": "Optional user notes context",
    "userThesis": "Optional user thesis context"
  }
  ```
- **Response:**
  - **Headers:** `Content-Type: text/plain; charset=utf-8`, `Transfer-Encoding: chunked`
  - **Body:** Raw text stream of the assistant's response. The client should display chunks as they arrive.

## Implementation Plan

### Phase 1: Backend Streaming Foundation
1.  Install `ai` and `@ai-sdk/openai` (or similar) if not present, or implement raw `res.write` logic.
2.  **Merged**: Stream controllers now live in `src/routes/ai.ts`; `/api/ai/stream-report` replaces `/api/aiassessment`.
3.  Implement `streamChat` controller and ensure role normalization/merging for Gemini sequencing.
4.  Add structured logging (sessionId/requestId, ticker/reportId, model, duration, bytesWritten, success/error) to `app.log` and `ai_failures.jsonl`.

### Phase 2: Frontend Streaming Client
1.  Create `src/clients/streamingClient.ts`.
2.  Implement `fetchStream` utility to handle `ReadableStream` reading.
3.  Update `Dashboard.tsx` to use `streamingClient` for report generation.
4.  Update `ChatInterface.tsx` to use `streamingClient` for chat.

### Phase 3: Persistence & Error Handling
1.  Ensure `POST /api/reports` accepts a full JSON payload for saving (decouple generation from saving).
2.  Add JSON parsing/validation logic on the frontend before saving.
3.  Add "Retry" UI for failed streams or parse errors.

## Security & Limits
- **Timeouts:** Streaming response keeps the connection alive, bypassing the 10s Vercel function timeout (up to the hard limit, usually 60s-300s depending on plan).
- **Rate Limiting:** Apply standard rate limits to streaming endpoints.
- **Validation:** The `save` endpoint must strictly validate the user-submitted JSON to prevent tampering (since the client is now the "source of truth" for the generated content). *Mitigation:* Re-verify critical metrics or sign the payload if needed (for v1, standard schema validation is likely sufficient).

## Implementation Notes & Troubleshooting (Gemini Specifics)

### 1. Chat History Sequence Enforcement
The Gemini API strictly enforces an alternating `User` -> `Model` -> `User` message sequence.
- **Violation:** Sending `[User (System Context), User (History Start), ...]` causes immediate `400 Invalid Argument` errors.
- **Solution:**
    - Normalize all roles to `user` or `model`.
    - Put the system/schema instructions into the leading `user` message with a `contents` array and keep that as the first turn.
    - Iterate through the history. If a message has the same role as the previous one, **merge** its content into the previous message with a separator (e.g., `\n\n---\n\n`).
    - Ensure the sequence always starts with `User` (System Context) and ends with `User` (User's latest prompt).

### 2. Google GenAI SDK Iteration
The `@google/genai` SDK (v1+) handles streaming responses differently than previous versions.
- **Issue:** `result.stream` might be undefined or not iterable in the way documentation suggests for older versions.
- **Solution:**
    - Iterate the result object directly: `for await (const chunk of result)`.
    - **Safe Text Access:** The chunk's text content might be a method or a property depending on the specific response type. Use a safe accessor:
      ```typescript
      const text = typeof chunk.text === 'function' ? chunk.text() : chunk.text;
      ```

### 3. Model Selection
- **Recommended:** `gemini-3-pro-preview` or `gemini-1.5-flash`.
- **Avoid:** `gemini-1.5-flash-latest` alias if it proves unstable or resolves to a version incompatible with current SDK methods.

### 4. Streaming Transport Hardening
- Flush response headers immediately after creating the stream to avoid TTFT delays.
- Track whether any chunk is written; if none, return `502` so the client treats it as an error instead of parsing empty text.
- Log provider/model/request context on both success and failure for traceability.

## Delivery Plan Checklist

- [ ] **Backend**
    - [x] Install streaming dependencies (if needed).
    - [x] Create `POST /api/ai/stream-report`.
    - [x] Create `POST /api/chat/stream`.
    - [x] Ensure `POST /api/reports` exists and can save a provided report object.
- [ ] **Frontend**
    - [x] Create `StreamingClient` utility.
    - [x] Update `useReportGeneration` hook to support streaming.
    - [ ] Implement "Progressive Loading" UI for reports.
    - [ ] Update Chat UI to render stream.
- [ ] **QA**
    - [ ] Verify TTFT (Time To First Token) is < 1s.
    - [ ] Test with slow network conditions.
    - [ ] Test JSON parse errors (simulate malformed LLM output).

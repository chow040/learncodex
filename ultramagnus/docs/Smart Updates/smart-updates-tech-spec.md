# Smart Updates & Delta Reports Tech Spec

Reference PRD: `docs/Smart Updates/smart-updates-prd.md`

## Scope & Objectives
- Implement an intelligent caching and re-assessment layer for stock analysis reports.
- Prevent redundant API costs for "sanity checks" (low volatility, short timeframe).
- Automatically trigger "Delta Reports" when significant market events (volatility > 5%, earnings) occur.
- Provide frontend UX for "Volatility Insights" and "Thesis Pivots".
- User value: save credits/time and reduce confusion from AI variability by serving deterministic cached responses when nothing material changed.

## Architecture

### Backend (Node.js/Express)
- **New Service:** `SmartUpdateService` (`src/services/smartUpdateService.ts`)
    - Responsible for deciding whether to serve a cached report or generate a new one.
    - Fetches real-time price/news *before* calling the heavy LLM generation.
- **Modified Endpoint:** `POST /api/ai/generate` (or equivalent report generation route)
    - Intercepts the request to check for existing reports for the same `ticker` + `userId`.
    - Implements the "Traffic Controller" logic.

### Frontend (React/Vite)
- **New Components:**
    - `VolatilityCard.tsx`: Displays "Green Pulse" or "Red Warning" alerts.
    - `ThesisPivotModal.tsx`: Displays side-by-side comparison for major thesis changes.
- **State Management:**
    - Update report fetching logic to handle "cached" vs "new" responses.
    - Handle `delta` metadata in the report response.

## Data Model & Schema

### Database (PostgreSQL/Drizzle)
- Keep existing `reports` schema; store Smart Update data in `metadata` JSONB. Add index on `(owner_id, ticker, created_at DESC)` for fast latest lookup.
- **Report Metadata Additions:**
    ```typescript
    interface ReportMetadata {
      // ... existing fields
      deltaContext?: {
        trigger: 'volatility' | 'earnings' | 'news' | 'manual';
        previousReportId?: string;
        priceChangePercent?: number;
        direction?: 'up' | 'down';
        previousVerdict?: string;
        previousScore?: number;
      };
      momentumScore?: number;
      momentumInputs?: {
        returns: { d1: number; d5: number; d20: number };
        volumeZ?: number;
        newsSentiment?: number;
      };
      isCachedResponse?: boolean; // virtual in API responses
    }
    ```
- **Conversations:** Link chat messages to `report_id` (not just `ticker`) to keep history versioned. Retain ~20 reports per ticker or 90 days to support the timeline UX.

## Logic & Algorithms (The "Traffic Controller")

The `SmartUpdateService.evaluateRequest(ticker, userId)` method will execute the following logic:

1.  **Fetch Last Report:** Get the most recent report for `ticker` + `userId`.
2.  **Fetch Live Data:** Get current price and active news flags (e.g., "Earnings Today").
3.  **Calculate Delta:**
    - `timeDiff = Now - LastReport.createdAt`
    - `priceDiff = abs((CurrentPrice - LastReport.price) / LastReport.price)`
4.  **Concurrency guard:** per `userId + ticker` lock to prevent duplicate generation on rapid repeat requests.

### Decision Matrix

| Scenario | Condition | Action | UX Outcome |
| :--- | :--- | :--- | :--- |
| **Sanity Check** | `timeDiff < 24h` AND `|priceDiff| < 3%` AND `!SignificantNews` | **SERVE_CACHE** | Show existing report with updated price header. |
| **Intraday Shock (Down) / Upside Spike** | `timeDiff < 24h` AND `|priceDiff| >= 5%` | **FORCE_RERUN** | Generate new report with `volatilityContext`. Show **Volatility Card** (green for stable thesis, red for downgrade/weak momentum; upside copy highlights momentum surge). |
| **News Break** | `timeDiff < 24h` AND `SignificantNews` | **FORCE_RERUN** | Generate new report. Inject `newsContext`. Highlight catalyst. |
| **New Cycle** | `24h <= timeDiff <= 7d` AND (`Earnings` OR `SignificantNews`) | **FORCE_RERUN** | Generate new report. Compare with previous. Show **Thesis Pivot** if verdict/score moved materially. |
| **Quiet Revisit** | `24h <= timeDiff <= 7d` AND `|priceDiff| < 3%` AND `!SignificantNews` | **SERVE_CACHE** with stale banner and optional **Refresh** CTA | Standard. |
| **Stale** | `timeDiff > 7d` | **FRESH_RUN** | Treat as new report. |
| **Manual Override** | `forceRefresh == true` | **FORCE_RERUN** | Respect per-ticker lock; otherwise fresh generation. |

### News Analysis Logic (The "News Trigger")

To determine if a new report is required based on news, we employ a **"New & Significant"** filter rather than a deep semantic comparison of old vs. new content.

**Source order:** Prefer Finnhub free tier for ticker-scoped headlines (stable timestamps); fallback to Yahoo Finance RSS or Google News search if unavailable.

**Algorithm:**
1.  **Fetch:** Retrieve the latest 10 news items for the ticker from the News API.
2.  **Filter by Time:** Discard any articles published *before* `LastReport.createdAt`.
    - `NewArticles = AllArticles.filter(a => a.publishedAt > LastReport.createdAt)`
3.  **Filter by Significance (Heuristic):**
    - If `NewArticles.length == 0` -> **No Trigger**.
    - If `NewArticles.length > 0`, check for **Impact Keywords** in headlines:
        - *Keywords:* "Earnings", "Guidance", "Merger", "Acquisition", "CEO", "CFO", "Resigns", "Appointed", "FDA", "Approval", "Lawsuit", "Settlement", "Contract", "Partnership", "Bankruptcy", "Default".
    - **LLM Verification (Optional/Advanced):**
        - If a keyword match is found, or if `NewArticles.length > 3`, send headlines to a fast LLM (Gemini Flash).
        - *Prompt:* "Given the last report summary: '{LastReport.summary}', do these new headlines '{Headlines}' represent a material change in the investment thesis? Answer YES/NO."
4.  **Decision:**
    - If `SignificantNews == true` -> **FORCE_RERUN**.
    - The `deltaContext` will include the `breakingNews` items to guide the new report generation.

## API Design

### `POST /api/reports/generate`

**Request Body:**
```json
{
  "ticker": "NVDA",
  "forceRefresh": false // User can manually bypass the cache
}
```

**Response Payload (Enhanced):**
```json
{
  "report": { ... }, // The full report object
  "meta": {
    "isCached": true,
    "delta": {
      "type": "volatility",               // earnings | news | manual
      "trigger": "price_drop",            // price_drop | price_spike | news
      "direction": "down",                // up | down
      "change": -0.08,                    // -8%
      "message": "Market Overreaction Detected",
      "previousReportId": "uuid"
    }
  }
}
```
- **Headers:** `x-cache: hit|miss`.

### `GET /api/reports/:ticker/history`
- Query: `limit` (default 20), `cursor` for pagination.
- Response (desc by createdAt): array of `{ id, createdAt, verdict, rocketScore, momentumScore, priceAtReport, deltaTrigger }`.

### `GET /api/reports/:id/delta`
- Query: `compareTo` (optional `previousId`; default = immediate predecessor).
- Response: `{ verdictChange, rocketScoreDelta, momentumDelta, priceChangePercent, keyDrivers, previousSummary }`.

### Errors / guardrails
- 429 or 409 if a per-user+ticker lock is in-flight; `forceRefresh=true` bypasses cache selection but still respects the lock to avoid duplicate generations.

## Implementation Plan

### Phase 1: Backend Logic (The Brain)
1.  Create `SmartUpdateService`.
2.  Implement `getLastReport(userId, ticker)`.
3.  Implement `getRealTimeData(ticker)` (mock or connect to financial API).
4.  Implement the Decision Matrix logic.
5.  Update the generation controller to use this service.

### Phase 2: Prompt Engineering (The Analyst)
1.  Update the LLM System Prompt to accept `deltaContext`.
2.  "You are analyzing a stock that has dropped 8% since your last report. Focus on: Is this a falling knife?"
3.  "You are re-evaluating after earnings. Compare against your previous verdict of BUY."

### Phase 3: Frontend Components (The Face)
1.  Create `VolatilityCard` component (Green/Red variants).
2.  Create `ThesisPivotModal` component.
3.  Update the Dashboard/Report view to render these conditionally based on `report.meta.delta`.

## Security & Limits
- **Rate Limiting:** "Sanity Checks" (cached) do not count against strict generation limits, but "Force Reruns" do.
- **User Tier:** Premium users get tighter volatility thresholds (e.g., alert at 3% instead of 5%).

## Delivery Plan Checklist

- [ ] **Backend: SmartUpdateService**
    - [ ] Scaffold `src/services/smartUpdateService.ts`
    - [ ] Implement `getLastReport` query
    - [ ] Implement `evaluateRequest` logic (Decision Matrix)
    - [ ] Mock `getRealTimeData` for development
- [ ] **Backend: API Integration**
    - [ ] Update `POST /api/ai/generate` to use `SmartUpdateService`
    - [ ] Ensure `deltaContext` is passed to LLM service
    - [ ] Update `ReportMetadata` type definition
- [ ] **AI/Prompts**
    - [ ] Update System Prompt to handle `deltaContext`
    - [ ] Test "Falling Knife" scenario generation
    - [ ] Test "Thesis Pivot" scenario generation
- [ ] **Frontend: Components**
    - [ ] Create `VolatilityCard` (Green/Red variants)
    - [ ] Create `ThesisPivotModal`
    - [ ] Add "Refresh" button with `forceRefresh` flag
- [ ] **Frontend: Integration**
    - [ ] Update `ReportView` to display Volatility Cards
    - [ ] Handle `isCached` toast/notification
- [ ] **QA & Polish**
    - [ ] Verify "Sanity Check" (cache hit) speed (<500ms)
    - [ ] Verify "Volatility Alert" triggers correctly

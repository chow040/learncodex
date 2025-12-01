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
No major schema changes required, but we will utilize the `reports` table's `metadata` JSONB column to store delta context.

**Report Metadata Additions:**
```typescript
interface ReportMetadata {
  // ... existing fields
  deltaContext?: {
    trigger: 'volatility' | 'earnings' | 'news' | 'manual';
    previousReportId?: string;
    priceChangePercent?: number;
    previousVerdict?: string;
    previousScore?: number;
  };
  isCachedResponse?: boolean; // Virtual field for API response, not necessarily DB
}
```

## Logic & Algorithms (The "Traffic Controller")

The `SmartUpdateService.evaluateRequest(ticker, userId)` method will execute the following logic:

1.  **Fetch Last Report:** Get the most recent report for `ticker` + `userId`.
2.  **Fetch Live Data:** Get current price and active news flags (e.g., "Earnings Today").
3.  **Calculate Delta:**
    - `timeDiff = Now - LastReport.createdAt`
    - `priceDiff = abs((CurrentPrice - LastReport.price) / LastReport.price)`

### Decision Matrix

| Scenario | Condition | Action | UX Outcome |
| :--- | :--- | :--- | :--- |
| **Sanity Check** | `timeDiff < 24h` AND `priceDiff < 3%` | **SERVE_CACHE** | Show existing report with updated *current price* header. |
| **Intraday Shock** | `timeDiff < 24h` AND `priceDiff > 5%` | **FORCE_RERUN** | Generate new report. Inject `volatilityContext`. Show **Volatility Card**. |
| **New Cycle** | `timeDiff > 24h` AND (`Earnings` OR `News`) | **FORCE_RERUN** | Generate new report. Compare with old. Show **Thesis Pivot** if verdict changes. |
| **Stale** | `timeDiff > 7 days` | **FRESH_RUN** | Treat as new report. |

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
      "type": "volatility",
      "trigger": "price_drop",
      "change": -0.08, // -8%
      "message": "Market Overreaction Detected"
    }
  }
}
```

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

# Product Requirements Document: Ticker Command Center

## 1. Overview
The **Ticker Command Center** is a new dedicated screen (`/ticker/:symbol`) that serves as the "Asset Home." It shifts the user's mental model from reading static, isolated reports to monitoring a living asset with an evolving narrative.

## 2. Problem Statement
*   **Fragmented Context:** Currently, users view reports as individual files. To see how a thesis has changed, they must open multiple reports and manually compare them.
*   **Missing Narrative:** "Smart Updates" generate alerts, but there is no central place to view the history of these updates alongside price action.
*   **Static vs. Dynamic:** Users cannot easily correlate their AI's past predictions (Verdicts) with actual market performance (Price History).

## 3. Goals
*   **Centralize History:** Aggregate all reports, updates, and alerts for a specific ticker in one view.
*   **Visualize Conviction:** Show how the AI's confidence (Moonshot Score) and Verdict have trended against the stock price.
*   **Highlight Change:** Focus on the *deltas* (what changed?) rather than just restating static data.

## 4. User Experience (UX)

### 4.1 Entry Points
*   **Dashboard:** Clicking a ticker symbol card.
*   **Report Card:** Clicking "View History" or the Ticker Header.
*   **Smart Update Notification:** Clicking "View Timeline" on an alert.

### 4.2 Screen Layout (`/ticker/:symbol`)

#### A. Hero Section: Price vs. Conviction Chart
*   **Visual:** A large interactive line chart showing the stock price over the last 6-12 months.
*   **Overlays:**
    *   **Verdict Markers:** Colored dots plotted on the specific dates where a report was generated.
        *   🟢 **Green:** BUY
        *   🟡 **Yellow:** HOLD
        *   🔴 **Red:** SELL
    *   **Interaction:** Hovering over a dot displays a tooltip with the "Snapshot" (Date, Verdict, Moonshot Score, Headline).

#### B. The Thesis Stream (Vertical Timeline)
Located below the chart, this is a reverse-chronological feed of the asset's narrative.

*   **Item Types:**
    1.  **Full Report:** "Deep Dive Analysis generated."
    2.  **Smart Update:** "News Trigger: CEO Resignation."
    3.  **Price Alert:** "Volatility Warning: -5% drop."
*   **Diff-View Content:**
    *   Instead of showing the full text, show the *changes*.
    *   *Example:* "Target Price: $150 ➔ $180 (+20%)"
    *   *Example:* "Moat Score: 65 ➔ 75 (Patent Approved)"
*   **Action:** Clicking an item opens the full content (Report Card or Alert Detail).

#### C. Sidebar: Scorecard Evolution
*   **Sparklines:** Small trend lines for key metrics.
    *   Moonshot Score (0-100)
    *   Financial Health
    *   Growth Rating
*   **Purpose:** Quick visual check—is the fundamental quality improving or deteriorating?

## 5. Technical Requirements

### 5.1 API Endpoints
*   `GET /api/ticker/:symbol/timeline`: Returns a merged list of Reports and Smart Updates, sorted by date.
*   `GET /api/ticker/:symbol/price-history`: Returns daily OHLC data for the chart.

### 5.2 Frontend Components
*   **Chart Library:** Recharts or similar for the Price/Conviction overlay.
*   **Timeline Component:** Custom vertical list with "connector lines" to show continuity.

## 6. Success Metrics
*   **Retention:** Users who visit the Command Center return to the app more frequently.
*   **Depth of Analysis:** Users view an average of >2 historical reports per session when entering via the Command Center.

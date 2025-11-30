# Smart Updates & Ticker Timeline PRD

## 1. Overview
**Ultramagnus** is evolving from a static report generator into a dynamic, context-aware personal analyst. Currently, the system treats every analysis request as a standalone event. This PRD defines the "Smart Updates" architecture, which introduces a **Ticker Timeline** model. This allows the system to recognize repeat analysis requests and intelligently decide whether to serve a cached report, perform a "Smart Refresh," or trigger a full "Delta Analysis" based on market context.

## 2. Core Philosophy
*   **Context Awareness:** The system must "read the room." A -10% drop requires a different UI response than a flat day.
*   **The "Wow" Factor:** Don't just show data; provide insight. If a thesis changes, explicitly highlight the *delta*.
*   **Timeline over Snapshots:** A user's relationship with a stock is continuous. The UI should reflect a history of analysis, not just the latest file.

## 3. User Scenarios

### 3.1 The "Sanity Check" (Short Timeframe)
*   **Context:** User analyzes `NVDA` at 9:00 AM and again at 10:30 AM.
*   **User Intent:** "Did I miss something?" or "Is the market moving?"
*   **System Response:** Recognizes the recent report. Checks for volatility. If low volatility (<3%), serves the existing report with updated real-time price.
*   **User Value:** Saves credits/time; prevents confusion from AI randomness (temperature variations).

### 3.2 The "Intraday Shock" (Volatility Event)
*   **Context:** User analyzes `TSLA` at 9:00 AM. At 2:00 PM, `TSLA` drops -10%. User re-runs analysis.
*   **User Intent:** "Is this a crash or a discount?"
*   **System Response:** Detects >5% price deviation. Forces a re-run.
*   **UX Outcome:** Displays a "Volatility Insight" card (Green Pulse for "Buy Dip" or Red Warning for "Falling Knife").

### 3.3 The "New Cycle" (News/Earnings)
*   **Context:** User analyzes `AAPL` last week. Today, earnings are released. User re-runs analysis.
*   **User Intent:** "How does this news change the thesis?"
*   **System Response:** Time > 24h + Earnings Flag detected. Generates a new report and compares it to the previous one.
*   **UX Outcome:** Displays a "Thesis Pivot" modal if the verdict or score has materially changed.

## 4. Functional Requirements

### 4.1 The "Delta Logic" Engine
The system must evaluate three factors before generating/displaying a report:
1.  **Time:** Time since last analysis (`< 1h`, `1h-24h`, `> 24h`).
2.  **Volatility:** Price deviation from last report (`> 3%`, `> 5%`).
3.  **Thesis Shift:** (Post-generation) Did the Verdict or Rocket Score change significantly?

**Logic Matrix:**
| Time Since Last | Volatility | Action | UX Mode |
| :--- | :--- | :--- | :--- |
| < 1 Hour | Any | Show Cached | Standard (Refresh Price) |
| 1h - 24h | < 3% | Show Cached | Standard (Refresh Price) |
| 1h - 24h | > 5% | **Force Re-run** | **Volatility Insight** |
| > 24 Hours | Any | **Force Re-run** | **Delta Report** (if thesis changed) |

### 4.2 Momentum Score (New Metric)
*   **Definition:** A 0-100 score tracking the *rate of change* in sentiment and technical strength.
*   **Usage:** Used to detect "Falling Knife" scenarios (e.g., Fundamentals = Good, but Momentum = 20/100 -> "Wait for stabilization").
*   **Display:** Sparkline in the "History" section.

### 4.3 Conversation History
*   **Requirement:** Chat context must be scoped to the *specific report version*.
*   **Storage:** Messages are linked to `report_id`, not just `ticker`.
*   **UX:** When viewing a past report, the chat history for *that* session is loaded.

## 5. UX/UI Requirements

### 5.1 The "Volatility Insight" Cards
These cards appear at the top of the report *only* when significant intraday volatility (>5%) triggers a re-run.

*   **Scenario A: "Buy The Dip" (Green Pulse)**
    *   **Trigger:** Price Drop > 5% AND Thesis remains BUY.
    *   **Visual:** Green gradient border, pulsing icon.
    *   **Headline:** "📉 Market Overreaction Detected"
    *   **Insight:** "Despite the sell-off, fundamentals remain unchanged. The stock is now trading at a **25% discount** to our fair value model (previously 15%). This volatility appears to be technical/sector-driven rather than company-specific."
    *   **Action:** "Risk/Reward ratio has improved significantly."

*   **Scenario B: "Falling Knife" (Red Warning)**
    *   **Trigger:** Price Drop > 5% AND (Thesis downgrades OR Momentum < 40).
    *   **Visual:** Red gradient border, warning icon.
    *   **Headline:** "⚠️ Thesis Risk Alert"
    *   **Insight:** "This drop has breached critical technical support at $92. While fundamentals are stable, the **momentum score has collapsed (85 ➔ 40)**. Institutional distribution is detected."
    *   **Action:** "Do not catch the falling knife. Wait for stabilization above $88."

### 5.2 The "Thesis Pivot" Modal
This modal overlays the report when a major shift occurs after >24h.

*   **Trigger:** Verdict change (e.g., BUY -> HOLD) OR Rocket Score change > 15pts.
*   **Visual:** Glassmorphic overlay.
*   **Content:**
    > **⚠️ Thesis Pivot Detected**
    > Since your last analysis on **Nov 28**:
    > *   **Verdict:** Downgraded (BUY ➔ HOLD)
    > *   **Primary Driver:** "CEO Resignation announced this morning."
    > *   **Action:** "Re-evaluate position size."
    > [View Full Analysis]

### 5.3 Ticker Timeline
*   **Header:** Dropdown to switch between report versions (e.g., "Nov 30 (Latest)", "Nov 15").
*   **Visual:** Small sparkline showing Rocket Score evolution over time.

## 6. Technical Architecture

### 6.1 Database Schema Updates
*   **`reports` table:**
    *   Allow multiple rows per `ticker` + `owner_id`.
    *   Add `momentum_score` (int).
    *   Add `parent_report_id` (uuid, optional) to link revisions.
*   **`conversations` table:**
    *   Link to `report_id` instead of just `ticker`.

### 6.2 API Changes
*   `POST /api/reports`: Logic to check for existing recent reports before generating.
*   `GET /api/reports/:ticker/history`: Fetch timeline metadata.
*   `GET /api/reports/:id/delta`: Compare report `:id` with its predecessor.

## 7. Success Metrics
*   **Re-run Rate:** % of users who run the same ticker >1 time.
*   **Delta Engagement:** CTR on "View Comparison" elements.
*   **Trust Score:** User feedback on "Falling Knife" warnings.

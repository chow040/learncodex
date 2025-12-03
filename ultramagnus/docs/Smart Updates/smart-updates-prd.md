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
The system evaluates three factors before deciding cache vs. re-run:
1.  **Time:** Time since last analysis (`< 24h`, `24h-7d`, `> 7d`).
2.  **Volatility:** Absolute price deviation from last report (`< 3%`, `3-5%`, `> 5%`) with direction preserved for UX copy.
3.  **News/Earnings:** Significant news since the last report (see News Trigger below).

**Unified Logic Matrix (aligns with Tech Spec):**
| Scenario | Condition | Action | UX Mode |
| :--- | :--- | :--- | :--- |
| **Sanity Check** | `timeDiff < 24h` AND `|priceDiff| < 3%` AND `!SignificantNews` | **Serve Cached** with refreshed price header | Standard |
| **Intraday Shock (Down) / Upside Spike** | `timeDiff < 24h` AND `|priceDiff| >= 5%` | **Force Re-run** | **Volatility Insight** (Green Pulse for stable thesis / Red Warning for downgrade or weak momentum; upside spike copy highlights momentum surge) |
| **News Break** | `timeDiff < 24h` AND `SignificantNews` | **Force Re-run** | News-aware delta; show catalyst callout |
| **New Cycle** | `24h <= timeDiff <= 7d` AND (`Earnings` OR `SignificantNews`) | **Force Re-run** | **Thesis Pivot** if verdict/score moved materially |
| **Quiet Revisit** | `24h <= timeDiff <= 7d` AND `|priceDiff| < 3%` AND `!SignificantNews` | **Serve Cached** with stale banner and optional **Refresh** CTA | Standard |
| **Stale** | `timeDiff > 7d` | **Fresh Run** | Standard; treat as new report |
| **Manual Override** | `forceRefresh == true` | **Force Re-run** | Standard |

- **Per-ticker guardrail:** lock per `user+ticker` to prevent duplicate generation if two requests arrive concurrently.

#### News Trigger ("New & Significant")
1.  **Source:** Use Finnhub free tier headlines (stable timestamps, ticker-scoped, low-friction API key). If unavailable, fall back to Yahoo Finance RSS or Google News search as a temporary stopgap.
2.  **Fetch:** Latest 10 headlines post-`LastReport.createdAt`, in market-local timezone (respect after-hours).
3.  **Significance filter:** Impact keywords (`Earnings`, `Guidance`, `Merger`, `Acquisition`, `CEO`, `CFO`, `Resigns`, `Appointed`, `FDA`, `Approval`, `Lawsuit`, `Settlement`, `Contract`, `Partnership`, `Bankruptcy`, `Default`). If `NewArticles.length > 3` or keyword match, mark as candidate.
4.  **Optional LLM check:** Fast model verifies "material to thesis?" against last report summary.
5.  **Decision:** `SignificantNews = true` if keyword match OR LLM says YES. Passed to delta context for prompt conditioning.

### 4.2 Momentum Score (New Metric)
*   **Definition:** 0-100 composite tracking *rate of change* across price, volume, and news sentiment (50/20/30 weighting).
*   **Inputs:**
    *   Price momentum: normalized blend of 1d, 5d, 20d returns, capped to +/-10% to avoid single-candle extremes.
    *   Volume/volatility: 20d volume z-score plus ATR change vs. 20d average.
    *   News sentiment delta: headline sentiment vs. prior 7d baseline (fast model or heuristic).
*   **Calculation:** Scale inputs to -1..1, apply weights, map to 0-100 (50 = neutral), smooth with a 3-sample EMA. Persist the value and input snapshot in `report.metadata` for reproducible history.
*   **Thresholds:** `<= 40` triggers "Falling Knife" risk; `>= 70` signals strong momentum; delta > 30pts since last report is treated as a material shift.
*   **Display:** Sparkline in the "History" section, with tooltips showing component contributions.

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

## 6. Success Metrics
*   **Re-run Rate:** % of users who run the same ticker >1 time.
*   **Delta Engagement:** CTR on "View Comparison" elements.
*   **Trust Score:** User feedback on "Falling Knife" warnings.

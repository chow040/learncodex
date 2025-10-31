# Frontend Integration Plan - Simulation (Paper Trading) Display

## 🎯 Assessment

### Current State

#### Backend (Python Auto-Trade Service)
✅ **Existing:**
- Portfolio endpoint: `GET /api/autotrade/v1/portfolio`
- Returns `AutoTradePortfolioSnapshot` with positions, decisions, events
- Simulation data stored in `logs/simulation_state.json`
- `fetch_latest_portfolio()` already checks `simulation_enabled` flag
- Returns simulated data when enabled

#### Frontend (React)
✅ **Existing:**
- `AutoTradingDashboard` component displays portfolio data
- `useAutoTradingPortfolio` hook fetches from `/api/autotrade/v1/portfolio`
- Real-time updates via React Query (30s stale time)
- UI shows: equity, PnL, positions, decisions
- Toggle for "Paper mode" (currently just UI state)

### Gap Analysis

| Feature | Backend Status | Frontend Status | Gap |
|---------|---------------|-----------------|-----|
| Simulation data API | ✅ Implemented | ✅ Consuming | ❌ No mode indicator |
| Mode display (paper/live) | ✅ Returns in snapshot | ✅ Shows badge | ⚠️ Not connected to actual mode |
| Trade log history | ❌ Not exposed | ❌ Not shown | 🔴 Missing |
| Performance metrics | ✅ In state file | ❌ Not shown | 🔴 Missing |
| Simulation controls | ❌ No endpoints | ❌ No UI | 🔴 Missing |
| Export functionality | ✅ CLI script only | ❌ Not accessible | 🔴 Missing |

## 📋 Integration Plan

### Phase 1: Connect Existing UI to Simulation (Quick Win) ⚡

**Goal:** Make the current dashboard show simulation data automatically when simulation mode is enabled.

**Tasks:**

1. **✅ Already Working!**
   - The `/portfolio` endpoint already returns simulation data when `AUTOTRADE_SIMULATION_ENABLED=true`
   - Frontend already calls this endpoint
   - **No code changes needed** - just enable simulation mode!

2. **Fix Mode Display** (5 minutes)
   - Update `mode` field in `simulated_to_snapshot()` to return `"Simulation"` or `"Paper Trading"`
   - Frontend will automatically show correct badge

3. **Add Simulation Indicator** (10 minutes)
   - Add visual indicator when viewing simulation data
   - Show simulation state file path in UI
   - Add timestamp of last state update

**Effort:** ~15 minutes  
**Value:** Immediate visibility into simulation portfolio

---

### Phase 2: Enhanced Simulation API Endpoints (Backend) 🔧

**Goal:** Expose simulation-specific data and controls via API.

#### New Endpoints

```python
# 1. Get full simulation state (including trade log)
GET /api/autotrade/v1/simulation/state
Response: {
  "simulation": {
    "portfolio_id": "simulation",
    "mode": "active",
    "starting_cash": 10000.0,
    "current_cash": 9500.0,
    "equity": 10000.0,
    "total_pnl": 0.0,
    "total_pnl_pct": 0.0,
    "positions": [...],
    "trade_log": [...]  // Full history
    "created_at": "2025-10-31T00:00:00",
    "updated_at": "2025-10-31T12:00:00"
  }
}

# 2. Get trade history with filtering
GET /api/autotrade/v1/simulation/trades?symbol=BTCUSDT&limit=50
Response: {
  "trades": [
    {
      "timestamp": "2025-10-31T12:00:00",
      "symbol": "BTCUSDT",
      "action": "BUY",
      "price": 50000.0,
      "quantity": 0.01,
      "realized_pnl": 0.0,
      "reason": "High confidence setup"
    }
  ],
  "total": 150
}

# 3. Get performance metrics
GET /api/autotrade/v1/simulation/metrics
Response: {
  "metrics": {
    "total_trades": 45,
    "winning_trades": 28,
    "losing_trades": 17,
    "win_rate": 62.2,
    "avg_win": 150.50,
    "avg_loss": -80.25,
    "profit_factor": 1.87,
    "sharpe_ratio": 0.0,  // TODO
    "max_drawdown": 0.0,  // TODO
    "total_return_pct": 5.5
  }
}

# 4. Reset simulation (dangerous)
POST /api/autotrade/v1/simulation/reset
Body: { "starting_cash": 10000.0 }
Response: { "status": "reset", "new_portfolio_id": "simulation_2" }

# 5. Export trades (download CSV)
GET /api/autotrade/v1/simulation/export?format=csv
Response: CSV file download
```

**Implementation Steps:**

1. Create `src/autotrade_service/api/simulation_routes.py`
2. Add route handlers using existing `load_state()` function
3. Calculate metrics from trade log
4. Register routes in main API router
5. Add response models/types

**Effort:** ~3-4 hours  
**Value:** Complete simulation data access

---

### Phase 3: Frontend Simulation Dashboard Components 🎨

**Goal:** Create dedicated UI for viewing simulation data.

#### New Components

**1. `SimulationModeIndicator.tsx`**
```tsx
// Visual badge showing simulation is active
// Shows state file location, last update time
// Warning if state file is old (stale data)
```

**2. `SimulationTradeLog.tsx`**
```tsx
// Table showing all trades with:
// - Timestamp, Symbol, Action, Price, Qty, PnL, Reason
// - Filtering by symbol, action, date range
// - Pagination
// - Sort by timestamp, PnL, symbol
// - Export to CSV button
```

**3. `SimulationMetrics.tsx`**
```tsx
// Performance dashboard with cards:
// - Total Trades, Win Rate, Profit Factor
// - Avg Win/Loss, Best/Worst Trade
// - Equity curve chart
// - Drawdown chart
// - PnL distribution histogram
```

**4. `SimulationControls.tsx`**
```tsx
// Control panel:
// - Reset simulation (with confirmation)
// - Export trades (CSV/JSON)
// - Adjust settings (starting cash, slippage)
// - Pause/Resume automation
```

**5. `SimulationPositionDetail.tsx`**
```tsx
// Enhanced position view showing:
// - Entry/Current price with change
// - Stop-loss and take-profit levels (visual)
// - Unrealized PnL (number and %)
// - Exit plan visualization
// - Position history (all trades for this symbol)
```

#### Page Updates

**Update `AutoTradingDashboard.tsx`:**
```tsx
// Add simulation-specific section when mode === "Simulation"
{portfolio.mode === "Simulation" && (
  <>
    <SimulationModeIndicator />
    <SimulationMetrics />
    <SimulationTradeLog />
    <SimulationControls />
  </>
)}
```

**Effort:** ~8-12 hours  
**Value:** Complete simulation monitoring UI

---

### Phase 4: Real-Time Updates & Advanced Features ⚡

**Goal:** Live updates and advanced analytics.

#### Features

**1. WebSocket Integration** (Optional)
```python
# Backend: WebSocket endpoint for simulation updates
WS /api/autotrade/v1/simulation/stream

# Pushes updates when:
# - New trade executed
# - Position opened/closed
# - Stop-loss/take-profit triggered
# - Portfolio equity changes
```

**2. Historical Equity Curve**
```tsx
// Chart showing equity over time
// Extracted from trade log
// Shows drawdowns, wins, losses
```

**3. Trade Analysis**
```tsx
// Detailed analytics:
// - PnL by symbol
// - PnL by hour/day
// - Hold time distribution
// - Entry/exit price distribution
```

**4. Comparison View**
```tsx
// Compare multiple simulation runs
// Side-by-side metrics
// Different strategies
```

**Effort:** ~12-16 hours  
**Value:** Professional-grade simulation analytics

---

## 🚀 Quick Start Implementation (Phase 1)

### Step 1: Update Backend Mode Field (2 minutes)

File: `src/autotrade_service/simulation/manager.py`

```python
def simulated_to_snapshot(portfolio: SimulatedPortfolio) -> AutoTradePortfolioSnapshot:
    # ... existing code ...
    
    return AutoTradePortfolioSnapshot(
        portfolio_id=portfolio.portfolio_id,
        automation_enabled=True,
        mode="Paper Trading (Simulation)",  # ← Changed from "Simulation"
        # ... rest of fields ...
    )
```

### Step 2: Add Simulation Indicator Component (10 minutes)

File: `equity-insight-react/src/components/trading/SimulationBanner.tsx`

```tsx
import { AlertCircle, Database } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "../ui/alert"

interface SimulationBannerProps {
  mode: string
  lastUpdate?: string
}

export function SimulationBanner({ mode, lastUpdate }: SimulationBannerProps) {
  if (!mode.toLowerCase().includes("simulation") && !mode.toLowerCase().includes("paper")) {
    return null
  }

  return (
    <Alert className="border-amber-500/40 bg-amber-500/10">
      <AlertCircle className="h-4 w-4 text-amber-500" />
      <AlertTitle className="text-amber-500">Simulation Mode Active</AlertTitle>
      <AlertDescription className="text-amber-100/80">
        This is paper trading - no real money at risk. All positions and trades are simulated.
        {lastUpdate && (
          <span className="ml-2">
            <Database className="inline h-3 w-3 mr-1" />
            Last updated {new Date(lastUpdate).toLocaleString()}
          </span>
        )}
      </AlertDescription>
    </Alert>
  )
}
```

### Step 3: Add Banner to Dashboard (2 minutes)

File: `equity-insight-react/src/pages/AutoTradingDashboard.tsx`

```tsx
import { SimulationBanner } from "../components/trading/SimulationBanner"

// Inside render, after the header warnings:
<SimulationBanner mode={portfolio.mode} lastUpdate={portfolio.lastRunAt} />
```

### Step 4: Enable Simulation Mode (1 minute)

```bash
# In python-auto-trade/.env
AUTOTRADE_SIMULATION_ENABLED=true
AUTOTRADE_SIMULATION_STARTING_CASH=10000.0
```

### Step 5: Restart & Test

```bash
# Restart backend
cd /Users/chowhanwong/project/learncodex/python-auto-trade
PYTHONPATH=src uvicorn autotrade_service.main:app --reload

# Frontend should automatically show simulation data
# Visit: http://localhost:5173/auto-trading-dashboard
```

**Total Time:** ~15 minutes  
**Result:** Dashboard now shows live simulation data! ✨

---

## 📊 Timeline & Effort Estimate

| Phase | Effort | Value | Priority |
|-------|--------|-------|----------|
| Phase 1: Quick Connect | 15 min | ⭐⭐⭐⭐⭐ | 🔴 Do Now |
| Phase 2: API Endpoints | 3-4 hrs | ⭐⭐⭐⭐ | 🟡 This Week |
| Phase 3: UI Components | 8-12 hrs | ⭐⭐⭐⭐⭐ | 🟡 This Week |
| Phase 4: Advanced Features | 12-16 hrs | ⭐⭐⭐ | 🟢 Next Sprint |

**Total:** ~24-32 hours for complete implementation

---

## 🎯 Recommended Approach

### Option A: Minimal (Do Today) ⚡
- **Phase 1 only** (~15 minutes)
- Get simulation data showing immediately
- Add visual indicator
- **Perfect for:** Quick validation, immediate visibility

### Option B: Professional (This Week) 🚀
- **Phases 1-3** (~12-16 hours)
- Full simulation dashboard
- Trade history, metrics, controls
- Export functionality
- **Perfect for:** Production-ready simulation monitoring

### Option C: Complete (Next Sprint) 💎
- **All phases** (~24-32 hours)
- Real-time updates via WebSocket
- Advanced analytics
- Multiple simulation comparison
- **Perfect for:** Professional trading platform

---

## 🔧 Technical Decisions

### Data Flow

```
[Simulation State File] 
    ↓
[fetch_latest_portfolio()] → checks simulation_enabled
    ↓
[GET /api/autotrade/v1/portfolio] → returns snapshot
    ↓
[React Query useAutoTradingPortfolio] → fetches every 30s
    ↓
[AutoTradingDashboard] → renders UI
```

**✅ Already wired up! Just need to enable simulation mode.**

### State Management

- **React Query** for API data (already in place)
- **Local state** for UI controls
- **WebSocket** for real-time updates (Phase 4)

### Styling

- Use existing shadcn/ui components
- Match current dashboard theme
- Add amber/yellow accents for simulation mode
- Visual distinction from live trading

---

## 🚨 Important Considerations

### Security
- ⚠️ **Prevent confusion:** Clear visual distinction between paper/live
- ⚠️ **Reset protection:** Confirm before resetting simulation
- ⚠️ **Read-only by default:** Separate permissions for controls

### Performance
- Trade log can grow large → pagination required
- Equity curve calculation → cache in backend
- Real-time updates → throttle to prevent spam

### UX
- **Clear labeling:** Always show "SIMULATION" prominently
- **Export access:** Easy CSV download for analysis
- **Reset flow:** Backup before reset, confirm with typed text
- **Error handling:** Graceful degradation if simulation disabled

---

## 📝 Next Steps

### Immediate (Do Now)
1. ✅ Review this plan
2. ⚡ Implement Phase 1 (15 minutes)
3. 🧪 Test that simulation data shows in dashboard
4. 📸 Take screenshots to validate

### This Week
1. 🔧 Implement Phase 2 API endpoints
2. 🎨 Build Phase 3 UI components
3. 🧪 Test complete workflow
4. 📚 Update documentation

### Questions to Answer
- [ ] Do you want trade history visible immediately? (Phase 2/3)
- [ ] Need CSV export in UI or CLI is fine?
- [ ] Want real-time WebSocket updates? (Phase 4)
- [ ] Multiple simulation accounts/strategies?

---

## 💡 Bonus Features

### If you have extra time:

1. **Simulation Presets**
   - Quick start with $5K, $10K, $50K
   - Different risk profiles
   - One-click reset with preset

2. **Performance Badges**
   - Achievements (first profit, 10 trades, etc.)
   - Streak tracking
   - Leaderboard (if multiple users)

3. **Strategy Notes**
   - Add notes to trades
   - Tag trades with strategies
   - Search/filter by notes

4. **Backtesting Integration**
   - Replay historical data
   - Compare with actual market
   - What-if analysis

---

## ✅ Summary

**Good News:** 🎉 Your backend already supports simulation via the existing `/portfolio` endpoint!

**Quick Win:** Enable `AUTOTRADE_SIMULATION_ENABLED=true` and add a banner component (~15 min)

**Full Solution:** Add dedicated simulation API endpoints and UI components (~12-16 hours)

**Recommendation:** Start with Phase 1 today, then do Phases 2-3 this week for a complete solution.

Ready to implement? Let me know which phase you want to start with! 🚀

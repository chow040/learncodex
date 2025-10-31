# Evaluation Log Enhancement - Complete LLM Assessment Tracking

## Overview

Enhanced the simulation system to log **ALL LLM evaluations** (including HOLD decisions) to enable comprehensive assessment of the LLM's decision-making process. Previously, only executed trades (BUY/SELL) were logged, making it impossible to analyze how often the LLM decided to HOLD or what its reasoning was.

## Changes Made

### 1. New Data Structure: `EvaluationLogEntry`

**File**: `src/autotrade_service/simulation/state.py`

Added a new dataclass to track every LLM evaluation:

```python
@dataclass
class EvaluationLogEntry:
    """Represents a single LLM evaluation (including HOLD decisions)."""
    timestamp: datetime       # When the evaluation occurred
    symbol: str              # Asset symbol (BTC, ETH, etc.)
    action: str              # BUY, SELL, HOLD, CLOSE
    confidence: float        # LLM's confidence score (0.0-1.0)
    size_pct: float         # Position size percentage
    rationale: str          # LLM's reasoning for the decision
    price: float            # Market price at evaluation time
    executed: bool          # Whether this resulted in an actual trade
```

**Key Fields**:
- `executed`: Distinguishes between evaluations that led to trades vs. HOLD decisions
- `rationale`: Captures the LLM's reasoning for every decision (not just trades)
- `confidence`: Tracks confidence levels for all evaluations
- `price`: Records market conditions at evaluation time

### 2. Updated `SimulatedPortfolio`

**File**: `src/autotrade_service/simulation/state.py`

Added `evaluation_log` to the portfolio state:

```python
@dataclass
class SimulatedPortfolio:
    # ... existing fields ...
    trade_log: List[TradeLogEntry] = field(default_factory=list)
    evaluation_log: List[EvaluationLogEntry] = field(default_factory=list)  # NEW
```

**Storage**:
- `trade_log`: Still tracks executed trades (BUY/SELL/CLOSE with actual prices and PnL)
- `evaluation_log`: **NEW** - Tracks ALL LLM evaluations including HOLD decisions

### 3. Enhanced `SimulatedBroker`

**File**: `src/autotrade_service/simulation/broker.py`

Modified the `execute()` method to log every evaluation:

```python
def execute(self, decisions: List[DecisionPayload], market_snapshots: Dict[str, float]):
    for decision in decisions:
        # Log EVERY evaluation (BUY, SELL, HOLD, CLOSE)
        self.portfolio.evaluation_log.append(
            EvaluationLogEntry(
                timestamp=timestamp,
                symbol=symbol,
                action=action.value.upper(),
                confidence=decision.confidence or 0.0,
                size_pct=decision.size_pct or 0.0,
                rationale=decision.rationale or "",
                price=current_price,
                executed=False,  # Will be marked True if trade executes
            )
        )
        
        # Execute the action (BUY/SELL/CLOSE/HOLD)
        if action == DecisionAction.BUY:
            msg = self._execute_buy(decision, fill_price, timestamp)
            self._mark_evaluation_executed(symbol, timestamp)  # Mark as executed
```

**Flow**:
1. **Before execution**: Log the evaluation with `executed=False`
2. **If action is BUY/SELL/CLOSE**: Execute trade and mark `executed=True`
3. **If action is HOLD**: Keep `executed=False` (just an evaluation)

### 4. Updated Decision Display

**File**: `src/autotrade_service/simulation/manager.py`

Changed the decision log to pull from `evaluation_log` instead of `trade_log`:

**Before** (only trades):
```python
decisions = [
    AutoTradeDecision(...)
    for trade in portfolio.trade_log[-10:]  # Last 10 trades only
]
```

**After** (all evaluations):
```python
decisions = [
    AutoTradeDecision(
        id=f"sim-{eval_entry.timestamp.isoformat()}-{eval_entry.symbol}",
        symbol=eval_entry.symbol,
        action=eval_entry.action.lower(),  # buy, sell, hold
        size_pct=eval_entry.size_pct,
        confidence=eval_entry.confidence,
        rationale=eval_entry.rationale,
        ...
    )
    for eval_entry in portfolio.evaluation_log[-30:]  # Last 30 evaluations
]
```

**Changed**:
- Now shows last **30 evaluations** (was 10 trades)
- Includes **HOLD decisions** (not just BUY/SELL)
- Displays actual **confidence** and **size_pct** from LLM
- Shows LLM's **rationale** for every decision

## Benefits

### 1. **Complete Decision History**
Every 3-minute evaluation now appears in the Decision Log, whether it results in a trade or not.

**Example Timeline**:
```
00:00 - HOLD BTC (confidence: 65%, rationale: "Waiting for support confirmation")
00:00 - HOLD ETH (confidence: 70%, rationale: "Price consolidating")
03:00 - BUY BTC (confidence: 80%, rationale: "Breakout confirmed") ✓ Executed
03:00 - HOLD ETH (confidence: 60%, rationale: "Still consolidating")
06:00 - HOLD BTC (confidence: 75%, rationale: "Position maintained")
06:00 - SELL ETH (confidence: 85%, rationale: "Resistance rejected") ✓ Executed
```

### 2. **LLM Performance Analysis**
You can now analyze:
- **How often does the LLM decide to HOLD vs. trade?**
- **What confidence levels lead to actual trades?**
- **What are the common rationales for HOLD decisions?**
- **Is the LLM being too cautious or too aggressive?**
- **Does reasoning quality correlate with trade outcomes?**

### 3. **Better Debugging**
When a trade goes wrong, you can see:
- What the LLM was thinking in previous evaluations
- Why it decided to HOLD instead of exiting earlier
- Confidence trends leading up to the bad trade

### 4. **Comprehensive Audit Trail**
Every decision is logged with:
- Exact timestamp
- Market price at that moment
- LLM's confidence and reasoning
- Whether it resulted in action or not

## Data Storage

### Persistence
The `evaluation_log` is automatically saved to `logs/simulation_state.json`:

```json
{
  "portfolio_id": "simulation",
  "current_cash": 10000,
  "positions": {},
  "trade_log": [
    {"timestamp": "2025-10-31T10:00:00", "action": "BUY", "symbol": "BTC", ...}
  ],
  "evaluation_log": [
    {
      "timestamp": "2025-10-31T10:00:00",
      "symbol": "BTC",
      "action": "HOLD",
      "confidence": 0.65,
      "size_pct": 0.0,
      "rationale": "Waiting for support confirmation at $106,500",
      "price": 107343.50,
      "executed": false
    },
    {
      "timestamp": "2025-10-31T10:03:00",
      "symbol": "BTC",
      "action": "BUY",
      "confidence": 0.80,
      "size_pct": 10.0,
      "rationale": "Breakout confirmed with volume spike",
      "price": 107450.25,
      "executed": true
    }
  ]
}
```

## Frontend Display

The Decision Log in the Auto Trading Dashboard now shows:

### Before (only trades):
- ✅ BUY BTC @ $107,450
- ✅ SELL ETH @ $3,890

### After (all evaluations):
- 🔵 HOLD BTC (Conf: 65%) - "Waiting for support confirmation"
- 🔵 HOLD ETH (Conf: 70%) - "Price consolidating"
- ✅ BUY BTC (Conf: 80%) - "Breakout confirmed" **[EXECUTED]**
- 🔵 HOLD ETH (Conf: 60%) - "Still consolidating"
- 🔵 HOLD BTC (Conf: 75%) - "Position maintained"
- ✅ SELL ETH (Conf: 85%) - "Resistance rejected" **[EXECUTED]**

**Visual Indicators**:
- Gray badge for HOLD decisions
- Green/Red badges for BUY/SELL (executed)
- Confidence percentage displayed
- Full rationale visible

## Usage

### Testing the Enhancement

1. **Start the simulation backend**:
   ```bash
   cd python-auto-trade
   source venv/bin/activate
   PYTHONPATH=src uvicorn autotrade_service.main:app --reload
   ```

2. **Trigger evaluation manually**:
   ```bash
   curl -X POST http://localhost:8000/internal/autotrade/v1/scheduler/trigger
   ```

3. **View the evaluation log**:
   ```bash
   cat logs/simulation_state.json | jq '.evaluation_log'
   ```

4. **Check frontend**:
   - Navigate to Auto Trading Dashboard
   - Scroll to "Decision Log" section
   - You should now see HOLD decisions appear every 3 minutes

### Analyzing LLM Behavior

**Query examples**:
```bash
# Count HOLD vs. BUY/SELL decisions
jq '.evaluation_log | group_by(.action) | map({action: .[0].action, count: length})' logs/simulation_state.json

# Find low-confidence evaluations
jq '.evaluation_log[] | select(.confidence < 0.6)' logs/simulation_state.json

# See what led to a specific trade
jq '.evaluation_log[] | select(.symbol == "BTC" and .executed == true)' logs/simulation_state.json

# View all decisions for the last hour
jq '.evaluation_log[-20:]' logs/simulation_state.json
```

## Migration Notes

### Existing State Files
Old `simulation_state.json` files without `evaluation_log` will automatically work:
- The `from_dict()` method defaults to an empty list if `evaluation_log` is missing
- No manual migration needed

### Backward Compatibility
- `trade_log` is unchanged and still tracks executed trades
- All existing functionality continues to work
- New `evaluation_log` is additive, not replacing anything

## Future Enhancements

Possible improvements:
1. **UI Filters**: Toggle to show only HOLD or only executed trades
2. **Analytics Dashboard**: Charts showing HOLD vs. trade ratios over time
3. **Confidence Analysis**: Heatmap of confidence levels by symbol
4. **Rationale Search**: Search through LLM reasoning by keywords
5. **Export to CSV**: Download evaluation log for analysis in Excel/Python
6. **Performance Correlation**: Compare confidence levels with actual trade outcomes

## Summary

✅ **Before**: Decision log showed only executed trades (BUY/SELL)  
✅ **After**: Decision log shows ALL LLM evaluations (BUY/SELL/HOLD)

✅ **Result**: Complete visibility into LLM decision-making process  
✅ **Benefit**: Can now properly assess and tune LLM behavior  
✅ **Cadence**: Every 3-minute evaluation appears in the log  
✅ **Storage**: Persisted in `logs/simulation_state.json`

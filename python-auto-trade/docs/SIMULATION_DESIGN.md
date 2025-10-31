# Simulation Trading System - Design Documentation

## 📐 System Architecture

### Overview

The simulation trading system provides a **paper trading environment** that mimics real trading without financial risk. It operates alongside the production auto-trading service, sharing the same LLM decision pipeline but executing trades against simulated state instead of live exchange APIs.

### Design Philosophy

- **Transparent Integration**: Same API endpoints serve both live and simulation data
- **Feature Flag Control**: Single environment variable switches between modes
- **Minimal Code Impact**: Existing frontend works without modifications
- **State Persistence**: Simple JSON file storage for reliability and inspectability
- **Full Fidelity**: Accurate simulation of position management, PnL tracking, and exit triggers

---

## 🏗️ Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AUTO-TRADING SERVICE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ LLM Decision Pipeline (Shared)                                │  │
│  │ • Market data ingestion                                       │  │
│  │ • Technical indicator calculation                             │  │
│  │ • Deepseek LLM analysis                                       │  │
│  │ • Decision generation (BUY/SELL/HOLD/CLOSE)                  │  │
│  └────────────────┬─────────────────────────────────────────────┘  │
│                   │                                                  │
│                   ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Repository Layer (Switch Point)                               │  │
│  │                                                                │  │
│  │  fetch_latest_portfolio():                                    │  │
│  │    if simulation_enabled:                                     │  │
│  │      ├─> Load JSON state                                      │  │
│  │      └─> Return simulated snapshot                            │  │
│  │    else:                                                       │  │
│  │      ├─> Query PostgreSQL                                     │  │
│  │      └─> Return live snapshot                                 │  │
│  └────────────────┬─────────────────────────────────────────────┘  │
│                   │                                                  │
│       ┌───────────┴──────────────┐                                  │
│       ▼                           ▼                                  │
│  ┌─────────────┐         ┌──────────────┐                          │
│  │ SIMULATION  │         │ PRODUCTION   │                          │
│  │ MODE        │         │ MODE         │                          │
│  └─────────────┘         └──────────────┘                          │
│       │                           │                                  │
│       ▼                           ▼                                  │
│  ┌─────────────────┐    ┌────────────────┐                        │
│  │ simulation/     │    │ PostgreSQL DB  │                        │
│  │ • state.py      │    │ • portfolios   │                        │
│  │ • broker.py     │    │ • positions    │                        │
│  │ • persistence.py│    │ • trades       │                        │
│  │ • manager.py    │    │ • decisions    │                        │
│  └────────┬────────┘    └────────┬───────┘                        │
│           │                      │                                  │
│           ▼                      ▼                                  │
│  ┌──────────────────────────────────────┐                          │
│  │ logs/simulation_state.json            │                          │
│  │ {                                     │                          │
│  │   "portfolio_id": "simulation",       │                          │
│  │   "current_cash": 9500.0,             │                          │
│  │   "positions": {...},                 │                          │
│  │   "trade_log": [...]                  │                          │
│  │ }                                     │                          │
│  └───────────────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Data Models

### SimulatedPortfolio

**Purpose**: Complete state of the simulated trading account

**Properties**:
- `portfolio_id`: Unique identifier (typically "simulation")
- `starting_cash`: Initial capital (never changes)
- `current_cash`: Available cash after all trades
- `positions`: Dictionary of open positions by symbol
- `trade_log`: Complete history of all executed trades
- `created_at`: Portfolio creation timestamp
- `updated_at`: Last modification timestamp

**Computed Properties**:
- `equity`: Cash + total position value
- `total_pnl`: Realized + unrealized PnL
- `total_pnl_pct`: Return percentage vs starting cash

### SimulatedPosition

**Purpose**: Represents a single open position

**Properties**:
- `symbol`: Trading pair (e.g., "BTCUSDT")
- `quantity`: Position size (positive = long, negative = short)
- `entry_price`: Average entry price
- `entry_timestamp`: When position was opened
- `current_price`: Latest mark price
- `confidence`: LLM confidence score (0-1)
- `leverage`: Position leverage (default 1.0)
- `exit_plan`: Stop-loss, take-profit, invalidation conditions

**Computed Properties**:
- `notional_value`: Position size in dollar terms
- `unrealized_pnl`: Current profit/loss
- `unrealized_pnl_pct`: PnL percentage

### TradeLogEntry

**Purpose**: Immutable record of a trade execution

**Properties**:
- `timestamp`: Execution time
- `symbol`: Trading pair
- `action`: BUY, SELL, CLOSE, HOLD
- `price`: Execution price
- `quantity`: Trade size
- `realized_pnl`: Profit/loss for CLOSE actions
- `reason`: LLM rationale or trigger reason

---

## 🔄 Data Flow

### 1. Decision Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Scheduler triggers decision (every 3 minutes)               │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ LLM Decision Pipeline                                       │
│ • Fetch market data                                         │
│ • Calculate indicators                                      │
│ • Generate decision via Deepseek LLM                        │
│ Output: DecisionPayload                                     │
│   {                                                          │
│     "action": "BUY",                                        │
│     "symbol": "BTCUSDT",                                    │
│     "size_pct": 10.0,                                       │
│     "confidence": 0.85,                                     │
│     "exit_plan": {...}                                      │
│   }                                                          │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Execution Router                                            │
│ if simulation_enabled:                                      │
│   ├─> SimulatedBroker.execute(decision)                    │
│ else:                                                        │
│   └─> LiveBroker.execute(decision)                         │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ SimulatedBroker.execute()                                   │
│ 1. Load current state from JSON                             │
│ 2. Execute trade logic:                                     │
│    • BUY: Add position, deduct cash                         │
│    • SELL: Add short position                               │
│    • CLOSE: Remove position, realize PnL                    │
│    • HOLD: Check exit triggers only                         │
│ 3. Update portfolio state                                   │
│ 4. Append to trade log                                      │
│ 5. Save state back to JSON                                  │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ logs/simulation_state.json updated                          │
└─────────────────────────────────────────────────────────────┘
```

### 2. Frontend Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ User opens AutoTradingDashboard                             │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ useAutoTradingPortfolio() hook                              │
│ React Query fetches every 30 seconds                        │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ GET /api/autotrade/v1/portfolio                             │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ repositories.fetch_latest_portfolio()                       │
│ if simulation_enabled:                                      │
│   1. load_state(simulation_state.json)                      │
│   2. simulated_to_snapshot(portfolio)                       │
│   3. return AutoTradePortfolioSnapshot                      │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend receives:                                          │
│ {                                                            │
│   "mode": "Paper Trading (Simulation)",                     │
│   "equity": 10000.0,                                        │
│   "positions": [...],                                       │
│   "decisions": [...],                                       │
│   ...                                                        │
│ }                                                            │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ AutoTradingDashboard renders data                           │
│ • Shows equity, PnL, positions                              │
│ • Displays mode badge                                       │
│ • Updates every 30 seconds                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Configuration

### Environment Variables

```bash
# Simulation Mode Control
AUTOTRADE_SIMULATION_ENABLED=true|false
  # true  = Use simulated broker, JSON state storage
  # false = Use live broker, PostgreSQL database (default)

# Simulation Settings
AUTOTRADE_SIMULATION_STARTING_CASH=10000.0
  # Initial portfolio cash in simulation mode

AUTOTRADE_SIMULATION_STATE_PATH=logs/simulation_state.json
  # Location of the simulation state file
```

### Configuration Class

```python
# src/autotrade_service/config.py

class Settings:
    simulation_enabled: bool = Field(
        default=False,
        description="Enable simulation/paper trading mode"
    )
    simulation_starting_cash: float = Field(
        default=10000.0,
        description="Starting cash for simulation portfolio"
    )
    simulation_state_path: str = Field(
        default="logs/simulation_state.json",
        description="Path to simulation state file"
    )
```

---

## 📁 File Structure

```
python-auto-trade/
├── src/autotrade_service/
│   ├── simulation/              # Simulation module
│   │   ├── __init__.py          # Package exports
│   │   ├── state.py             # Data models (Portfolio, Position, TradeLog)
│   │   ├── broker.py            # Trade execution engine
│   │   ├── persistence.py       # JSON load/save functions
│   │   └── manager.py           # Conversion utilities
│   ├── config.py                # Settings (simulation flags added)
│   ├── repositories.py          # Data layer (simulation switch added)
│   └── api/
│       └── routes.py            # API endpoints (unchanged)
├── logs/
│   └── simulation_state.json    # Simulation state file
├── scripts/
│   ├── run_simulation.py        # Manual simulation driver
│   └── export_simulation.py     # Export trades to CSV
├── tests/
│   └── test_simulation.py       # Unit tests
└── docs/
    ├── SIMULATION_README.md              # User guide
    ├── SIMULATION_QUICK_START.md         # Quick start guide
    ├── SIMULATION_TESTING_GUIDE.md       # Testing procedures
    ├── SIMULATION_DEPLOYMENT.md          # Deployment instructions
    ├── FRONTEND_INTEGRATION_PLAN.md      # UI integration plan
    └── SIMULATION_DESIGN.md              # This document
```

---

## 🎯 Implementation Phases

### ✅ Phase 1: Core Simulation Engine (COMPLETED)

**Goal**: Build the foundational simulation system

**Deliverables**:
- ✅ Data models for portfolio, positions, trades
- ✅ Simulated broker with execution logic
- ✅ JSON persistence layer
- ✅ Stop-loss, take-profit, invalidation triggers
- ✅ PnL calculations (realized & unrealized)

**Duration**: 8-10 hours

**Files Created**:
- `src/autotrade_service/simulation/state.py`
- `src/autotrade_service/simulation/broker.py`
- `src/autotrade_service/simulation/persistence.py`
- `src/autotrade_service/simulation/manager.py`
- `src/autotrade_service/simulation/__init__.py`

---

### ✅ Phase 2: Integration with Existing Service (COMPLETED)

**Goal**: Wire simulation into the production service

**Deliverables**:
- ✅ Configuration system with feature flags
- ✅ Modified `fetch_latest_portfolio()` to check simulation mode
- ✅ Conversion functions (SimulatedPortfolio → AutoTradePortfolioSnapshot)
- ✅ Transparent API endpoint switching

**Duration**: 2-3 hours

**Files Modified**:
- `src/autotrade_service/config.py`
- `src/autotrade_service/repositories.py`

**Key Achievement**: Existing API endpoint `/api/autotrade/v1/portfolio` now serves both live and simulation data based on configuration!

---

### ✅ Phase 3: Tools & Documentation (COMPLETED)

**Goal**: Provide utilities and documentation for users

**Deliverables**:
- ✅ Export tool (CSV output)
- ✅ Manual simulation driver script
- ✅ Comprehensive documentation (5 documents)
- ✅ Quick start guide
- ✅ Testing guide with manual procedures
- ✅ Deployment instructions

**Duration**: 4-5 hours

**Files Created**:
- `scripts/run_simulation.py`
- `scripts/export_simulation_standalone.py`
- `docs/SIMULATION_README.md`
- `docs/SIMULATION_QUICK_START.md`
- `docs/SIMULATION_TESTING_GUIDE.md`
- `docs/SIMULATION_DEPLOYMENT.md`
- `docs/FRONTEND_INTEGRATION_PLAN.md`

---

### ⏳ Phase 4: Frontend Basic Integration (PLANNED)

**Goal**: Make simulation data visible in UI with minimal changes

**Deliverables**:
- [ ] Update mode display in `simulated_to_snapshot()`
- [ ] Add `SimulationBanner` component
- [ ] Visual indicator for simulation mode
- [ ] Show state file path and last update time

**Duration**: 15 minutes

**Effort**: Minimal - existing dashboard already displays simulation data!

**Files to Modify**:
- `src/autotrade_service/simulation/manager.py` (1 line change)
- Create: `equity-insight-react/src/components/trading/SimulationBanner.tsx`
- Update: `equity-insight-react/src/pages/AutoTradingDashboard.tsx`

---

### 🔮 Phase 5: Enhanced Simulation API (FUTURE)

**Goal**: Add simulation-specific endpoints and features

**Deliverables**:
- [ ] `GET /api/autotrade/v1/simulation/state` - Full state including trade log
- [ ] `GET /api/autotrade/v1/simulation/trades` - Trade history with filtering
- [ ] `GET /api/autotrade/v1/simulation/metrics` - Performance analytics
- [ ] `POST /api/autotrade/v1/simulation/reset` - Reset simulation
- [ ] `GET /api/autotrade/v1/simulation/export` - Download CSV

**Duration**: 3-4 hours

**Files to Create**:
- `src/autotrade_service/api/simulation_routes.py`

---

### 🔮 Phase 6: Advanced UI Components (FUTURE)

**Goal**: Build dedicated simulation dashboard

**Deliverables**:
- [ ] `SimulationTradeLog` - Paginated trade history
- [ ] `SimulationMetrics` - Performance cards and charts
- [ ] `SimulationControls` - Reset, export, settings
- [ ] `SimulationPositionDetail` - Enhanced position view
- [ ] Equity curve chart
- [ ] PnL distribution histogram

**Duration**: 8-12 hours

**Files to Create**:
- `equity-insight-react/src/components/trading/SimulationTradeLog.tsx`
- `equity-insight-react/src/components/trading/SimulationMetrics.tsx`
- `equity-insight-react/src/components/trading/SimulationControls.tsx`
- `equity-insight-react/src/components/trading/SimulationPositionDetail.tsx`

---

### 🔮 Phase 7: Real-Time Updates & Advanced Features (FUTURE)

**Goal**: Professional-grade simulation platform

**Deliverables**:
- [ ] WebSocket endpoint for real-time trade updates
- [ ] Historical equity tracking
- [ ] Trade analysis by symbol, time, PnL
- [ ] Multiple simulation comparison
- [ ] Strategy backtesting integration
- [ ] Performance benchmarking

**Duration**: 12-16 hours

**Complexity**: High - requires WebSocket infrastructure

---

## 🔑 Key Design Decisions

### 1. JSON File Storage

**Decision**: Use simple JSON file instead of database

**Rationale**:
- ✅ Simple to implement and debug
- ✅ Human-readable state inspection
- ✅ No schema migrations needed
- ✅ Easy backup and versioning
- ✅ Atomic writes prevent corruption
- ✅ Sufficient performance for single-user simulation

**Tradeoffs**:
- ❌ Not suitable for multi-user scenarios
- ❌ No concurrent access control
- ❌ Limited query capabilities
- ❌ File size grows with trade history

### 2. Transparent API Switching

**Decision**: Same API endpoint serves both modes

**Rationale**:
- ✅ Zero frontend changes required
- ✅ Consistent data schema
- ✅ Easy A/B testing between modes
- ✅ Simplified deployment
- ✅ Clear separation of concerns

**Alternative Rejected**: Separate `/simulation` endpoints would require frontend duplication

### 3. Feature Flag Control

**Decision**: Environment variable toggles mode

**Rationale**:
- ✅ Simple on/off switch
- ✅ No code changes to switch modes
- ✅ Safe - can't accidentally mix modes
- ✅ Easy to understand and configure

**Alternative Rejected**: Runtime API switching would be more complex and error-prone

### 4. In-Memory State with Persistence

**Decision**: Load on demand, save after changes

**Rationale**:
- ✅ Fast execution
- ✅ State persists across restarts
- ✅ No long-running state management
- ✅ Atomic file operations ensure consistency

**Alternative Rejected**: Persistent in-memory state would complicate restarts and updates

### 5. Trade Log as Audit Trail

**Decision**: Keep complete history of all trades

**Rationale**:
- ✅ Full audit trail for analysis
- ✅ Can reconstruct historical equity
- ✅ Debugging and verification
- ✅ Performance analytics possible

**Tradeoff**: File size grows linearly with trades (acceptable for simulation use case)

---

## 🛡️ Safety & Reliability

### Data Integrity

1. **Atomic Writes**: Write to `.tmp` file, then rename
   - Prevents corruption if write fails mid-operation
   - OS-level atomic operation guarantee

2. **State Validation**: Load with error handling
   - Invalid JSON returns None
   - Triggers creation of fresh state

3. **Type Safety**: Pydantic-style dataclasses
   - Compile-time type checking
   - Runtime validation

### Error Handling

1. **Graceful Degradation**: If state file corrupted
   - Create new initial state
   - Log error for investigation
   - Service continues operating

2. **Idempotent Operations**: Safe to retry
   - Load operations have no side effects
   - Save operations overwrite completely

3. **Comprehensive Logging**:
   - State loads/saves logged
   - Trade executions logged
   - Errors logged with full context

### Testing Strategy

1. **Unit Tests**: Core logic verification
   - Position calculations
   - PnL computations
   - Trade execution rules

2. **Manual Testing**: End-to-end workflows
   - Create portfolio → Execute trades → Verify state
   - Export to CSV → Validate output

3. **Integration Testing**: Full service validation
   - Enable simulation mode
   - Trigger scheduler
   - Verify API responses

---

## 📊 Performance Characteristics

### File Operations

- **Read**: ~1ms for typical state (< 1KB)
- **Write**: ~2-5ms with atomic rename
- **Scale**: Linear with trade log size

### Memory Usage

- **State Object**: ~1-2KB per position
- **Trade Log**: ~200 bytes per entry
- **Total**: < 1MB for 1000 trades

### API Response Time

- **With Simulation**: +1-2ms vs database mode
- **Bottleneck**: JSON parsing (negligible)
- **Cache**: React Query 30s stale time

---

## 🔄 State Transitions

### Position Lifecycle

```
┌─────────────┐
│ NO POSITION │
└──────┬──────┘
       │ BUY/SELL decision
       ▼
┌─────────────┐
│ OPEN        │ ◄───┐
│ POSITION    │     │ Mark-to-market update
└──────┬──────┘     │ (current_price changes)
       │            │
       ├────────────┘
       │
       │ CLOSE decision, stop-loss, or take-profit hit
       ▼
┌─────────────┐
│ CLOSED      │
│ (removed    │
│  from dict) │
└─────────────┘
```

### Portfolio State Machine

```
┌──────────────┐
│ INITIAL      │
│ (created)    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ ACTIVE       │ ◄────┐
│ (trading)    │      │
└──────┬───────┘      │
       │              │
       │ Every trade  │
       ├──────────────┘
       │
       │ Reset
       ▼
┌──────────────┐
│ RESET        │
│ (new state)  │
└──────────────┘
```

---

## 🎓 Usage Patterns

### Development Workflow

**Important**: Always activate the virtual environment first:
```bash
cd /Users/chowhanwong/project/learncodex/python-auto-trade
source venv/bin/activate  # macOS/Linux
```

1. **Enable simulation mode** in `.env`
2. **Start service** with simulation enabled
3. **Trigger scheduler** manually or wait for interval
4. **Monitor trades** via API or state file
5. **Export results** for analysis
6. **Reset** to test different parameters

### Testing Strategies

1. **Parameter Tuning**: Test different LLM prompts
2. **Risk Management**: Verify stop-loss triggers
3. **Position Sizing**: Validate size_pct calculations
4. **Market Conditions**: Replay different scenarios

### Production Transition

1. **Validate simulation results** meet expectations
2. **Backup simulation state** for reference
3. **Disable simulation mode** in production `.env`
4. **Deploy with live mode enabled**
5. **Monitor initial live trades** closely

---

## 🔮 Future Enhancements

### Planned Features

1. **Historical Replay**: Run simulation against past market data
2. **Multiple Portfolios**: Support A/B testing of strategies
3. **Performance Benchmarks**: Compare against buy-and-hold
4. **Risk Analytics**: Sharpe ratio, max drawdown calculation
5. **Strategy Presets**: Quick start templates
6. **Trade Replay**: Visualize historical decisions

### Integration Opportunities

1. **Backtest Module**: Feed historical data through pipeline
2. **Alert System**: Notify on significant PnL changes
3. **Auto-Export**: Scheduled CSV exports
4. **Comparison Dashboard**: Side-by-side mode comparison

---

## 📚 Related Documentation

- **[SIMULATION_README.md](./SIMULATION_README.md)**: Comprehensive user guide
- **[SIMULATION_QUICK_START.md](./SIMULATION_QUICK_START.md)**: Get started in 5 minutes
- **[SIMULATION_TESTING_GUIDE.md](./SIMULATION_TESTING_GUIDE.md)**: Testing procedures
- **[SIMULATION_DEPLOYMENT.md](./SIMULATION_DEPLOYMENT.md)**: Production deployment
- **[FRONTEND_INTEGRATION_PLAN.md](./FRONTEND_INTEGRATION_PLAN.md)**: UI enhancement roadmap

---

## 🏆 Summary

The simulation trading system provides a **production-quality paper trading environment** with:

✅ **Full-fidelity trade execution**  
✅ **Zero-risk testing**  
✅ **Transparent integration** with existing service  
✅ **Simple configuration** via environment variables  
✅ **Complete audit trail** in trade log  
✅ **Frontend-ready** via existing API endpoints  

**Current State**: Phases 1-3 complete and tested  
**Next Step**: Phase 4 (15-minute UI enhancement)  
**Total Investment**: ~15-20 hours of development  
**ROI**: Safe strategy testing, reduced live trading risk, faster iteration cycles

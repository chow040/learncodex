# Simulation Execution System

## Overview

The simulation execution system allows the LLM-based trading agent to operate in a paper trading mode, evaluating strategies and managing a virtual portfolio without interacting with real exchanges.

## Architecture

### Components

1. **State Management (`simulation/state.py`)**
   - `SimulatedPortfolio`: Main portfolio state container
   - `SimulatedPosition`: Individual position with entry/current price, PnL tracking
   - `ExitPlan`: Stop-loss, take-profit, and invalidation conditions
   - `TradeLogEntry`: Trade execution history

2. **Broker (`simulation/broker.py`)**
   - `SimulatedBroker`: Executes trading decisions
     - `execute()`: Process BUY/SELL/HOLD/CLOSE decisions
     - `mark_to_market()`: Update positions with current prices
     - Automatic stop-loss and take-profit triggers
     - Simple invalidation condition parsing

3. **Persistence (`simulation/persistence.py`)**
   - `load_state()`: Load portfolio from JSON file
   - `save_state()`: Save portfolio to JSON file (atomic write)
   - `create_initial_state()`: Initialize new portfolio

4. **Manager (`simulation/manager.py`)**
   - `simulated_to_snapshot()`: Convert simulated state to `AutoTradePortfolioSnapshot`
   - Ensures LLM sees identical schema in simulation and production

## Configuration

Add to `.env` or set environment variables:

```bash
# Enable simulation mode
AUTOTRADE_SIMULATION_ENABLED=true

# Simulation settings
AUTOTRADE_SIMULATION_STATE_PATH=logs/simulation_state.json
AUTOTRADE_SIMULATION_STARTING_CASH=10000.0
AUTOTRADE_SIMULATION_MAX_SLIPPAGE_BPS=5
AUTOTRADE_SIMULATION_POSITION_SIZE_LIMIT_PCT=50.0
```

## Usage

### Running Simulation

#### Continuous Mode
```bash
# Run with default settings (3-minute intervals, $10k starting cash)
python scripts/run_simulation.py

# Custom interval and cash
python scripts/run_simulation.py --interval 300 --cash 25000

# Custom configuration
python scripts/run_simulation.py \
  --interval 180 \
  --cash 50000 \
  --slippage-bps 10 \
  --position-limit-pct 30 \
  --state-path logs/my_simulation.json \
  --log-level DEBUG
```

#### Single Cycle Mode
```bash
# Run a single decision cycle and exit
python scripts/run_simulation.py --once
```

### Integration with Decision Pipeline

When `AUTOTRADE_SIMULATION_ENABLED=true`, the `fetch_latest_portfolio()` function automatically:
1. Loads simulated portfolio from JSON state file
2. Creates initial portfolio if none exists
3. Returns portfolio snapshot compatible with prompt builder

The decision pipeline remains unchanged - it receives the same data structure whether in simulation or production mode.

### Executing Decisions

The broker processes decisions from the LLM:

**BUY**: 
- Calculates position size from `size_pct` (% of equity) or `quantity`
- Applies slippage (configured `max_slippage_bps`)
- Checks available cash
- Creates or averages into existing position
- Updates exit plans

**SELL**: 
- Currently treated as CLOSE (short selling not yet supported)

**CLOSE**: 
- Closes position at current price
- Realizes PnL
- Returns proceeds to cash

**HOLD**: 
- Updates current price
- Updates confidence and exit plans
- No cash flow

### Exit Triggers

Automatic position closing when:

1. **Stop-Loss**: `current_price <= position.exit_plan.stop_loss`
2. **Take-Profit**: `current_price >= position.exit_plan.take_profit`
3. **Invalidation**: Simple condition parsing
   - "close below 45000" → closes if price < 45000
   - "price above 55000" → closes if price > 55000

## State File Format

```json
{
  "portfolio_id": "simulation",
  "starting_cash": 10000.0,
  "current_cash": 8500.0,
  "positions": {
    "BTCUSDT": {
      "symbol": "BTCUSDT",
      "quantity": 0.5,
      "entry_price": 50000.0,
      "entry_timestamp": "2025-10-31T12:00:00",
      "current_price": 52000.0,
      "confidence": 0.8,
      "leverage": 1.0,
      "exit_plan": {
        "stop_loss": 48000.0,
        "take_profit": 55000.0,
        "invalidation_condition": "close below 45000"
      }
    }
  },
  "trade_log": [
    {
      "timestamp": "2025-10-31T12:00:00",
      "symbol": "BTCUSDT",
      "action": "BUY",
      "price": 50025.0,
      "quantity": 0.5,
      "realized_pnl": 0.0,
      "reason": "High confidence setup"
    }
  ],
  "created_at": "2025-10-31T11:00:00",
  "updated_at": "2025-10-31T12:05:00"
}
```

## Portfolio Metrics

Available metrics:
- `equity`: Total portfolio value (cash + positions)
- `current_cash`: Available cash balance
- `total_position_value`: Sum of all position notional values
- `total_unrealized_pnl`: Unrealized profit/loss from open positions
- `total_realized_pnl`: Realized profit/loss from closed trades
- `total_pnl`: Combined realized + unrealized
- `total_pnl_pct`: Total PnL as % of starting cash

## Testing

Run unit tests:
```bash
cd /Users/chowhanwong/project/learncodex/python-auto-trade
PYTHONPATH=src pytest tests/test_simulation.py -v
```

## Limitations & Future Enhancements

### Current Limitations
1. **Market Data**: Placeholder prices in standalone mode (needs tool cache integration)
2. **Short Selling**: Not yet supported
3. **Invalidation Parsing**: Only simple "above/below" conditions
4. **Metrics**: Sharpe ratio and max drawdown not yet calculated
5. **Fees**: No trading fees or funding rates applied

### Planned Enhancements
1. Extract real market prices from LangChain tool cache
2. Implement short position support
3. Enhanced invalidation condition parsing (time-based, multi-candle)
4. Risk metrics (Sharpe, Sortino, max drawdown, win rate)
5. CSV/JSON export for backtesting analysis
6. Optional API endpoint for portfolio inspection
7. Multiple simulation sessions/accounts
8. Replay mode from historical data

## Troubleshooting

### Portfolio Not Loading
- Check `AUTOTRADE_SIMULATION_STATE_PATH` is correct
- Ensure `logs/` directory exists
- Check file permissions

### No Market Data
- Verify tool cache contains market data
- Check symbols configured in `AUTOTRADE_SYMBOLS`
- Review decision pipeline logs

### Positions Not Closing
- Verify stop-loss/take-profit values are reasonable
- Check mark_to_market is being called with updated prices
- Review invalidation condition syntax

### State File Corrupted
- Delete state file to restart from initial cash
- Check logs for JSON serialization errors

## Example Workflow

1. **Initialize**: Enable simulation mode in config
2. **Start**: Run `python scripts/run_simulation.py`
3. **Monitor**: Watch logs for decision execution and portfolio updates
4. **Analyze**: Review state file and trade log
5. **Iterate**: Adjust LLM prompts or parameters based on performance

## Support

For questions or issues:
- Check logs in `logs/simulation.log`
- Review state file for portfolio history
- Enable DEBUG logging for detailed execution traces

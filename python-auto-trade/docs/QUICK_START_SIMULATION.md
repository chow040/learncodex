# Quick Start Guide - Simulation Mode

## Prerequisites

**Important**: This project uses a Python virtual environment (venv).

```bash
cd /Users/chowhanwong/project/learncodex/python-auto-trade

# Activate the virtual environment first
source venv/bin/activate  # macOS/Linux
# OR: venv\Scripts\activate  # Windows
```

- Python 3.10+ environment activated
- Dependencies installed (`pip install -r requirements.txt` if needed)
- DeepSeek API key configured

## Step 1: Enable Simulation Mode

Add to your `.env` file:
```bash
AUTOTRADE_SIMULATION_ENABLED=true
AUTOTRADE_SIMULATION_STARTING_CASH=10000.0
AUTOTRADE_SYMBOLS=["BTCUSDT","ETHUSDT"]
AUTOTRADE_DEEPSEEK_API_KEY=your_key_here
```

## Step 2: Run Single Test Cycle

Test the setup with a single decision cycle:
```bash
cd /Users/chowhanwong/project/learncodex/python-auto-trade
python scripts/run_simulation.py --once --log-level DEBUG
```

**Expected output:**
- Portfolio initialized with $10,000 cash
- Decision pipeline runs
- Decisions executed (if any)
- State saved to `logs/simulation_state.json`

## Step 3: Check State File

```bash
cat logs/simulation_state.json
```

Should show:
- `portfolio_id`: "simulation"
- `current_cash`: Starting amount (minus any positions)
- `positions`: Any opened positions
- `trade_log`: Execution history

## Step 4: Run Continuous Simulation

Start the simulation loop (default 3-minute intervals):
```bash
python scripts/run_simulation.py
```

**To customize:**
```bash
# 5-minute intervals with $25,000 starting cash
python scripts/run_simulation.py --interval 300 --cash 25000

# With debug logging
python scripts/run_simulation.py --log-level DEBUG
```

**Stop with:** `Ctrl+C`

## Step 5: Monitor Progress

### Watch logs in real-time:
```bash
tail -f logs/simulation.log
```

### Check portfolio state:
```bash
python scripts/export_simulation.py --state logs/simulation_state.json
```

**Output includes:**
- Portfolio summary (equity, PnL, positions)
- Open positions with unrealized PnL
- Trade log exported to CSV

## Step 6: Analyze Results

Export trade history:
```bash
python scripts/export_simulation.py \
  --state logs/simulation_state.json \
  --output my_trades.csv
```

Open `my_trades.csv` in Excel/Numbers for analysis.

## Common Commands

### Reset simulation (start fresh)
```bash
rm logs/simulation_state.json
python scripts/run_simulation.py --once
```

### Run with custom settings
```bash
python scripts/run_simulation.py \
  --interval 180 \          # 3-minute cycles
  --cash 50000 \            # $50k starting capital
  --slippage-bps 10 \       # 10 bps slippage
  --position-limit-pct 30 \ # 30% max position size
  --state-path logs/my_sim.json
```

### Check portfolio without running
```bash
python -c "
from autotrade_service.simulation import load_state
p = load_state('logs/simulation_state.json')
if p:
    print(f'Equity: \${p.equity:.2f}')
    print(f'PnL: \${p.total_pnl:.2f} ({p.total_pnl_pct:.2f}%)')
    print(f'Positions: {len(p.positions)}')
    print(f'Trades: {len(p.trade_log)}')
"
```

## Troubleshooting

### "State file not found"
- Normal on first run - it will be created automatically
- Check `AUTOTRADE_SIMULATION_STATE_PATH` setting

### "No market data available"
- Ensure `AUTOTRADE_SYMBOLS` is configured
- Check decision pipeline logs for tool execution
- Verify market data tools are working

### "DeepSeek API error"
- Verify `AUTOTRADE_DEEPSEEK_API_KEY` is set correctly
- Check API rate limits
- Review decision pipeline logs

### Positions not executing
- Check available cash (`current_cash` in state file)
- Review `size_pct` in decisions
- Verify slippage settings

## Integration with Existing System

The simulation mode is fully integrated:

1. **Transparent to LLM**: Decision pipeline sees identical portfolio schema
2. **Feature flag**: Toggle with `AUTOTRADE_SIMULATION_ENABLED`
3. **Isolated**: Simulation state separate from production database
4. **Compatible**: Can run alongside production with different portfolios

## Next Steps

Once comfortable with simulation:
1. Adjust LLM prompts based on decision quality
2. Tune position sizing and risk parameters
3. Analyze trade patterns and PnL distribution
4. Compare simulation vs production (if running both)
5. Build confidence before enabling live trading

## Need Help?

- Check logs: `logs/simulation.log`
- Review state: `logs/simulation_state.json`
- Read docs: `docs/SIMULATION_README.md`
- Run tests: `pytest tests/test_simulation.py -v`

Happy simulating! 🚀

# Testing & Deployment Guide - Simulation System

## Prerequisites Check

**Important**: This project uses a Python virtual environment (venv).

Before testing, ensure you have all dependencies:

```bash
cd /Users/chowhanwong/project/learncodex/python-auto-trade

# Activate the virtual environment first
source venv/bin/activate  # macOS/Linux
# OR: venv\Scripts\activate  # Windows

# Check Python version (should be 3.10+)
python --version

# Check required packages are installed
python -c "import asyncpg; import pydantic; import fastapi; print('✅ Core deps OK')"
```

## Testing Strategy

### Option 1: Manual Integration Test (Recommended)

Since the simulation module imports trigger the full app, the best way to test is through actual usage:

#### Step 1: Configure Simulation Mode

Create or update `.env`:

```bash
# Simulation settings
AUTOTRADE_SIMULATION_ENABLED=true
AUTOTRADE_SIMULATION_STARTING_CASH=10000.0
AUTOTRADE_SIMULATION_STATE_PATH=logs/simulation_state.json

# Required settings
AUTOTRADE_SYMBOLS=["BTCUSDT","ETHUSDT"]
AUTOTRADE_DEEPSEEK_API_KEY=your_api_key_here

# Optional: reduce interval for testing
AUTOTRADE_DECISION_INTERVAL_MINUTES=1.0
```

#### Step 2: Test Simulation Script Directly

```bash
# Test that script runs without errors
python scripts/run_simulation.py --help

# Expected output: Usage information with all CLI flags
```

#### Step 3: Initialize Simulation State

```bash
# Create a test state file manually
python -c "
import json
import sys
from datetime import datetime

state = {
    'portfolio_id': 'test',
    'starting_cash': 10000.0,
    'current_cash': 10000.0,
    'positions': {},
    'trade_log': [],
    'created_at': datetime.utcnow().isoformat(),
    'updated_at': datetime.utcnow().isoformat()
}

import os
os.makedirs('logs', exist_ok=True)
with open('logs/simulation_state.json', 'w') as f:
    json.dump(state, f, indent=2)

print('✅ Created initial simulation state')
print(json.dumps(state, indent=2))
"
```

#### Step 4: Verify State File

```bash
# Check the state file was created
cat logs/simulation_state.json

# Should show portfolio with $10k cash
```

#### Step 5: Test Export Script

```bash
# Test export functionality
python scripts/export_simulation.py --state logs/simulation_state.json

# Expected output: Portfolio summary showing $10k equity
```

### Option 2: Component Testing (Python REPL)

Test individual components in isolation:

```bash
cd /Users/chowhanwong/project/learncodex/python-auto-trade

python3 << 'EOF'
import sys
sys.path.insert(0, 'src')

# Test state module directly (bypassing __init__.py)
exec(open('src/autotrade_service/simulation/state.py').read())

# Create portfolio
portfolio = SimulatedPortfolio(
    portfolio_id='test',
    starting_cash=10000.0,
    current_cash=10000.0,
)

print(f'✅ Portfolio created')
print(f'   ID: {portfolio.portfolio_id}')
print(f'   Cash: ${portfolio.current_cash:.2f}')
print(f'   Equity: ${portfolio.equity:.2f}')

# Test serialization
data = portfolio.to_dict()
restored = SimulatedPortfolio.from_dict(data)
print(f'✅ Serialization works: {restored.portfolio_id}')

print('\n🎉 Core components working!')
EOF
```

### Option 3: Live Integration Test

The most reliable test is running with the actual service:

```bash
# In one terminal, start the service
AUTOTRADE_SIMULATION_ENABLED=true \
AUTOTRADE_SIMULATION_STARTING_CASH=5000 \
AUTOTRADE_DEEPSEEK_API_KEY=your_key \
PYTHONPATH=src uvicorn autotrade_service.main:app --reload --port 8000

# In another terminal, trigger a decision cycle
curl -X POST http://127.0.0.1:8000/internal/autotrade/v1/scheduler/trigger

# Check logs for simulation activity
tail -f logs/simulation.log
```

## Deployment Steps

### Step 1: Prepare Environment

```bash
cd /Users/chowhanwong/project/learncodex/python-auto-trade

# Ensure logs directory exists
mkdir -p logs

# Backup any existing state
if [ -f logs/simulation_state.json ]; then
    cp logs/simulation_state.json logs/simulation_state_backup_$(date +%Y%m%d_%H%M%S).json
    echo "✅ Backed up existing state"
fi
```

### Step 2: Configure Production Settings

Create or update `.env` for your environment:

```bash
# Production simulation config
AUTOTRADE_SIMULATION_ENABLED=true
AUTOTRADE_SIMULATION_STATE_PATH=logs/simulation_state.json
AUTOTRADE_SIMULATION_STARTING_CASH=10000.0
AUTOTRADE_SIMULATION_MAX_SLIPPAGE_BPS=5
AUTOTRADE_SIMULATION_POSITION_SIZE_LIMIT_PCT=50.0

# Decision pipeline
AUTOTRADE_DECISION_INTERVAL_MINUTES=3.0
AUTOTRADE_SYMBOLS=["BTCUSDT","ETHUSDT","SOLUSDT"]

# LLM Configuration
AUTOTRADE_DEEPSEEK_API_KEY=your_production_key
AUTOTRADE_DEEPSEEK_MODEL=deepseek-chat

# Logging
AUTOTRADE_LOG_LEVEL=info
AUTOTRADE_DECISION_TRACE_LOG_PATH=logs/decision-traces.log

# Optional: Database (not required for simulation)
# AUTOTRADE_DB_URL=postgresql://user:pass@localhost/dbname
```

### Step 3: Deploy Simulation Runner (Standalone Mode)

For standalone simulation (without the full service):

```bash
# Create a systemd service (Linux) or launchd plist (macOS)

# For development/testing, use tmux or screen:
tmux new -s simulation

# Inside tmux session:
cd /Users/chowhanwong/project/learncodex/python-auto-trade
source .venv/bin/activate  # if using venv

# Run simulation
python scripts/run_simulation.py \
    --interval 180 \
    --cash 10000 \
    --log-level INFO

# Detach with: Ctrl+b then d
# Reattach with: tmux attach -t simulation
```

### Step 4: Deploy with Full Service (Integrated Mode)

To run simulation integrated with the FastAPI service:

```bash
# Start the service with simulation enabled
cd /Users/chowhanwong/project/learncodex/python-auto-trade

# Set environment variables
export AUTOTRADE_SIMULATION_ENABLED=true
export AUTOTRADE_DEEPSEEK_API_KEY=your_key

# Start uvicorn
PYTHONPATH=src uvicorn autotrade_service.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 1 \
    --log-config logging.yaml
```

The scheduler will automatically:
1. Load or create simulation state
2. Run decision pipeline at configured intervals
3. Execute decisions via simulated broker
4. Persist state after each cycle

### Step 5: Monitor Deployment

```bash
# Watch simulation logs
tail -f logs/simulation.log

# Watch decision logs
tail -f logs/decision-traces.log

# Check state file periodically
python scripts/export_simulation.py

# Monitor service logs (if running integrated)
# Logs will show simulation mode is active
```

### Step 6: Health Checks

Create a monitoring script:

```bash
cat > scripts/health_check.sh << 'EOF'
#!/bin/bash

STATE_FILE="logs/simulation_state.json"

if [ ! -f "$STATE_FILE" ]; then
    echo "❌ State file not found"
    exit 1
fi

# Check if state file is being updated
AGE=$(( $(date +%s) - $(stat -f %m "$STATE_FILE" 2>/dev/null || stat -c %Y "$STATE_FILE") ))

if [ $AGE -gt 600 ]; then
    echo "⚠️  State file not updated in $AGE seconds"
    exit 1
fi

# Parse and check equity
EQUITY=$(python3 -c "
import json
with open('$STATE_FILE') as f:
    data = json.load(f)
print(data['current_cash'])
")

echo "✅ Simulation healthy"
echo "   State age: ${AGE}s"
echo "   Cash: \$$EQUITY"
EOF

chmod +x scripts/health_check.sh

# Run health check
./scripts/health_check.sh
```

## Production Monitoring

### Daily Monitoring Tasks

```bash
# 1. Check portfolio performance
python scripts/export_simulation.py

# 2. Review recent trades
tail -50 logs/simulation.log | grep -E "BUY|SELL|CLOSE"

# 3. Check for errors
grep -i error logs/simulation.log | tail -20

# 4. Verify state file integrity
python -c "
import json
with open('logs/simulation_state.json') as f:
    data = json.load(f)
print(f\"Portfolio: {data['portfolio_id']}\")
print(f\"Equity: \${data['current_cash']:.2f}\")
print(f\"Positions: {len(data['positions'])}\")
print(f\"Trades: {len(data['trade_log'])}\")
"
```

### Automated Monitoring

Set up a cron job to export results daily:

```bash
# Add to crontab
0 0 * * * cd /Users/chowhanwong/project/learncodex/python-auto-trade && python scripts/export_simulation.py --output /path/to/reports/simulation_$(date +\%Y\%m\%d).csv
```

## Backup & Recovery

### Backup Strategy

```bash
# Automated backup script
cat > scripts/backup_simulation.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="logs/backups"
mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d_%H%M%S)
cp logs/simulation_state.json "$BACKUP_DIR/simulation_state_$DATE.json"

# Keep only last 30 backups
ls -t "$BACKUP_DIR"/simulation_state_*.json | tail -n +31 | xargs rm -f

echo "✅ Backed up to: $BACKUP_DIR/simulation_state_$DATE.json"
EOF

chmod +x scripts/backup_simulation.sh
```

### Recovery

```bash
# Restore from backup
cp logs/backups/simulation_state_20251031_120000.json logs/simulation_state.json

# Or reset to fresh state
rm logs/simulation_state.json
python scripts/run_simulation.py --once --cash 10000
```

## Troubleshooting

### Issue: Simulation not starting

```bash
# Check configuration
python -c "
from autotrade_service.config import get_settings
s = get_settings()
print(f'Simulation enabled: {s.simulation_enabled}')
print(f'State path: {s.simulation_state_path}')
print(f'Starting cash: {s.simulation_starting_cash}')
"
```

### Issue: State file corrupted

```bash
# Validate JSON
python -m json.tool logs/simulation_state.json > /dev/null && echo "✅ Valid JSON" || echo "❌ Invalid JSON"

# If corrupted, restore from backup or reset
```

### Issue: No trades executing

```bash
# Check if decisions are being generated
grep "decisions to execute" logs/simulation.log | tail -5

# Check available cash
python -c "
import json
with open('logs/simulation_state.json') as f:
    print(f\"Cash: \${json.load(f)['current_cash']:.2f}\")
"
```

## Success Criteria

Your deployment is successful when:

- ✅ State file creates and updates regularly
- ✅ Decisions are being processed (check logs)
- ✅ Portfolio equity tracked over time
- ✅ Trade log shows executed orders
- ✅ Export script produces readable summaries
- ✅ No errors in simulation.log

## Next Steps

Once simulation is stable:

1. **Analyze Performance**: Use export script to review trades
2. **Tune Parameters**: Adjust position sizing, stops, slippage
3. **Compare Strategies**: Run multiple simulations with different settings
4. **Validate Logic**: Ensure LLM decisions match expectations
5. **Prepare for Live**: Build confidence before production trading

## Support

If you encounter issues:

1. Check logs: `logs/simulation.log` and `logs/decision-traces.log`
2. Verify state file: `cat logs/simulation_state.json`
3. Test components: Run export script to verify data integrity
4. Review configuration: Ensure all required env vars are set
5. Check the SIMULATION_README.md for detailed documentation

---

**Ready to deploy!** 🚀

Start with: `python scripts/run_simulation.py --once` to test a single cycle.

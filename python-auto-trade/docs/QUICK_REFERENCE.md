# Simulation System - Quick Reference

## 🚀 Quick Start (2 Minutes)

```bash
cd /Users/chowhanwong/project/learncodex/python-auto-trade

# 1. Configure (edit .env or export)
export AUTOTRADE_SIMULATION_ENABLED=true
export AUTOTRADE_DEEPSEEK_API_KEY=your_key
export AUTOTRADE_SYMBOLS='["BTCUSDT","ETHUSDT"]'

# 2. Start service
PYTHONPATH=src uvicorn autotrade_service.main:app --reload

# 3. Check status (in another terminal)
python scripts/export_simulation_standalone.py
```

## 📊 Essential Commands

### Check Portfolio Status
```bash
python scripts/export_simulation_standalone.py
```

### View State File
```bash
cat logs/simulation_state.json | python -m json.tool
```

### Export Trades
```bash
python scripts/export_simulation_standalone.py \
  --state logs/simulation_state.json \
  --output trades.csv
```

### Monitor Logs
```bash
tail -f logs/simulation.log
```

### Reset Simulation
```bash
rm logs/simulation_state.json
# Will recreate with starting cash on next run
```

## ⚙️ Configuration

### Required Settings (.env)
```bash
AUTOTRADE_SIMULATION_ENABLED=true
AUTOTRADE_DEEPSEEK_API_KEY=sk-...
AUTOTRADE_SYMBOLS=["BTCUSDT","ETHUSDT"]
```

### Optional Settings
```bash
AUTOTRADE_SIMULATION_STARTING_CASH=10000.0
AUTOTRADE_SIMULATION_MAX_SLIPPAGE_BPS=5
AUTOTRADE_SIMULATION_POSITION_SIZE_LIMIT_PCT=50.0
AUTOTRADE_DECISION_INTERVAL_MINUTES=3.0
```

## 🔍 Troubleshooting

### Issue: State file not found
**Fix:** Will be created automatically on first run

### Issue: No trades executing
**Check:** Available cash in state file
```bash
python -c "import json; print(json.load(open('logs/simulation_state.json'))['current_cash'])"
```

### Issue: Import errors
**Fix:** Use integrated mode (run full service) or use standalone scripts

### Issue: API key error
**Check:** 
```bash
echo $AUTOTRADE_DEEPSEEK_API_KEY
```

## 📈 Metrics Quick View

```python
import json
with open('logs/simulation_state.json') as f:
    d = json.load(f)
    cash = d['current_cash']
    positions = len(d['positions'])
    trades = len(d['trade_log'])
    equity = cash + sum(p['quantity'] * p['current_price'] 
                       for p in d['positions'].values())
    print(f"Equity: ${equity:.2f} | Cash: ${cash:.2f} | Positions: {positions} | Trades: {trades}")
```

## 🎯 Key Files

| File | Purpose |
|------|---------|
| `logs/simulation_state.json` | Portfolio state (cash, positions, trades) |
| `logs/simulation.log` | Execution logs |
| `scripts/export_simulation_standalone.py` | Export & analysis tool |
| `docs/SIMULATION_README.md` | Full documentation |

## ✅ Health Check

Run this to verify system is working:

```bash
# 1. State file exists and is valid
test -f logs/simulation_state.json && echo "✅ State file exists" || echo "❌ State file missing"

# 2. Can read state
python -c "import json; json.load(open('logs/simulation_state.json')); print('✅ State file valid')" 2>/dev/null || echo "❌ Invalid state"

# 3. Export works
python scripts/export_simulation_standalone.py --state logs/simulation_state.json > /dev/null 2>&1 && echo "✅ Export works" || echo "❌ Export failed"
```

## 🆘 Emergency Commands

### Stop Everything
```bash
# Kill uvicorn
pkill -f uvicorn

# Or Ctrl+C in the terminal
```

### Backup State
```bash
cp logs/simulation_state.json logs/backup_$(date +%Y%m%d_%H%M%S).json
```

### Restore Backup
```bash
cp logs/backup_20251031_120000.json logs/simulation_state.json
```

### Fresh Start
```bash
rm logs/simulation_state.json
# Restart service - will create new state
```

## 📞 Support Resources

- **Full Guide:** `docs/SIMULATION_README.md`
- **Quick Start:** `docs/QUICK_START_SIMULATION.md`
- **Testing:** `docs/TESTING_AND_DEPLOYMENT.md`
- **Summary:** `docs/TESTING_DEPLOYMENT_SUMMARY.md`

---

**TIP:** Bookmark this file for quick reference! 📌

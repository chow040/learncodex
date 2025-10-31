# Python Environment Setup

## Environment Type

This project uses a **Python virtual environment (venv)** for dependency isolation.

## Activation Commands

### macOS / Linux
```bash
cd /Users/chowhanwong/project/learncodex/python-auto-trade
source venv/bin/activate
```

### Windows
```cmd
cd C:\path\to\python-auto-trade
venv\Scripts\activate
```

## Verification

After activation, your prompt should show `(venv)`:
```bash
(venv) user@machine python-auto-trade %
```

## Starting the Service

Always activate venv first, then start uvicorn:
```bash
source venv/bin/activate
PYTHONPATH=src uvicorn autotrade_service.main:app --reload
```

## Running Scripts

Always activate venv first:
```bash
source venv/bin/activate
python scripts/run_simulation.py
```

## Deactivation

When done working:
```bash
deactivate
```

## Troubleshooting

### "command not found: uvicorn"
- **Cause**: venv not activated
- **Solution**: Run `source venv/bin/activate` first

### "No module named X"
- **Cause**: Dependencies not installed or wrong Python environment
- **Solution**: 
  ```bash
  source venv/bin/activate
  pip install -r requirements.txt
  ```

### Wrong Python version
- **Cause**: System Python used instead of venv Python
- **Solution**: Activate venv, then check: `python --version`

## Package Management

Install new packages inside venv:
```bash
source venv/bin/activate
pip install package-name
pip freeze > requirements.txt  # Update requirements
```

## IDE Setup

### VS Code
Add to `.vscode/settings.json`:
```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/venv/bin/python"
}
```

### PyCharm
1. File → Settings → Project → Python Interpreter
2. Select the venv Python interpreter
3. Path: `/path/to/python-auto-trade/venv/bin/python`

## Notes for Future Reference

- ✅ venv is located at: `python-auto-trade/venv/`
- ✅ All Python commands require venv activation
- ✅ Backend server runs in activated venv terminal
- ✅ Scripts run in activated venv terminal
- ✅ Tests run in activated venv terminal

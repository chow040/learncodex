TradingAgents Python bridge
==========================

This folder contains a minimal FastAPI wrapper around the `tradingagents` Python
library used by the backend.

Files

- `ta_server.py` - FastAPI application exposing POST `/propagate` to run
  `TradingAgentsGraph().propagate(...)`.

Why this exists

- Running a long-lived Python process reduces per-request startup overhead and
  makes dependency and environment management simpler.
- The Node backend calls this service over HTTP (configurable via `TA_SERVER_URL`).

Running locally (development)

1. Activate / use the Python venv that contains TradingAgents and install
   the server dependencies:

   & 'D:\Python\\.venv-tradingagents\\Scripts\\python.exe' -m pip install fastapi uvicorn pydantic python-dotenv

2. Start the server from the repo root (adjust python path if needed):

   $python = 'D:\Python\\.venv-tradingagents\\Scripts\\python.exe'
   & $python 'D:\learinvscode\\learncodex\\backend\\python\\ta_server.py'

   or run with uvicorn directly:

   & $python -m uvicorn backend.python.ta_server:app --host 127.0.0.1 --port 8000

3. Test with a payload file (example):

   $body = Get-Content -Raw 'D:\learinvscode\\learncodex\\backend\\src\\tmp\\last_payload.json'
   $headers = @{ 'Content-Type' = 'application/json' }
   Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:8000/propagate' -Headers $headers -Body $body

Environment variables

- `TA_SERVER_URL` - override the default `http://127.0.0.1:8000` used by the Node service.
- The server uses the current Python environment for keys such as `FINNHUB_API_KEY` and `OPENAI_API_KEY`.
  Set them in PowerShell before starting the server:

   $env:FINNHUB_API_KEY = 'your_key'
   $env:OPENAI_API_KEY = 'sk-...'

Notes

- The server tries to reuse some helper functions from the old runner for
  compatibility (if available). The server expects `TradingAgents` to be
  importable via your PYTHONPATH or installed into the active venv.
- If `graph.propagate` is long-running due to LLM calls, consider increasing
  timeouts in your Node client or implementing an async job queue for
  background processing.

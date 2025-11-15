# Auto Trading Service

FastAPI-based microservice that powers the LLM-driven autonomous trading workflow. The service exposes REST endpoints, orchestrates a single three-minute evaluation job, and connects to exchanges/brokerages for execution using on-demand LangChain tools (no long-lived market data loop by default).

## Quick start

```bash
uv venv  # or python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
# Copy sample env + trading config
cp .env.example .env
cp config/trading.yaml config/trading.local.yaml  # edit as needed

uvicorn autotrade_service.main:app --reload
```

## Structure

```
src/autotrade_service/
  __init__.py
  __main__.py        # allows `python -m autotrade_service`
  main.py            # FastAPI app & startup hooks
  config.py          # pydantic-based settings
  api/
    __init__.py
    routes.py        # shared APIRouter definitions
  llm/
    client.py        # DeepSeek client wrappers
    langchain_agent.py  # LangChain agent + tool wiring
  market_data/       # CCXT adapters & helpers for market data ingestion
  indicators/        # indicator calculations shared by IndicatorCalculatorTool
  pipelines/         # legacy ingestion pipeline (to be removed once tool refactor lands)
  providers/         # funding/open-interest fetchers
  tools/             # on-demand LangChain tools (market data, indicator calc, cache)
  scheduler.py       # single 3-minute evaluation job controller
  redis_client.py    # optional Redis connection manager for shared caching

 tests/
  __init__.py
  test_indicators.py
  test_market_pipeline.py
  test_scheduler.py
```

## Configuration notes

1. **Environment variables**  
   Copy `.env.example` to `.env` and fill in Redis, CCXT (exchange) keys, and DeepSeek credentials. All settings continue to be read via the `AUTOTRADE_*` prefix (Pydantic `Settings`).  
2. **Trading config file**  
   `config/trading.yaml` (or `config/trading.local.yaml`) captures the dual-scheduler defaults—symbols, TTLs, broker guardrails. The file is not loaded automatically yet, but keeping a canonical copy of your deployment values makes it easy to share presets across environments.

Key variables for the scheduler-driven architecture:

- `AUTOTRADE_SYMBOLS='["BTC-USD","ETH-USD"]'` to control which pairs the agent evaluates.
- `AUTOTRADE_DECISION_INTERVAL_MINUTES=3` to configure the legacy scheduler cadence (if dual mode disabled).
- `AUTOTRADE_CCXT_EXCHANGE_ID=okx` (or another CCXT exchange id) selects the upstream venue; `AUTOTRADE_CCXT_SYMBOL_MAP` maps internal symbols to CCXT pairs.
- `AUTOTRADE_TOOL_CACHE_TTL_SECONDS=30` to enable an in-process cache that avoids duplicate fetches during a single run.
- `AUTOTRADE_REDIS_URL=redis://...` only when opting into shared caching for dashboards/ops visibility.
- `AUTOTRADE_DECISION_TRACE_LOG_PATH=logs/decision-traces.log` to capture every LangChain run (prompt, decisions, tool trace) as newline-delimited JSON; the directory is created automatically.
- `AUTOTRADE_DEEPSEEK_*` variables manage the LLM configuration.
- `AUTOTRADE_OBJECT_STORAGE_URI` and credentials configure prompt/log storage.

LangChain integration now targets the 1.x stack. Be sure your environment has `langchain==1.0.3` and `langchain-deepseek>=1.0.0` installed (the editable install via `pip install -e .` pulls the pinned versions).

The LangChain agent calls `LiveMarketDataTool` and `IndicatorCalculatorTool` on demand during each run. Any caching is scoped to the job (process memory) unless Redis is explicitly enabled. Legacy Redis streams/compaction jobs are being sunset; dashboards should consume the API responses or the optional shared cache layer behind feature flags.

## Troubleshooting

- **`redis unavailable` on `/healthz`** – Dual-scheduler mode requires Redis. Confirm `AUTOTRADE_REDIS_URL` points to a running instance (`redis-cli ping` should return `PONG`).  
- **`Unsupported CCXT exchange id`** – Check `AUTOTRADE_CCXT_EXCHANGE_ID` (e.g., `okx`, `binance`). The value must match a CCXT client name.  
- **CCXT auth errors** – Ensure `AUTOTRADE_CCXT_API_KEY/SECRET/PASSWORD` are set for exchanges that require a “password/passphrase” (OKX).  
- **WebSocket banner stuck on “Connecting”** – Verify the backend is reachable from the frontend (`VITE_API_BASE_URL`) and that Redis is online so the `/ws/market-data` endpoint has data to broadcast.  
- **Schedulers never start** – Set `AUTOTRADE_DUAL_SCHEDULER_ENABLED=false` to fall back to the legacy single scheduler if you don’t have CCXT credentials handy.
```

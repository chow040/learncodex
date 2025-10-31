# Auto Trading Service

FastAPI-based microservice that powers the LLM-driven autonomous trading workflow. The service exposes REST endpoints, orchestrates a single three-minute evaluation job, and connects to exchanges/brokerages for execution using on-demand LangChain tools (no long-lived market data loop by default).

## Quick start

```bash
uv venv  # or python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
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
  market_data/       # CCXT adapters reused by LiveMarketDataTool (legacy polling helpers being retired)
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

Set FastAPI settings using environment variables prefixed with `AUTOTRADE_`. Key variables for the single-job, tool-driven architecture:

- `AUTOTRADE_SYMBOLS='["BTC-USD","ETH-USD"]'` to control which pairs the agent evaluates.
- `AUTOTRADE_DECISION_INTERVAL_MINUTES=3` to configure the scheduler cadence.
- `AUTOTRADE_CCXT_ENABLED=true` to allow the LangChain tools to call CCXT/exchange APIs.
- `AUTOTRADE_CCXT_EXCHANGE_ID=binance` (or another CCXT exchange id) selects the upstream venue; `AUTOTRADE_CCXT_SYMBOLS='["BTC-USD:BTC/USDT"]'` maps internal symbols to CCXT pairs.
- `AUTOTRADE_TOOL_CACHE_TTL_SECONDS=30` to enable an in-process cache that avoids duplicate fetches during a single run.
- `AUTOTRADE_REDIS_URL=redis://...` only when opting into shared caching for dashboards/ops visibility.
- `AUTOTRADE_DECISION_TRACE_LOG_PATH=logs/decision-traces.log` to capture every LangChain run (prompt, decisions, tool trace) as newline-delimited JSON; the directory is created automatically.
- `AUTOTRADE_DEEPSEEK_*` variables manage the LLM configuration.
- `AUTOTRADE_OBJECT_STORAGE_URI` and credentials configure prompt/log storage.

LangChain integration now targets the 1.x stack. Be sure your environment has `langchain==1.0.3` and `langchain-deepseek` installed (the editable install via `pip install -e .` pulls the pinned versions).

The LangChain agent calls `LiveMarketDataTool` and `IndicatorCalculatorTool` on demand during each run. Any caching is scoped to the job (process memory) unless Redis is explicitly enabled. Legacy Redis streams/compaction jobs are being sunset; dashboards should consume the API responses or the optional shared cache layer behind feature flags.
```

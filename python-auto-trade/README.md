# Auto Trading Service

FastAPI-based microservice that powers the LLM-driven autonomous trading workflow. The service exposes REST endpoints, orchestrates the five-minute evaluation loop, and connects to exchanges/brokerages for execution.

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

 tests/
  __init__.py
```

Next steps:
- Wire Postgres/Redis dependencies
- Add scheduler module (APScheduler/asyncio)
- Implement endpoints based on `docs/auto-trading-api-contract.md`
- Integrate DeepSeek, market data, and execution adapters per roadmap
```

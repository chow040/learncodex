from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from dataclasses import asdict, is_dataclass
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Response
from fastapi.middleware.cors import CORSMiddleware
import ccxt.async_support as ccxt

from .api import api_router
from .config import get_settings
from .db import get_db
from .redis_client import get_redis
from .scheduler import get_scheduler
from .schedulers import LLMDecisionScheduler, MarketDataScheduler
from .websocket import connection_manager
from .position_sync import PositionSyncService
from .observability import generate_prometheus_metrics, PROMETHEUS_CONTENT_TYPE


_market_data_scheduler: MarketDataScheduler | None = None
_llm_decision_scheduler: LLMDecisionScheduler | None = None
_ccxt_exchange: ccxt.Exchange | None = None
_position_sync_service: PositionSyncService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):  # pragma: no cover - placeholder for startup/shutdown
    settings = get_settings()
    logger = logging.getLogger(settings.service_name)
    logger.info("Starting %s", settings.service_name)
    db = get_db()
    try:
        await db.connect()
        logger.info("Database pool initialized")
    except Exception as exc:  # pragma: no cover - log and continue with mock mode
        logger.exception("Failed to initialize database pool: %s", exc)
    redis_client = get_redis()
    redis_conn = None
    try:
        await redis_client.connect()
        if redis_client.is_connected:
            redis_conn = redis_client.get_connection()
            logger.info("Redis client initialized")
        else:
            logger.warning("Redis client unavailable; continuing without Redis-dependent features")
    except Exception as exc:  # pragma: no cover
        logger.exception("Failed to initialize Redis client: %s", exc)

    default_scheduler = None
    global _market_data_scheduler, _llm_decision_scheduler, _ccxt_exchange, _position_sync_service
    if settings.dual_scheduler_enabled and redis_conn is not None:
        _ccxt_exchange = await _create_ccxt_exchange(settings)
        _market_data_scheduler = MarketDataScheduler(
            redis_client=redis_conn,
            exchange=_ccxt_exchange,
            websocket_manager=connection_manager,
            settings=settings,
        )
        await _market_data_scheduler.start()

        _llm_decision_scheduler = LLMDecisionScheduler(
            redis_client=redis_conn,
            settings=settings,
        )
        await _llm_decision_scheduler.start()
        _position_sync_service = PositionSyncService(settings=settings)
        await _position_sync_service.start()
        logger.info("Dual scheduler mode enabled")
    else:
        default_scheduler = get_scheduler(settings.scheduler_impl)
        try:
            await default_scheduler.start()
            logger.info("Scheduler initialized with implementation %s", settings.scheduler_impl)
        except Exception as exc:  # pragma: no cover
            logger.exception("Failed to initialize scheduler: %s", exc)
    yield
    # Shutdown in reverse order: stop schedulers first, then close external connections
    logger.info("Stopping %s - shutting down schedulers", settings.service_name)
    if settings.dual_scheduler_enabled:
        if _position_sync_service:
            await _position_sync_service.stop()
            _position_sync_service = None
        if _llm_decision_scheduler:
            await _llm_decision_scheduler.stop()
            _llm_decision_scheduler = None
        if _market_data_scheduler:
            await _market_data_scheduler.stop()
            _market_data_scheduler = None
        if _ccxt_exchange:
            await _ccxt_exchange.close()
            _ccxt_exchange = None
    else:
        await get_scheduler().stop()
    
    # Close database and Redis connections after all schedulers are stopped
    logger.info("Closing database and Redis connections")
    await get_db().disconnect()
    await get_redis().disconnect()
    logger.info("%s stopped successfully", settings.service_name)


settings = get_settings()

log_level = getattr(logging, settings.log_level.upper(), logging.INFO)
log_path = Path(settings.log_dir or "logs")
log_path.mkdir(parents=True, exist_ok=True)
file_handler = logging.FileHandler(log_path / "autotrade_service.log")
file_handler.setFormatter(
    logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
)
root_logger = logging.getLogger()
root_logger.setLevel(log_level)
root_logger.addHandler(file_handler)
app = FastAPI(title="Auto Trading Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/internal/autotrade")


@app.get("/metrics")
async def prometheus_metrics() -> Response:
    payload = generate_prometheus_metrics()
    return Response(content=payload, media_type=PROMETHEUS_CONTENT_TYPE)


async def _redis_health() -> dict[str, object]:
    redis_client = get_redis()
    status = await redis_client.health_check()
    return status


def _collect_scheduler_status() -> dict[str, object]:
    settings = get_settings()
    if settings.dual_scheduler_enabled and _market_data_scheduler and _llm_decision_scheduler:
        return {
            "mode": "dual",
            "market_data": _serialize_status(_market_data_scheduler.status),
            "llm_decision": _serialize_status(_llm_decision_scheduler.status),
        }
    scheduler = get_scheduler()
    try:
        status = scheduler.status().as_dict()
    except Exception:  # pragma: no cover
        return {"mode": "single", "default": {}}
    return {"mode": "single", "default": status}


def _serialize_status(payload: object) -> dict[str, object]:
    if payload is None:
        return {}
    if isinstance(payload, dict):
        items = payload.items()
    elif is_dataclass(payload):
        items = asdict(payload).items()
    else:
        items = getattr(payload, "__dict__", {}).items()

    serialized: dict[str, object] = {}
    for key, value in items:
        if isinstance(value, datetime):
            serialized[key] = value.isoformat()
        else:
            serialized[key] = value
    return serialized


@app.get("/healthz")
async def healthz() -> dict[str, object]:
    redis_status = await _redis_health()
    overall = "ok" if redis_status.get("alive") else "degraded"
    return {
        "status": overall,
        "redis": redis_status,
        "schedulers": _collect_scheduler_status(),
    }


@app.get("/readyz")
async def readyz() -> dict[str, object]:
    redis_status = await _redis_health()
    if not redis_status.get("alive"):
        return {
            "status": "degraded",
            "redis": redis_status,
            "schedulers": _collect_scheduler_status(),
        }
    return {
        "status": "ok",
        "redis": redis_status,
        "schedulers": _collect_scheduler_status(),
    }


@app.websocket("/ws/market-data")
async def market_data_stream(websocket: WebSocket):
    await connection_manager.connect(websocket)
    try:
        while True:
            try:
                message = await websocket.receive_text()
                if isinstance(message, str) and message.strip().lower() == "ping":
                    await connection_manager.send_personal_message({"type": "pong"}, websocket)
            except WebSocketDisconnect:
                break
            except Exception as exc:  # pragma: no cover - network error path
                logging.getLogger("autotrade.websocket.market_data").warning(
                    "WebSocket error: %s", exc
                )
                break
    finally:
        connection_manager.disconnect(websocket)


@app.get("/api/market/v1/prices")
async def get_cached_prices() -> dict[str, object]:
    settings = get_settings()
    redis_client = get_redis()
    if not redis_client.is_connected:
        raise HTTPException(status_code=503, detail="Redis unavailable")
    redis_conn = redis_client.get_connection()
    prices: dict[str, object] = {}
    for symbol in settings.market_data_symbols:
        ticker_key = f"market:{symbol}:ticker"
        data = await redis_conn.get(ticker_key)
        if not data:
            continue
        try:
            ticker = json.loads(data)
        except json.JSONDecodeError:
            continue
        prices[symbol] = {
            "price": ticker.get("last_price") or ticker.get("price"),
            "change_pct_24h": ticker.get("change_pct_24h"),
            "timestamp": ticker.get("timestamp"),
        }
    return {"symbols": prices, "count": len(prices)}


async def _create_ccxt_exchange(settings):
    exchange_id = settings.ccxt_exchange_id or "okx"
    try:
        exchange_class = getattr(ccxt, exchange_id)
    except AttributeError as exc:
        raise RuntimeError(f"Unsupported CCXT exchange id: {exchange_id}") from exc

    params = {
        "apiKey": settings.ccxt_api_key,
        "secret": settings.ccxt_secret,
        "password": settings.ccxt_password,
        "enableRateLimit": True,
        "timeout": int(settings.ccxt_timeout_seconds * 1000),
    }
    exchange = exchange_class(params)
    await exchange.load_markets()
    return exchange

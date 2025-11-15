from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
import json
import secrets
from typing import Any, Sequence

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from ..config import Settings, get_settings
from ..repositories import (
    fetch_decision_by_id,
    fetch_decisions,
    fetch_latest_portfolio,
    get_runtime_mode as get_runtime_mode_from_db,
    set_runtime_mode as set_runtime_mode_in_db,
)
from ..runtime import RuntimeMode
from ..metrics import get_okx_order_latency_stats
from ..scheduler import get_scheduler
from ..position_sync import refresh_portfolio_snapshot
from ..redis_client import get_redis
from ..tools import IndicatorCalculatorTool, IndicatorComputationResult, LiveMarketDataTool, ToolCache

router = APIRouter()


def _to_camel_case(snake_str: str) -> str:
    """Convert snake_case to camelCase."""
    components = snake_str.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


def _convert_keys_to_camel(data: Any) -> Any:
    """Recursively convert dict keys from snake_case to camelCase."""
    if isinstance(data, dict):
        return {_to_camel_case(k): _convert_keys_to_camel(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_convert_keys_to_camel(item) for item in data]
    else:
        return data


def _parse_indicator_hash(raw: dict[str, str]) -> dict[str, object]:
    def _flt(key: str) -> float:
        try:
            return float(raw.get(key, 0.0))
        except (TypeError, ValueError):
            return 0.0

    def _json_series(key: str) -> list[float]:
        payload = raw.get(key)
        if not payload:
            return []
        try:
            data = json.loads(payload)
            if isinstance(data, list):
                return [float(x) for x in data]
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        try:
            return [float(part) for part in str(payload).split(",") if part]
        except ValueError:
            return []

    indicator = {
        "symbol": raw.get("symbol", ""),
        "price": _flt("price"),
        "ema20": _flt("ema20") or _flt("ema_fast"),
        "macd": _flt("macd"),
        "macd_signal": _flt("macd_signal"),
        "macd_histogram": _flt("macd_histogram"),
        "rsi7": _flt("rsi7") or _flt("rsi_short"),
        "rsi14": _flt("rsi14") or _flt("rsi"),
        "atr3": _flt("atr3") or _flt("atr_short"),
        "atr14": _flt("atr14") or _flt("atr"),
        "volume": _flt("volume"),
        "volume_ratio": _flt("volume_ratio"),
        "volatility": _flt("volatility"),
        "generated_at": raw.get("generated_at", ""),
    }

    htf = {
        "ema20": _flt("ema20_4h"),
        "ema50": _flt("ema50_4h"),
        "atr3": _flt("atr3_4h"),
        "atr14": _flt("atr14_4h"),
        "macd": _flt("macd_4h"),
        "macd_signal": _flt("macd_signal_4h"),
        "macd_histogram": _flt("macd_histogram_4h"),
        "macd_histogram_series": _json_series("macd_histogram_series_4h"),
        "rsi14": _flt("rsi14_4h"),
        "volume": _flt("volume_4h"),
        "volume_ratio": _flt("volume_ratio_4h"),
        "generated_at": raw.get("generated_at_4h", ""),
    }
    if any(value for key, value in htf.items() if key not in {"generated_at", "macd_histogram_series"}):
        indicator["higher_timeframe"] = htf

    return indicator


def _indicator_payload_from_result(
    result: IndicatorComputationResult,
    *,
    fetched_at: datetime | None = None,
) -> dict[str, object]:
    snapshot = result.snapshot
    payload: dict[str, object] = {
        "symbol": snapshot.symbol,
        "price": snapshot.price,
        "ema20": snapshot.ema20,
        "macd": snapshot.macd,
        "macd_signal": snapshot.macd_signal,
        "macd_histogram": snapshot.macd_histogram,
        "rsi7": snapshot.rsi7,
        "rsi14": snapshot.rsi14,
        "atr3": snapshot.atr3,
        "atr14": snapshot.atr14,
        "volume": snapshot.volume,
        "volume_ratio": snapshot.volume_ratio,
        "volatility": snapshot.volatility,
        "mid_prices": snapshot.mid_prices,
        "ema20_series": snapshot.ema20_series,
        "macd_series": snapshot.macd_series,
        "macd_histogram_series": snapshot.macd_histogram_series,
        "rsi7_series": snapshot.rsi7_series,
        "rsi14_series": snapshot.rsi14_series,
        "generated_at": snapshot.generated_at.isoformat(),
        "intraday_bar_count": result.intraday_bar_count,
        "high_timeframe_bar_count": result.high_timeframe_bar_count,
    }
    if fetched_at:
        payload["fetched_at"] = fetched_at.isoformat()
    if snapshot.higher_timeframe:
        htf = snapshot.higher_timeframe
        payload["higher_timeframe"] = {
            "ema20": htf.ema20,
            "ema50": htf.ema50,
            "atr3": htf.atr3,
            "atr14": htf.atr14,
            "macd": htf.macd,
            "macd_signal": htf.macd_signal,
            "macd_histogram": htf.macd_histogram,
            "macd_histogram_series": htf.macd_histogram_series,
            "rsi14": htf.rsi14,
            "volume": htf.volume,
            "volume_avg": htf.volume_avg,
            "volume_ratio": htf.volume_ratio,
            "macd_series": htf.macd_series,
            "rsi14_series": htf.rsi14_series,
            "generated_at": htf.generated_at.isoformat(),
        }
    return payload


async def _load_cached_market_data(symbols: Sequence[str]) -> dict[str, dict[str, object]]:
    if not symbols:
        return {}
    redis_client = get_redis()
    if not redis_client.is_connected:
        return {}
    async with redis_client.acquire() as conn:
        results: dict[str, dict[str, object]] = {}
        for symbol in symbols:
            ticker = await _read_json(conn, f"market:{symbol}:ticker")
            if not ticker:
                continue
            age_seconds, stale = _calculate_age(ticker.get("timestamp"))
            ticker["age_seconds"] = age_seconds
            entry = {
                "symbol": symbol,
                "ticker": ticker,
                "orderbook": await _read_json(conn, f"market:{symbol}:orderbook"),
                "funding": await _read_json(conn, f"market:{symbol}:funding"),
                "ohlcv_short": await _read_json(conn, f"market:{symbol}:ohlcv:15m"),
                "ohlcv_long": await _read_json(conn, f"market:{symbol}:ohlcv:1h"),
                "indicators": await _read_json(conn, f"market:{symbol}:indicators"),
                "stale": stale,
            }
            results[symbol] = _convert_keys_to_camel(entry)
        return results


async def _read_json(conn: Any, key: str) -> dict[str, Any] | list[Any] | None:
    payload = await conn.get(key)
    if not payload:
        return None
    try:
        return json.loads(payload)
    except (TypeError, json.JSONDecodeError):
        return None


def _calculate_age(timestamp: str | None) -> tuple[float | None, bool]:
    if not timestamp:
        return None, True
    try:
        parsed = datetime.fromisoformat(timestamp)
    except ValueError:
        try:
            parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            return None, True
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - parsed).total_seconds()
    return age, age > 60


@router.get("/runtime-mode")
async def get_runtime_mode_endpoint(settings: Settings = Depends(get_settings)) -> dict[str, RuntimeMode]:
    mode = await get_runtime_mode_from_db(settings)
    return {"mode": mode}


@router.patch("/runtime-mode", status_code=status.HTTP_200_OK)
async def set_runtime_mode_endpoint(
    payload: RuntimeModeRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, RuntimeMode]:
    try:
        mode = await set_runtime_mode_in_db(payload.mode, settings=settings)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return {"mode": mode}


@router.get("/metrics/latency/okx-order", summary="OKX order latency stats")
async def get_okx_latency_metrics() -> dict[str, object]:
    stats = get_okx_order_latency_stats()
    if stats is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No latency samples yet")
    return {"stats": stats}


@router.get("/health", summary="Service health check")
def health(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    return {
        "service": settings.service_name,
        "status": "ok",
        "time": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/portfolio", summary="Fetch latest auto-trading portfolio")
async def get_portfolio(settings: Settings = Depends(get_settings)) -> dict:
    snapshot = await fetch_latest_portfolio()
    if snapshot is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Portfolio data unavailable")
    payload = _convert_keys_to_camel(asdict(snapshot))
    payload["service"] = settings.service_name
    payload["generatedAt"] = datetime.now(timezone.utc).isoformat()
    payload.pop("decisions", None)
    return {"portfolio": payload}


@router.post("/portfolio/sync", summary="Force portfolio snapshot refresh")
async def trigger_portfolio_sync(
    broadcast: bool = True,
    settings: Settings = Depends(get_settings),
) -> dict:
    snapshot = await refresh_portfolio_snapshot(settings=settings, broadcast=broadcast)
    if snapshot is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Portfolio sync unavailable")

    payload = _convert_keys_to_camel(asdict(snapshot))
    payload["service"] = settings.service_name
    payload["generatedAt"] = datetime.now(timezone.utc).isoformat()
    payload.pop("decisions", None)
    return {"portfolio": payload, "broadcast": broadcast}


@router.get("/decisions", summary="List auto-trading decisions")
async def list_decisions(symbol: str | None = None) -> dict:
    decisions = await fetch_decisions(symbol)
    items = [_convert_keys_to_camel(asdict(decision)) for decision in decisions]
    return {"items": items, "next_cursor": None}


@router.get("/decisions/{decision_id}", summary="Retrieve decision by id")
async def get_decision(decision_id: str) -> dict:
    decision = await fetch_decision_by_id(decision_id)
    if decision is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision not found")
    return {"decision": _convert_keys_to_camel(asdict(decision))}


@router.get("/market/indicators/{symbol}", summary="Latest technical indicators for symbol")
async def get_market_indicators(symbol: str) -> dict:
    settings = get_settings()
    normalized_symbol = symbol.upper()
    redis_client = get_redis()
    if redis_client.is_connected:
        async with redis_client.acquire() as conn:
            redis_payload = await conn.hgetall(f"autotrade:indicators:{normalized_symbol}")
        if redis_payload:
            indicator_payload = _parse_indicator_hash(redis_payload)
            indicator_payload["stream_depth"] = 0
            indicator_payload["source"] = "redis"
            return {"indicator": indicator_payload}

    tool_cache = ToolCache(ttl_seconds=settings.tool_cache_ttl_seconds)
    market_tool = LiveMarketDataTool(cache=tool_cache, settings=settings)
    indicator_tool = IndicatorCalculatorTool(cache=tool_cache, settings=settings)

    try:
        market_data = await market_tool.fetch([normalized_symbol])
    except Exception as exc:  # pragma: no cover - network path
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Live market data fetch failed: {exc}",
        ) from exc

    indicator_results = await indicator_tool.compute(market_data)
    computation = indicator_results.get(normalized_symbol)
    if computation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Indicator data unavailable")

    fetched_at = market_data.get(normalized_symbol).fetched_at if normalized_symbol in market_data else None
    payload = _indicator_payload_from_result(computation, fetched_at=fetched_at)
    payload["source"] = "live"
    payload["stream_depth"] = 0
    payload["tool_cache_snapshot"] = [
        {
            "key": entry.key,
            "stored_at": entry.stored_at,
            "age_seconds": entry.age_seconds,
            "value_type": entry.value_type,
        }
        for entry in tool_cache.snapshot()
    ]
    return {"indicator": payload}


@router.get("/scheduler/status", summary="Retrieve scheduler status")
async def scheduler_status() -> dict:
    scheduler = get_scheduler()
    status_payload = scheduler.status().as_dict()
    return {"scheduler": status_payload}


@router.post("/scheduler/pause", summary="Pause scheduler")
async def pause_scheduler() -> dict:
    scheduler = get_scheduler()
    await scheduler.pause()
    return {"status": "paused", "scheduler": scheduler.status().as_dict()}


@router.post("/scheduler/resume", summary="Resume scheduler")
async def resume_scheduler() -> dict:
    scheduler = get_scheduler()
    await scheduler.resume()
    return {"status": "running", "scheduler": scheduler.status().as_dict()}


def _require_cron_token(request: Request, settings: Settings) -> None:
    secret = settings.cron_trigger_token
    if not secret:
        return
    provided = request.headers.get("x-cron-token")
    if not provided or not secrets.compare_digest(provided, secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid cron token")


@router.post("/scheduler/trigger", summary="Trigger immediate evaluation")
async def trigger_scheduler() -> dict:
    scheduler = get_scheduler()
    triggered_at = await scheduler.trigger_run()
    return {
        "triggered_at": triggered_at.isoformat(),
        "scheduler": scheduler.status().as_dict(),
    }


@router.post("/scheduler/cron-trigger", summary="Trigger evaluation via external cron job")
async def cron_trigger_scheduler(request: Request, settings: Settings = Depends(get_settings)) -> dict:
    _require_cron_token(request, settings)
    scheduler = get_scheduler()
    triggered_at = await scheduler.trigger_run()
    return {
        "triggered_at": triggered_at.isoformat(),
        "scheduler": scheduler.status().as_dict(),
    }
class RuntimeModeRequest(BaseModel):
    mode: RuntimeMode

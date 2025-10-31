from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from ..config import Settings, get_settings
from ..repositories import fetch_decision_by_id, fetch_decisions, fetch_latest_portfolio
from ..scheduler import get_scheduler
from ..redis_client import get_redis
from ..tools import IndicatorCalculatorTool, IndicatorComputationResult, LiveMarketDataTool, ToolCache

router = APIRouter()


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
    payload = asdict(snapshot)
    payload["service"] = settings.service_name
    payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    return {"portfolio": payload}


@router.get("/decisions", summary="List auto-trading decisions")
async def list_decisions(symbol: str | None = None) -> dict:
    decisions = await fetch_decisions(symbol)
    return {"items": [asdict(decision) for decision in decisions], "next_cursor": None}


@router.get("/decisions/{decision_id}", summary="Retrieve decision by id")
async def get_decision(decision_id: UUID) -> dict:
    decision = await fetch_decision_by_id(str(decision_id))
    if decision is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision not found")
    return {"decision": asdict(decision)}


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


@router.post("/scheduler/trigger", summary="Trigger immediate evaluation")
async def trigger_scheduler() -> dict:
    scheduler = get_scheduler()
    triggered_at = await scheduler.trigger_run()
    return {
        "triggered_at": triggered_at.isoformat(),
        "scheduler": scheduler.status().as_dict(),
    }

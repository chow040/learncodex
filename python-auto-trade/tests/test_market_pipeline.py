from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import List

import pytest

from autotrade_service.config import get_settings
from autotrade_service.indicators import IndicatorCalculations, IndicatorService
from autotrade_service.market_data.models import SymbolTick
from autotrade_service.pipelines.market_pipeline import MarketDataPipeline


class InMemoryTickBuffer:
    def __init__(self) -> None:
        self._storage: dict[str, List[SymbolTick]] = {}

    async def append(self, tick: SymbolTick) -> str | None:
        self._storage.setdefault(tick.symbol, []).append(tick)
        return "0-0"

    async def read_latest(self, symbol: str, *, count: int = 120) -> list[SymbolTick]:
        return self._storage.get(symbol, [])[-count:]

    async def stream_length(self, symbol: str) -> int:
        return len(self._storage.get(symbol, []))


def test_market_pipeline_run_once_without_ws(monkeypatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("AUTOTRADE_CCXT_ENABLED", "false")
    monkeypatch.delenv("AUTOTRADE_FUNDING_PROVIDER_BASE_URL", raising=False)

    tick_buffer = InMemoryTickBuffer()
    symbol = "BTC-USD"

    pipeline = MarketDataPipeline(
        symbols=[symbol],
        tick_buffer=tick_buffer,  # type: ignore[arg-type]
        indicator_service_factory=lambda buffer: IndicatorService(buffer, calculations=IndicatorCalculations()),
    )

    results = asyncio.run(pipeline.run_once())
    assert len(results) == 1
    assert results[0].symbol == symbol
    assert results[0].indicator is None
    assert results[0].funding is None
    assert results[0].stream_depth == 0
    assert results[0].compaction_bars == 0


def test_market_pipeline_indicator_snapshot(monkeypatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("AUTOTRADE_CCXT_ENABLED", "false")
    tick_buffer = InMemoryTickBuffer()
    symbol = "ETH-USD"

    calc = IndicatorCalculations()
    calc.ema_fast_period = 3
    calc.ema_slow_period = 5
    calc.signal_period = 2
    calc.rsi_period = 3
    service = IndicatorService(tick_buffer, calculations=calc)  # type: ignore[arg-type]

    start = datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)
    for idx in range(0, 720):  # 12 hours of minute-level ticks
        tick = SymbolTick(
            symbol=symbol,
            price=1800.0 + idx * 2,
            volume=1.0 + (idx % 4),
            exchange_timestamp=start + timedelta(minutes=idx),
        )
        asyncio.run(tick_buffer.append(tick))

    pipeline = MarketDataPipeline(
        symbols=[symbol],
        tick_buffer=tick_buffer,  # type: ignore[arg-type]
        indicator_service_factory=lambda _: service,
    )

    snapshot = asyncio.run(pipeline.latest_indicator(symbol))
    assert snapshot is not None
    assert snapshot.symbol == symbol
    assert snapshot.price >= 0.0
    assert snapshot.rsi14 >= 0.0
    assert snapshot.rsi7 >= 0.0
    assert snapshot.higher_timeframe is not None
    assert snapshot.higher_timeframe.rsi14 >= 0.0

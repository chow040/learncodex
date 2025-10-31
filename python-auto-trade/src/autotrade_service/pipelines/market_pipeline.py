from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable

from ..config import get_settings
from ..indicators import IndicatorService, IndicatorSnapshot
from ..indicators.calculations import IndicatorCalculations
from ..market_data import CCXTMarketConfig, CCXTMarketDataAdapter, RedisTickBuffer, TickBufferSettings
from ..providers import FundingFetcher, FundingSnapshot
from .tick_compactor import TickCompactor, TickCompactorSettings


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class MarketPipelineResult:
    symbol: str
    indicator: IndicatorSnapshot | None
    funding: FundingSnapshot | None
    stream_depth: int
    compaction_bars: int
    processed_at: datetime


class MarketDataPipeline:
    """
    Coordinates market data ingestion, indicator calculations, and funding snapshots.
    """

    def __init__(
        self,
        *,
        symbols: Iterable[str] | None = None,
        tick_buffer: RedisTickBuffer | None = None,
        indicator_service_factory: Callable[[RedisTickBuffer], IndicatorService] | None = None,
        funding_fetcher: FundingFetcher | None = None,
    ) -> None:
        settings = get_settings()
        self._symbols = list(symbols) if symbols else settings.symbols or ["BTC-USD"]
        tick_settings = TickBufferSettings(
            retention=timedelta(hours=1),
            max_entries_per_symbol=settings.tick_compaction_max_ticks or 12_000,
            backpressure_threshold=settings.tick_backpressure_max_stream_size,
        )
        self._tick_buffer = tick_buffer or RedisTickBuffer(settings=tick_settings)
        calculations = IndicatorCalculations()
        self._indicator_service = (
            indicator_service_factory(self._tick_buffer)
            if indicator_service_factory
            else IndicatorService(
                self._tick_buffer,
                calculations=calculations,
                timeframe_seconds=settings.indicator_timeframe_seconds,
                volume_ratio_period=settings.indicator_volume_ratio_period,
            )
        )
        if funding_fetcher is not None:
            self._funding_fetcher: FundingFetcher | None = funding_fetcher
        elif settings.funding_provider_base_url:
            self._funding_fetcher = FundingFetcher()
        else:
            self._funding_fetcher = None
        self._ccxt_adapter: CCXTMarketDataAdapter | None = None
        if settings.ccxt_enabled:
            ccxt_config = CCXTMarketConfig.from_settings(settings, self._symbols)
            for sym in ccxt_config.internal_symbols:
                if sym not in self._symbols:
                    self._symbols.append(sym)
            self._ccxt_adapter = CCXTMarketDataAdapter(ccxt_config, tick_buffer=self._tick_buffer, settings=settings)
        if settings.tick_compaction_enabled:
            compactor_settings = TickCompactorSettings(
                timeframe=timedelta(seconds=settings.tick_compaction_timeframe_seconds),
                max_bars=settings.tick_compaction_max_bars,
                max_ticks=settings.tick_compaction_max_ticks,
            )
            self._compactor: TickCompactor | None = TickCompactor(compactor_settings)
            self._compaction_interval = timedelta(minutes=settings.tick_compaction_interval_minutes)
        else:
            self._compactor = None
            self._compaction_interval = timedelta(minutes=5)
        self._last_compaction: datetime | None = None
        self._logger = logging.getLogger("autotrade.pipeline.market")
        self._lock = asyncio.Lock()

    async def ensure_running(self) -> None:
        if self._ccxt_adapter:
            await self._ccxt_adapter.start()

    async def shutdown(self) -> None:
        async with self._lock:
            if self._ccxt_adapter:
                await self._ccxt_adapter.stop()
            if self._funding_fetcher:
                await self._funding_fetcher.close()

    async def run_once(self) -> list[MarketPipelineResult]:
        await self.ensure_running()
        if self._ccxt_adapter:
            await self._ccxt_adapter.poll_once()
        compaction_counts: dict[str, int] = {}
        should_compact = self._should_compact()
        if should_compact:
            compaction_counts = await self._run_compaction()
            self._last_compaction = _utcnow()
        results: list[MarketPipelineResult] = []
        for symbol in self._symbols:
            indicator = await self._indicator_service.compute_and_store(symbol)
            funding_snapshot = None
            if self._funding_fetcher:
                try:
                    funding_snapshot = await self._funding_fetcher.fetch_snapshot(symbol)
                except Exception as exc:  # pragma: no cover - resilience path
                    self._logger.warning("Funding fetch failed for %s: %s", symbol, exc)
            compaction_bars = compaction_counts.get(symbol, 0)
            results.append(
                MarketPipelineResult(
                    symbol=symbol,
                    indicator=indicator,
                    funding=funding_snapshot,
                    stream_depth=await self._tick_buffer.stream_length(symbol),
                    compaction_bars=compaction_bars,
                    processed_at=_utcnow(),
                )
            )
        return results

    async def latest_indicator(self, symbol: str) -> IndicatorSnapshot | None:
        return await self._indicator_service.compute_from_ticks(symbol)

    @property
    def tick_buffer(self) -> RedisTickBuffer:
        return self._tick_buffer

    async def stream_depth(self, symbol: str) -> int:
        return await self._tick_buffer.stream_length(symbol)

    def _should_compact(self) -> bool:
        if not self._compactor:
            return False
        if self._last_compaction is None:
            return True
        return (_utcnow() - self._last_compaction) >= self._compaction_interval

    async def _compact_symbol(self, symbol: str) -> int:
        if not self._compactor:
            return 0
        ticks = await self._tick_buffer.read_latest(symbol, count=self._compactor.settings.max_ticks)
        if not ticks:
            return 0
        try:
            bars = await self._compactor.compact_and_persist(symbol, ticks)
            self._logger.debug(
                "Compacted %s ticks into %s bars for %s",
                len(ticks),
                bars,
                symbol,
            )
            return bars
        except Exception as exc:  # pragma: no cover - resilience path
            self._logger.warning("Tick compaction failed for %s: %s", symbol, exc)
        return 0

    async def _run_compaction(self) -> dict[str, int]:
        if not self._compactor:
            return {}
        compaction_counts: dict[str, int] = {}
        for symbol in self._symbols:
            bars = await self._compact_symbol(symbol)
            if bars:
                compaction_counts[symbol] = bars
        return compaction_counts


_pipeline: MarketDataPipeline | None = None


def get_market_data_pipeline() -> MarketDataPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = MarketDataPipeline()
    return _pipeline


async def shutdown_market_data_pipeline() -> None:
    global _pipeline
    if _pipeline is None:
        return
    await _pipeline.shutdown()
    _pipeline = None

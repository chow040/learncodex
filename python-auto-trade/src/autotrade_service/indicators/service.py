from __future__ import annotations

import asyncio
import json
import logging
from typing import Sequence

from ..config import get_settings
from ..market_data.models import SymbolTick
from ..market_data.tick_buffer import RedisTickBuffer
from ..redis_client import get_redis
from ..repositories import upsert_market_snapshot_indicators
from .calculations import AggregatedBar, HigherTimeframeSnapshot, IndicatorCalculations, IndicatorSnapshot


class IndicatorService:
    """Computes and persists technical indicators sourced from the Redis tick buffer."""

    def __init__(
        self,
        tick_buffer: RedisTickBuffer,
        calculations: IndicatorCalculations | None = None,
        *,
        timeframe_seconds: int | None = None,
        volume_ratio_period: int | None = None,
    ) -> None:
        self._tick_buffer = tick_buffer
        self._calculations = calculations or IndicatorCalculations()
        self._logger = logging.getLogger("autotrade.indicators.service")
        self._lock = asyncio.Lock()
        settings = get_settings()
        self._timeframe_seconds = timeframe_seconds or settings.indicator_timeframe_seconds
        self._volume_ratio_period = volume_ratio_period or settings.indicator_volume_ratio_period
        self._high_timeframe_seconds = settings.indicator_high_timeframe_seconds
        self._high_volume_ratio_period = settings.indicator_high_volume_ratio_period
        self._high_macd_series_points = settings.indicator_high_macd_series_points

    async def compute_from_ticks(self, symbol: str, window: int = 7200) -> IndicatorSnapshot | None:
        snapshot, _ = await self._compute_with_ticks(symbol, window=window)
        return snapshot

    async def compute_and_store(self, symbol: str, publish: callable | None = None) -> IndicatorSnapshot | None:
        snapshot, bar = await self._compute_with_ticks(symbol)
        if snapshot is None or bar is None:
            return None
        await self._write_to_redis(snapshot)
        await self._upsert_market_snapshot(snapshot, bar)
        if publish:
            await publish(snapshot)
        return snapshot

    async def _compute_with_ticks(
        self,
        symbol: str,
        *,
        window: int = 7200,
    ) -> tuple[IndicatorSnapshot | None, AggregatedBar | None]:
        async with self._lock:
            ticks = await self._tick_buffer.read_latest(symbol, count=window)
            if not ticks:
                self._logger.debug("No ticks available for symbol %s", symbol)
                return None, None

            snapshot, bar = self._calculations.compute_intraday_snapshot(
                symbol,
                ticks,
                timeframe_seconds=self._timeframe_seconds,
                volume_ratio_period=self._volume_ratio_period,
            )
            if snapshot is None or bar is None:
                self._logger.debug("Insufficient data to compute indicators for %s", symbol)
                return snapshot, bar

            higher_tf = self._calculations.compute_higher_timeframe_snapshot(
                ticks,
                timeframe_seconds=self._high_timeframe_seconds,
                volume_ratio_period=self._high_volume_ratio_period,
                macd_series_points=self._high_macd_series_points,
            )
            snapshot.higher_timeframe = higher_tf
            return snapshot, bar

    async def _write_to_redis(self, snapshot: IndicatorSnapshot) -> None:
        redis_client = get_redis()
        if not redis_client.is_connected:
            return
        key = f"autotrade:indicators:{snapshot.symbol}"
        mapping: dict[str, str] = {
            "symbol": snapshot.symbol,
            "price": f"{snapshot.price}",
            "ema20": f"{snapshot.ema20}",
            "macd": f"{snapshot.macd}",
            "macd_signal": f"{snapshot.macd_signal}",
            "macd_histogram": f"{snapshot.macd_histogram}",
            "rsi7": f"{snapshot.rsi7}",
            "rsi14": f"{snapshot.rsi14}",
            "atr3": f"{snapshot.atr3}",
            "atr14": f"{snapshot.atr14}",
            "volume": f"{snapshot.volume}",
            "volume_ratio": f"{snapshot.volume_ratio}",
            "volatility": f"{snapshot.volatility}",
            "mid_prices": json.dumps(snapshot.mid_prices),
            "ema20_series": json.dumps(snapshot.ema20_series),
            "macd_series": json.dumps(snapshot.macd_series),
            "macd_histogram_series": json.dumps(snapshot.macd_histogram_series),
            "rsi7_series": json.dumps(snapshot.rsi7_series),
            "rsi14_series": json.dumps(snapshot.rsi14_series),
            "generated_at": snapshot.generated_at.isoformat(),
            # legacy aliases for compatibility
            "ema_fast": f"{snapshot.ema20}",
            "rsi": f"{snapshot.rsi14}",
            "atr": f"{snapshot.atr14}",
        }
        if snapshot.higher_timeframe:
            htf = snapshot.higher_timeframe
            mapping.update(
                {
                    "ema20_4h": f"{htf.ema20}",
                    "ema50_4h": f"{htf.ema50}",
                    "atr3_4h": f"{htf.atr3}",
                    "atr14_4h": f"{htf.atr14}",
                    "macd_4h": f"{htf.macd}",
                    "macd_signal_4h": f"{htf.macd_signal}",
                    "macd_histogram_4h": f"{htf.macd_histogram}",
                    "macd_histogram_series_4h": json.dumps(htf.macd_histogram_series),
                    "macd_series_4h": json.dumps(htf.macd_series),
                    "rsi14_4h": f"{htf.rsi14}",
                    "volume_4h": f"{htf.volume}",
                    "volume_avg_4h": f"{htf.volume_avg}",
                    "volume_ratio_4h": f"{htf.volume_ratio}",
                    "rsi14_series_4h": json.dumps(htf.rsi14_series),
                    "generated_at_4h": htf.generated_at.isoformat(),
                }
            )
        async with redis_client.acquire() as conn:
            await conn.hset(key, mapping=mapping)  # type: ignore[arg-type]
            await conn.expire(key, 300)

    async def _upsert_market_snapshot(self, snapshot: IndicatorSnapshot, bar: AggregatedBar) -> None:
        await upsert_market_snapshot_indicators(
            symbol=snapshot.symbol,
            bucket_start=bar.bucket_start,
            bucket_end=bar.bucket_end,
            open_price=bar.open_price,
            high_price=bar.high_price,
            low_price=bar.low_price,
            close_price=bar.close_price,
            volume=bar.volume,
            ema_fast=snapshot.ema20,
            ema_slow=None,
            macd=snapshot.macd,
            macd_signal=snapshot.macd_signal,
            macd_histogram=snapshot.macd_histogram,
            rsi=snapshot.rsi14,
            rsi_short=snapshot.rsi7,
            atr=snapshot.atr14,
            atr_short=snapshot.atr3,
            volatility=snapshot.volatility,
            volume_ratio=snapshot.volume_ratio,
        )

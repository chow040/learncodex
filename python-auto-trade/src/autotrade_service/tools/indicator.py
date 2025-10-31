from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Iterable, Mapping

import pandas as pd

from ..config import Settings, get_settings
from ..indicators.calculations import (
    HigherTimeframeSnapshot,
    IndicatorCalculations,
    IndicatorSnapshot,
)
from .cache import ToolCache
from .live_market import LiveMarketData, OhlcCandle


@dataclass(slots=True)
class IndicatorComputationResult:
    symbol: str
    snapshot: IndicatorSnapshot | None
    intraday_bar_count: int
    high_timeframe_bar_count: int
    market_data: LiveMarketData


@dataclass(slots=True)
class IndicatorSnapshotBundle:
    snapshot: IndicatorSnapshot | None
    higher_timeframe: HigherTimeframeSnapshot | None


class IndicatorCalculatorTool:
    """
    Computes intraday + higher timeframe indicator snapshots using OHLC payloads
    fetched by the LiveMarketDataTool. Results can be cached for the duration of
    a scheduler run to avoid redundant calculations.
    """

    def __init__(
        self,
        *,
        cache: ToolCache | None = None,
        settings: Settings | None = None,
        calculations: IndicatorCalculations | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._cache = cache
        self._calculations = calculations or IndicatorCalculations()
        self._timeframe_seconds = self._settings.indicator_timeframe_seconds
        self._volume_ratio_period = self._settings.indicator_volume_ratio_period
        self._high_timeframe_seconds = self._settings.indicator_high_timeframe_seconds
        self._high_volume_ratio_period = self._settings.indicator_high_volume_ratio_period
        self._high_macd_series_points = self._settings.indicator_high_macd_series_points
        self._logger = logging.getLogger("autotrade.tools.indicator")

    async def compute(
        self,
        market_data: Mapping[str, LiveMarketData],
    ) -> Dict[str, IndicatorComputationResult]:
        results: Dict[str, IndicatorComputationResult] = {}
        for symbol, data in market_data.items():
            cached = self._get_cached(symbol)
            if cached:
                results[symbol] = cached
                continue

            intraday_df = self._build_dataframe(data.ohlcv_intraday)
            if intraday_df.empty:
                self._logger.warning("No intraday OHLCV bars available for %s; skipping indicator computation", symbol)
                continue

            snapshot, _ = self._calculations.compute_intraday_from_bars(
                symbol=symbol,
                bars=intraday_df,
                timeframe_seconds=self._timeframe_seconds,
                volume_ratio_period=self._volume_ratio_period,
            )
            if snapshot is None:
                self._logger.warning("Indicator calculations produced no snapshot for %s", symbol)
                continue

            snapshot.price = data.last_price or snapshot.price

            high_tf_df = self._build_dataframe(data.ohlcv_high_timeframe)
            higher_snapshot: HigherTimeframeSnapshot | None = None
            if not high_tf_df.empty:
                higher_snapshot = self._calculations.compute_higher_timeframe_from_bars(
                    bars=high_tf_df,
                    timeframe_seconds=self._high_timeframe_seconds,
                    volume_ratio_period=self._high_volume_ratio_period,
                    macd_series_points=self._high_macd_series_points,
                )
            snapshot.higher_timeframe = higher_snapshot

            result = IndicatorComputationResult(
                symbol=symbol,
                snapshot=snapshot,
                intraday_bar_count=int(len(intraday_df)),
                high_timeframe_bar_count=int(len(high_tf_df)),
                market_data=data,
            )
            if self._cache:
                self._cache.set(self._cache_key(symbol), result)
            results[symbol] = result
        return results

    def _get_cached(self, symbol: str) -> IndicatorComputationResult | None:
        if not self._cache:
            return None
        cached = self._cache.get(self._cache_key(symbol))
        if cached is None:
            return None
        return cached

    @staticmethod
    def _build_dataframe(candles: Iterable[OhlcCandle]) -> pd.DataFrame:
        records = [
            {
                "timestamp": candle.timestamp,
                "open": candle.open,
                "high": candle.high,
                "low": candle.low,
                "close": candle.close,
                "volume": candle.volume,
            }
            for candle in candles
        ]
        if not records:
            return pd.DataFrame()
        df = pd.DataFrame(records)
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
        return df.set_index("timestamp").sort_index()

    def _cache_key(self, symbol: str) -> str:
        return f"indicator:{symbol}"


__all__ = ["IndicatorCalculatorTool", "IndicatorComputationResult"]

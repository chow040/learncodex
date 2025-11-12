from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import sqrt
from typing import Iterable, Sequence

import numpy as np
import pandas as pd

from ..market_data.models import SymbolTick


def _to_series(values: Iterable[float]) -> pd.Series:
    return pd.Series(list(values), dtype="float64")


def _last_value(series: pd.Series | None) -> float:
    if series is None or series.empty:
        return 0.0
    value = series.iloc[-1]
    if pd.isna(value):
        return 0.0
    return float(value)


def _ema(series: pd.Series, span: int) -> pd.Series:
    if series.empty:
        return series
    return series.ewm(span=span, adjust=False).mean()


def _rsi(series: pd.Series, length: int) -> pd.Series:
    if series.empty:
        return series
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta.clip(upper=0.0)).abs()
    avg_gain = gain.ewm(alpha=1 / length, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / length, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50.0)


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, length: int) -> pd.Series:
    if close.empty:
        return close
    prev_close = close.shift(1)
    ranges = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return ranges.ewm(alpha=1 / length, adjust=False).mean()


def _resample_ohlc(df: pd.DataFrame, timeframe_seconds: int) -> pd.DataFrame:
    if df.empty:
        return df
    rule = f"{timeframe_seconds}S"
    if timeframe_seconds % 60 == 0:
        minutes = timeframe_seconds // 60
        rule = f"{minutes}min"
    aggregated = (
        df.resample(rule)
        .agg(
            {
                "open": "first",
                "high": "max",
                "low": "min",
                "close": "last",
                "volume": "sum",
            }
        )
        .dropna(subset=["close"])
    )
    return aggregated


@dataclass(slots=True)
class IndicatorSnapshot:
    symbol: str
    price: float
    ema20: float
    macd: float
    macd_signal: float
    macd_histogram: float
    rsi7: float
    rsi14: float
    atr3: float
    atr14: float
    volume: float
    volume_ratio: float
    volatility: float
    mid_prices: list[float]
    ema20_series: list[float]
    macd_series: list[float]
    macd_histogram_series: list[float]
    rsi7_series: list[float]
    rsi14_series: list[float]
    generated_at: datetime
    higher_timeframe: "HigherTimeframeSnapshot | None" = None


@dataclass(slots=True)
class AggregatedBar:
    bucket_start: datetime
    bucket_end: datetime
    open_price: float
    high_price: float
    low_price: float
    close_price: float
    volume: float


@dataclass(slots=True)
class HigherTimeframeSnapshot:
    ema20: float
    ema50: float
    atr3: float
    atr14: float
    macd: float
    macd_signal: float
    macd_histogram: float
    macd_histogram_series: list[float]
    rsi14: float
    volume: float
    volume_avg: float
    volume_ratio: float
    macd_series: list[float]
    rsi14_series: list[float]
    generated_at: datetime


class IndicatorCalculations:
    ema_fast_period: int = 12
    ema_slow_period: int = 26
    signal_period: int = 9
    rsi_period: int = 14
    atr_period: int = 14
    volatility_period: int = 30
    volume_ratio_period: int = 20

    def ema(self, closes: Iterable[float], period: int) -> float:
        return _last_value(_ema(_to_series(closes), period))

    def sma(self, values: Iterable[float], period: int) -> float:
        series = _to_series(values)
        if len(series) < period or period <= 0:
            return 0.0
        window = series.tail(period)
        mean_value = window.mean()
        if pd.isna(mean_value):
            return 0.0
        return float(mean_value)

    def volume_average(self, volumes: Iterable[float], period: int) -> float:
        return self.sma(volumes, period)

    def trend_direction(
        self,
        values: Iterable[float],
        *,
        lookback: int | None = None,
        tolerance: float = 0.0,
    ) -> str:
        series = _to_series(values)
        if series.empty:
            return "sideways"
        if lookback and len(series) > lookback:
            series = series.tail(lookback)
        start = float(series.iloc[0])
        end = float(series.iloc[-1])
        delta = end - start
        tol = abs(tolerance)
        if delta > tol:
            return "uptrend"
        if delta < -tol:
            return "downtrend"
        return "sideways"

    def macd(self, closes: Iterable[float]) -> tuple[float, float, float]:
        close_series = _to_series(closes)
        if close_series.empty:
            return 0.0, 0.0, 0.0
        ema_fast = _ema(close_series, self.ema_fast_period)
        ema_slow = _ema(close_series, self.ema_slow_period)
        macd_line = ema_fast - ema_slow
        macd_signal = _ema(macd_line, self.signal_period)
        macd_hist = macd_line - macd_signal
        return _last_value(macd_line), _last_value(macd_signal), _last_value(macd_hist)

    def rsi(self, closes: Iterable[float], period: int | None = None) -> float:
        target_period = period or self.rsi_period
        return _last_value(_rsi(_to_series(closes), target_period))

    def atr(
        self,
        highs: Iterable[float],
        lows: Iterable[float],
        closes: Iterable[float],
        period: int | None = None,
    ) -> float:
        target_period = period or self.atr_period
        return _last_value(_atr(_to_series(highs), _to_series(lows), _to_series(closes), target_period))

    def volatility(self, closes: Iterable[float], period: int = 30) -> float:
        close_series = _to_series(closes)
        if len(close_series) < period:
            return 0.0
        window = close_series.tail(period)
        variance = window.var(ddof=0)
        if pd.isna(variance):
            return 0.0
        return sqrt(float(variance))

    def compute_intraday_snapshot(
        self,
        symbol: str,
        ticks: Sequence[SymbolTick],
        *,
        timeframe_seconds: int,
        volume_ratio_period: int,
    ) -> tuple[IndicatorSnapshot | None, AggregatedBar | None]:
        if not ticks:
            return None, None

        df = pd.DataFrame(
            {
                "timestamp": [tick.exchange_timestamp or tick.received_at for tick in ticks],
                "price": [tick.price for tick in ticks],
                "volume": [tick.volume for tick in ticks],
            }
        )
        if df.empty:
            return None, None

        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
        df = df.sort_values("timestamp").set_index("timestamp")

        rule = f"{timeframe_seconds}S"
        if timeframe_seconds % 60 == 0:
            rule = f"{timeframe_seconds // 60}min"

        price_ohlc = df["price"].resample(rule).ohlc()
        volume_sum = df["volume"].resample(rule).sum()
        bars = price_ohlc.join(volume_sum.rename("volume"), how="inner").dropna(subset=["close"])
        if bars.empty:
            return None, None
        return self._compute_snapshot_from_bars(
            symbol=symbol,
            bars=bars,
            timeframe_seconds=timeframe_seconds,
            volume_ratio_period=volume_ratio_period,
        )

    def compute_intraday_from_bars(
        self,
        *,
        symbol: str,
        bars: pd.DataFrame,
        timeframe_seconds: int,
        volume_ratio_period: int,
    ) -> tuple[IndicatorSnapshot | None, AggregatedBar | None]:
        if bars.empty:
            return None, None
        resampled = _resample_ohlc(bars, timeframe_seconds)
        if resampled.empty:
            return None, None
        return self._compute_snapshot_from_bars(
            symbol=symbol,
            bars=resampled,
            timeframe_seconds=timeframe_seconds,
            volume_ratio_period=volume_ratio_period,
        )

    def compute_higher_timeframe_snapshot(
        self,
        ticks: Sequence[SymbolTick],
        *,
        timeframe_seconds: int,
        volume_ratio_period: int,
        macd_series_points: int = 5,
    ) -> HigherTimeframeSnapshot | None:
        if not ticks:
            return None

        df = pd.DataFrame(
            {
                "timestamp": [tick.exchange_timestamp or tick.received_at for tick in ticks],
                "price": [tick.price for tick in ticks],
                "volume": [tick.volume for tick in ticks],
            }
        )
        if df.empty:
            return None

        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
        df = df.sort_values("timestamp").set_index("timestamp")

        rule = f"{timeframe_seconds}S"
        if timeframe_seconds % 60 == 0:
            rule = f"{timeframe_seconds // 60}min"

        price_ohlc = df["price"].resample(rule).ohlc()
        volume_sum = df["volume"].resample(rule).sum()
        bars = price_ohlc.join(volume_sum.rename("volume"), how="inner").dropna(subset=["close"])
        if bars.empty:
            return None
        return self.compute_higher_timeframe_from_bars(
            bars=bars,
            timeframe_seconds=timeframe_seconds,
            volume_ratio_period=volume_ratio_period,
            macd_series_points=macd_series_points,
        )

    def compute_higher_timeframe_from_bars(
        self,
        *,
        bars: pd.DataFrame,
        timeframe_seconds: int,
        volume_ratio_period: int,
        macd_series_points: int = 5,
    ) -> HigherTimeframeSnapshot | None:
        if bars.empty:
            return None

        resampled = _resample_ohlc(bars, timeframe_seconds)
        if resampled.empty:
            return None

        rolling_avg_volume = resampled["volume"].rolling(volume_ratio_period, min_periods=1).mean()
        resampled = resampled.copy()
        resampled["volume_ratio"] = resampled["volume"] / rolling_avg_volume
        resampled["volume_ratio"] = resampled["volume_ratio"].replace([np.inf, -np.inf], 0.0).fillna(0.0)

        if len(resampled) < 2:
            return None

        close_series = resampled["close"]
        ema20_series = _ema(close_series, 20)
        ema50_series = _ema(close_series, 50)

        macd_line_series = _ema(close_series, self.ema_fast_period) - _ema(close_series, self.ema_slow_period)
        macd_signal_series = _ema(macd_line_series, self.signal_period)
        macd_hist_series = macd_line_series - macd_signal_series

        rsi14_series = _rsi(close_series, 14)
        atr3_series = _atr(resampled["high"], resampled["low"], close_series, 3)
        atr14_series = _atr(resampled["high"], resampled["low"], close_series, 14)

        current_idx = resampled.index[-1]
        bucket_start = current_idx.to_pydatetime()
        if bucket_start.tzinfo is None:
            bucket_start = bucket_start.replace(tzinfo=timezone.utc)
        else:
            bucket_start = bucket_start.astimezone(timezone.utc)
        bucket_end = bucket_start + timedelta(seconds=timeframe_seconds)

        return HigherTimeframeSnapshot(
            ema20=_last_value(ema20_series),
            ema50=_last_value(ema50_series),
            atr3=_last_value(atr3_series),
            atr14=_last_value(atr14_series),
            macd=_last_value(macd_line_series),
            macd_signal=_last_value(macd_signal_series),
            macd_histogram=_last_value(macd_hist_series),
            macd_histogram_series=[float(v) for v in macd_hist_series.tail(macd_series_points).tolist()],
            rsi14=_last_value(rsi14_series),
            volume=float(resampled.iloc[-1]["volume"]),
            volume_avg=float(rolling_avg_volume.iloc[-1]) if not rolling_avg_volume.empty else 0.0,
            volume_ratio=float(resampled.iloc[-1]["volume_ratio"]),
            macd_series=[float(v) for v in macd_line_series.tail(macd_series_points).tolist()],
            rsi14_series=[float(v) for v in rsi14_series.tail(macd_series_points).tolist()],
            generated_at=bucket_end,
        )

    def _compute_snapshot_from_bars(
        self,
        *,
        symbol: str,
        bars: pd.DataFrame,
        timeframe_seconds: int,
        volume_ratio_period: int,
    ) -> tuple[IndicatorSnapshot | None, AggregatedBar | None]:
        if bars.empty:
            return None, None

        bars = bars.copy().sort_index()
        rolling_avg_volume = bars["volume"].rolling(volume_ratio_period, min_periods=1).mean()
        bars["volume_ratio"] = bars["volume"] / rolling_avg_volume
        bars["volume_ratio"] = bars["volume_ratio"].replace([np.inf, -np.inf], 0.0).fillna(0.0)

        lookback = max(volume_ratio_period, 20)
        if len(bars) < lookback:
            return None, None

        close_series = bars["close"]
        ema20_series = _ema(close_series, 20)
        macd_line_series = _ema(close_series, self.ema_fast_period) - _ema(close_series, self.ema_slow_period)
        macd_signal_series = _ema(macd_line_series, self.signal_period)
        macd_hist_series = macd_line_series - macd_signal_series
        rsi7_series = _rsi(close_series, 7)
        rsi14_series = _rsi(close_series, 14)
        atr3_series = _atr(bars["high"], bars["low"], close_series, 3)
        atr14_series = _atr(bars["high"], bars["low"], close_series, 14)
        volatility_series = close_series.rolling(self.volatility_period, min_periods=1).std()

        current_idx = bars.index[-1]
        current = bars.iloc[-1]

        bucket_start = current_idx.to_pydatetime()
        if bucket_start.tzinfo is None:
            bucket_start = bucket_start.replace(tzinfo=timezone.utc)
        else:
            bucket_start = bucket_start.astimezone(timezone.utc)
        bucket_end = bucket_start + timedelta(seconds=timeframe_seconds)

        snapshot = IndicatorSnapshot(
            symbol=symbol,
            price=float(current["close"]),
            ema20=_last_value(ema20_series),
            macd=_last_value(macd_line_series),
            macd_signal=_last_value(macd_signal_series),
            macd_histogram=_last_value(macd_hist_series),
            rsi7=_last_value(rsi7_series),
            rsi14=_last_value(rsi14_series),
            atr3=_last_value(atr3_series),
            atr14=_last_value(atr14_series),
            volume=float(current["volume"]),
            volume_ratio=float(current["volume_ratio"]),
            volatility=_last_value(volatility_series),
            mid_prices=[float(v) for v in close_series.tolist()],
            ema20_series=[float(v) for v in ema20_series.tolist()],
            macd_series=[float(v) for v in macd_line_series.tolist()],
            macd_histogram_series=[float(v) for v in macd_hist_series.tolist()],
            rsi7_series=[float(v) for v in rsi7_series.tolist()],
            rsi14_series=[float(v) for v in rsi14_series.tolist()],
            generated_at=bucket_end,
        )

        bar = AggregatedBar(
            bucket_start=bucket_start,
            bucket_end=bucket_end,
            open_price=float(current["open"]),
            high_price=float(current["high"]),
            low_price=float(current["low"]),
            close_price=float(current["close"]),
            volume=float(current["volume"]),
        )

        return snapshot, bar

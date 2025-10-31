from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json

from autotrade_service.api.routes import _parse_indicator_hash
from autotrade_service.indicators import IndicatorCalculations
from autotrade_service.market_data.models import SymbolTick


def test_indicator_calculations_macd_and_rsi() -> None:
    closes = [
        45990.0,
        46010.0,
        46050.0,
        46100.0,
        46120.0,
        46150.0,
        46180.0,
        46200.0,
        46250.0,
        46280.0,
        46310.0,
        46350.0,
        46320.0,
        46290.0,
        46260.0,
        46210.0,
        46180.0,
        46130.0,
        46090.0,
        46050.0,
        46020.0,
        45980.0,
        45950.0,
        45910.0,
        45880.0,
        45850.0,
        45820.0,
        45790.0,
        45760.0,
    ]
    calc = IndicatorCalculations()
    calc.ema_fast_period = 5
    calc.ema_slow_period = 8
    calc.signal_period = 3
    calc.rsi_period = 5

    ema_fast = calc.ema(closes, calc.ema_fast_period)
    assert ema_fast > 45700.0

    macd_line, signal, histogram = calc.macd(closes)
    assert isinstance(macd_line, float)
    assert isinstance(signal, float)
    assert isinstance(histogram, float)

    rsi = calc.rsi(closes)
    assert 0.0 <= rsi <= 100.0

    atr = calc.atr(closes, closes, closes)
    assert atr >= 0.0

    volatility = calc.volatility(closes, period=10)
    assert volatility >= 0.0


def test_parse_indicator_hash_handles_strings() -> None:
    data = {
        "symbol": "BTC-USD",
        "price": "12345.6",
        "ema20": "12340.0",
        "macd": "1.23",
        "macd_signal": "1.11",
        "macd_histogram": "0.12",
        "rsi7": "55.5",
        "rsi14": "60.1",
        "atr3": "12.3",
        "atr14": "45.6",
        "volume": "150",
        "volume_ratio": "1.4",
        "volatility": "12.3",
        "ema20_4h": "12500.0",
        "ema50_4h": "12600.0",
        "atr3_4h": "34.5",
        "atr14_4h": "40.1",
        "macd_4h": "0.45",
        "macd_signal_4h": "0.30",
        "macd_histogram_4h": "0.15",
        "macd_histogram_series_4h": json.dumps([0.1, 0.2, 0.3]),
        "rsi14_4h": "52.0",
        "volume_4h": "600",
        "volume_ratio_4h": "1.2",
        "generated_at_4h": "2025-10-29T12:00:00+00:00",
    }
    parsed = _parse_indicator_hash(data)
    assert parsed["symbol"] == "BTC-USD"
    assert isinstance(parsed["price"], float)
    assert parsed["price"] == 12345.6
    assert parsed["ema20"] == 12340.0
    assert parsed["volume_ratio"] == 1.4
    assert "higher_timeframe" in parsed
    htf = parsed["higher_timeframe"]
    assert htf["ema20"] == 12500.0
    assert htf["ema50"] == 12600.0
    assert htf["macd_histogram_series"] == [0.1, 0.2, 0.3]


def test_compute_intraday_snapshot_generates_three_minute_metrics() -> None:
    calc = IndicatorCalculations()
    start = datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)
    ticks: list[SymbolTick] = []
    for minutes_ahead in range(0, 90):  # 30 three-minute bars
        ts = start + timedelta(minutes=minutes_ahead)
        ticks.append(
            SymbolTick(
                symbol="BTC-USD",
                price=10000.0 + minutes_ahead * 5,
                volume=1.0 + (minutes_ahead % 3),
                exchange_timestamp=ts,
            )
        )

    snapshot, bar = calc.compute_intraday_snapshot(
        "BTC-USD",
        ticks,
        timeframe_seconds=180,
        volume_ratio_period=5,
    )

    assert snapshot is not None
    assert bar is not None
    assert snapshot.symbol == "BTC-USD"
    assert snapshot.price == bar.close_price
    assert snapshot.ema20 != 0.0
    assert snapshot.macd_signal is not None
    assert snapshot.rsi7 >= 0.0
    assert snapshot.rsi14 >= 0.0
    assert snapshot.atr3 >= 0.0
    assert snapshot.atr14 >= 0.0
    assert snapshot.volume > 0.0
    assert snapshot.volume_ratio >= 0.0
    assert snapshot.higher_timeframe is None  # computed separately


def test_compute_higher_timeframe_snapshot_returns_four_hour_context() -> None:
    calc = IndicatorCalculations()
    start = datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc)
    ticks: list[SymbolTick] = []
    for idx in range(0, 24 * 7):
        ts = start + timedelta(hours=idx)
        ticks.append(
            SymbolTick(
                symbol="BTC-USD",
                price=20000 + idx * 5,
                volume=2 + (idx % 4),
                exchange_timestamp=ts,
            )
        )

    higher = calc.compute_higher_timeframe_snapshot(
        ticks,
        timeframe_seconds=14_400,
        volume_ratio_period=4,
        macd_series_points=3,
    )

    assert higher is not None
    assert higher.ema20 != 0.0
    assert higher.ema50 != 0.0
    assert higher.macd_histogram_series
    assert higher.rsi14 >= 0.0

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from autotrade_service.market_data.models import SymbolTick
from autotrade_service.pipelines.tick_compactor import TickCompactor, TickCompactorSettings


def test_tick_compactor_builds_minute_snapshot() -> None:
    settings = TickCompactorSettings(timeframe=timedelta(minutes=1), max_bars=10, max_ticks=10)
    compactor = TickCompactor(settings)
    base = datetime(2024, 12, 1, 12, 0, tzinfo=timezone.utc)
    ticks = [
        SymbolTick(symbol="BTC-USD", price=100.0, volume=1.0, exchange_timestamp=base),
        SymbolTick(symbol="BTC-USD", price=105.0, volume=0.5, exchange_timestamp=base + timedelta(seconds=10)),
        SymbolTick(symbol="BTC-USD", price=95.0, volume=0.75, exchange_timestamp=base + timedelta(seconds=20)),
        SymbolTick(symbol="BTC-USD", price=110.0, volume=0.25, exchange_timestamp=base + timedelta(seconds=50)),
    ]

    snapshots = compactor.build_snapshots("BTC-USD", ticks)
    assert len(snapshots) == 1
    snapshot = snapshots[0]
    assert snapshot.symbol == "BTC-USD"
    assert snapshot.open_price == 100.0
    assert snapshot.close_price == 110.0
    assert snapshot.high_price == 110.0
    assert snapshot.low_price == 95.0
    assert snapshot.volume == 1.0 + 0.5 + 0.75 + 0.25
    assert snapshot.bucket_start == base.replace(second=0, microsecond=0)
    assert snapshot.bucket_end == snapshot.bucket_start + timedelta(minutes=1)

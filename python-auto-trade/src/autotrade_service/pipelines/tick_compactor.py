from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Sequence

from ..market_data.models import SymbolTick
from ..repositories import MarketSnapshot, upsert_market_snapshots


def _timestamp(tick: SymbolTick) -> datetime:
    return tick.exchange_timestamp or tick.received_at


def _floor_to_bucket(ts: datetime, timeframe: timedelta) -> datetime:
    seconds = int(timeframe.total_seconds())
    if seconds <= 0:
        return ts
    epoch_seconds = int(ts.timestamp())
    bucket_seconds = (epoch_seconds // seconds) * seconds
    return datetime.fromtimestamp(bucket_seconds, tz=timezone.utc)


@dataclass(slots=True)
class TickCompactorSettings:
    timeframe: timedelta = timedelta(minutes=1)
    max_bars: int = 120
    max_ticks: int = 7_200


class TickCompactor:
    def __init__(self, settings: TickCompactorSettings | None = None) -> None:
        self._settings = settings or TickCompactorSettings()

    @property
    def settings(self) -> TickCompactorSettings:
        return self._settings

    def build_snapshots(self, symbol: str, ticks: Sequence[SymbolTick]) -> list[MarketSnapshot]:
        if not ticks:
            return []
        sorted_ticks = sorted(ticks[-self._settings.max_ticks :], key=_timestamp)
        buckets: dict[datetime, MarketSnapshot] = {}
        timeframe = self._settings.timeframe

        for tick in sorted_ticks:
            ts = _timestamp(tick)
            bucket_start = _floor_to_bucket(ts, timeframe)
            bucket_end = bucket_start + timeframe
            price = tick.price
            volume = tick.volume

            snapshot = buckets.get(bucket_start)
            if snapshot is None:
                buckets[bucket_start] = MarketSnapshot(
                    symbol=symbol,
                    bucket_start=bucket_start,
                    bucket_end=bucket_end,
                    open_price=price,
                    high_price=price,
                    low_price=price,
                    close_price=price,
                    volume=volume,
                )
                continue

            snapshot.close_price = price
            snapshot.high_price = max(snapshot.high_price, price)
            snapshot.low_price = min(snapshot.low_price, price)
            snapshot.volume += volume

        snapshots = sorted(buckets.values(), key=lambda snap: snap.bucket_start)[-self._settings.max_bars :]
        return snapshots

    async def compact_and_persist(self, symbol: str, ticks: Iterable[SymbolTick]) -> int:
        snapshots = self.build_snapshots(symbol, list(ticks))
        if not snapshots:
            return 0
        await upsert_market_snapshots(snapshots)
        return len(snapshots)

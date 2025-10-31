from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class SymbolTick:
    symbol: str
    price: float
    volume: float
    side: Literal["buy", "sell", "unknown"] = "unknown"
    exchange_timestamp: datetime | None = None
    received_at: datetime = field(default_factory=_now)
    raw: dict[str, object] | None = None


@dataclass(slots=True)
class TickerStats:
    symbol: str
    open_price: float
    high_price: float
    low_price: float
    close_price: float
    volume: float
    vwap: float
    last_updated: datetime = field(default_factory=_now)

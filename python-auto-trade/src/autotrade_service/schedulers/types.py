from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict


@dataclass(slots=True)
class CachedSymbolData:
    symbol: str
    ticker: Dict[str, Any]
    orderbook: Dict[str, Any] | None = None
    funding: Dict[str, Any] | None = None
    ohlcv_short: Dict[str, Any] | None = None
    ohlcv_long: Dict[str, Any] | None = None
    indicators: Dict[str, Any] | None = None
    ticker_age: float | None = None
    stale: bool = False


__all__ = ["CachedSymbolData"]

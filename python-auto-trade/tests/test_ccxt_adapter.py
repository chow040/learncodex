from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Dict, List

from autotrade_service.market_data.ccxt_adapter import CCXTMarketConfig, CCXTMarketDataAdapter
from autotrade_service.market_data.models import SymbolTick


class InMemoryTickBuffer:
    def __init__(self) -> None:
        self._storage: Dict[str, List[SymbolTick]] = {}

    async def append(self, tick: SymbolTick) -> str | None:
        self._storage.setdefault(tick.symbol, []).append(tick)
        return "0-0"

    def get_ticks(self, symbol: str) -> list[SymbolTick]:
        return self._storage.get(symbol, [])


class DummyExchange:
    def __init__(self) -> None:
        self.closed = False

    async def load_markets(self) -> dict[str, str]:
        return {}

    async def fetch_trades(
        self,
        symbol: str,
        since: int | None = None,
        limit: int | None = None,
        params: dict[str, object] | None = None,
    ) -> list[dict[str, object]]:
        trades = [
            {"id": "t1", "timestamp": 1_000, "price": 100.0, "amount": 0.5, "side": "buy"},
            {"id": "t2", "timestamp": 2_000, "price": 105.5, "amount": 0.25, "side": "sell"},
        ]
        if since is None:
            return trades
        return [trade for trade in trades if int(trade["timestamp"]) > since]

    async def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1m",
        since: int | None = None,
        limit: int | None = None,
    ) -> list[list[float | int]]:
        rows: list[list[float | int]] = [
            [1_000, 100.0, 110.0, 95.0, 105.0, 15.0],
            [2_000, 105.0, 112.0, 102.0, 108.5, 12.0],
        ]
        if since is None:
            return rows
        return [row for row in rows if int(row[0]) > since]

    async def close(self) -> None:
        self.closed = True


def test_ccxt_adapter_poll_once_ingests_new_ticks() -> None:
    buffer = InMemoryTickBuffer()
    config = CCXTMarketConfig(
        exchange_id="dummy",
        symbol_map={"BTC-USD": "BTC/USDT"},
        enable_trades=True,
        enable_ohlcv=True,
    )
    exchange = DummyExchange()
    settings_stub = SimpleNamespace(symbols=[])
    adapter = CCXTMarketDataAdapter(
        config=config,
        tick_buffer=buffer,  # type: ignore[arg-type]
        exchange_factory=lambda _exchange_id, _config: exchange,
        settings=settings_stub,  # type: ignore[arg-type]
    )

    first_count = asyncio.run(adapter.poll_once())
    assert first_count == 4
    ticks = buffer.get_ticks("BTC-USD")
    assert len(ticks) == 4
    assert ticks[0].raw is not None

    second_count = asyncio.run(adapter.poll_once())
    assert second_count == 0
    assert len(buffer.get_ticks("BTC-USD")) == 4

    asyncio.run(adapter.stop())
    assert exchange.closed

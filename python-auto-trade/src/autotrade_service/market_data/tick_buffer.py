from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable

import redis.asyncio as redis

from ..redis_client import RedisClient, get_redis
from .models import SymbolTick


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class TickBufferSettings:
    stream_prefix: str = "autotrade:ticks"
    retention: timedelta = timedelta(hours=1)
    trim_strategy: str = "maxlen"
    max_entries_per_symbol: int = 12_000
    backpressure_threshold: int | None = None

    def stream_key(self, symbol: str) -> str:
        return f"{self.stream_prefix}:{symbol}"

    def resolved_backpressure_threshold(self) -> int:
        if self.backpressure_threshold is not None:
            return self.backpressure_threshold
        base = max(self.max_entries_per_symbol, 1)
        return int(base * 1.2)

    def retention_min_id(self, now: datetime) -> str:
        cutoff = now - self.retention
        cutoff_ms = int(cutoff.timestamp() * 1000)
        return f"{cutoff_ms}-0"


class RedisTickBuffer:
    """
    Append-only Redis stream storing real-time ticks, supporting bounded history retrieval.
    """

    def __init__(self, client: RedisClient | None = None, settings: TickBufferSettings | None = None) -> None:
        self._settings = settings or TickBufferSettings()
        self._redis_client = client or get_redis()
        self._logger = logging.getLogger("autotrade.market.tickbuffer")
        self._lock = asyncio.Lock()

    async def append(self, tick: SymbolTick) -> str | None:
        if not self._redis_client.is_connected:
            self._logger.debug("Redis not available; dropping tick %s", tick)
            return None
        payload = {
            "symbol": tick.symbol,
            "price": tick.price,
            "volume": tick.volume,
            "side": tick.side,
            "exchange_ts": tick.exchange_timestamp.isoformat() if tick.exchange_timestamp else "",
            "received_at": tick.received_at.isoformat(),
        }
        if tick.raw is not None:
            payload["raw"] = json.dumps(tick.raw)

        key = self._settings.stream_key(tick.symbol)
        async with self._redis_client.acquire() as conn:
            stream_length = await conn.xlen(key)
            threshold = self._settings.resolved_backpressure_threshold()
            if stream_length >= threshold:
                self._logger.warning(
                    "Redis stream %s at depth %s exceeding threshold %s; dropping tick",
                    key,
                    stream_length,
                    threshold,
                )
                return None
            stream_id = await conn.xadd(key, payload)  # type: ignore[arg-type]
            await conn.xtrim(key, maxlen=self._settings.max_entries_per_symbol, approximate=True)
            await conn.xtrim(key, minid=self._settings.retention_min_id(_utcnow()), approximate=True)
        return stream_id

    async def read_latest(self, symbol: str, *, count: int = 120) -> list[SymbolTick]:
        if not self._redis_client.is_connected:
            return []
        key = self._settings.stream_key(symbol)
        async with self._redis_client.acquire() as conn:
            records = await conn.xrevrange(key, count=count)
        ticks: list[SymbolTick] = []
        for _, fields in records:
            exchange_ts = fields.get("exchange_ts")
            received_at = fields.get("received_at")
            received_at_dt = self._parse_time(received_at) or _utcnow()
            ticks.append(
                SymbolTick(
                    symbol=symbol,
                    price=float(fields.get("price", 0.0)),
                    volume=float(fields.get("volume", 0.0)),
                    side=str(fields.get("side", "unknown")),
                    exchange_timestamp=self._parse_time(exchange_ts),
                    received_at=received_at_dt,
                    raw=json.loads(fields["raw"]) if "raw" in fields else None,
                )
            )
        ticks.reverse()
        return ticks

    async def cleanup_symbols(self, symbols: Iterable[str]) -> None:
        if not self._redis_client.is_connected:
            return
        async with self._redis_client.acquire() as conn:
            for symbol in symbols:
                key = self._settings.stream_key(symbol)
                await conn.xtrim(key, maxlen=self._settings.max_entries_per_symbol, approximate=True)
                await conn.xtrim(key, minid=self._settings.retention_min_id(_utcnow()), approximate=True)

    async def stream_length(self, symbol: str) -> int:
        if not self._redis_client.is_connected:
            return 0
        key = self._settings.stream_key(symbol)
        async with self._redis_client.acquire() as conn:
            return await conn.xlen(key)

    @staticmethod
    def _parse_time(value: str | None) -> datetime | None:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator, Callable, Optional

import redis.asyncio as redis

from .config import get_settings


class RedisClient:
    def __init__(self, *, factory: Callable[..., redis.Redis] | None = None) -> None:
        self._client: redis.Redis | None = None
        self._factory = factory or redis.from_url
        self._logger = logging.getLogger("autotrade.redis")

    async def connect(self, *, url: str | None = None) -> None:
        settings = get_settings()
        redis_url = url or settings.redis_url
        if not redis_url:
            self._logger.warning("REDIS_URL not configured; Redis features disabled")
            return
        self._client = self._factory(redis_url, encoding="utf-8", decode_responses=True)
        try:
            await self._client.ping()
        except Exception as exc:  # pragma: no cover
            self._logger.exception("Failed to ping Redis: %s", exc)
            if hasattr(self._client, "aclose"):
                await self._client.aclose()
            self._client = None
            raise

    async def disconnect(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def get_connection(self) -> redis.Redis:
        if self._client is None:
            raise RuntimeError("Redis client not initialized")
        return self._client

    async def ping(self) -> bool:
        if self._client is None:
            return False
        try:
            await self._client.ping()
            return True
        except Exception as exc:  # pragma: no cover - network failure path
            self._logger.exception("Redis ping failed: %s", exc)
            return False

    async def health_check(self) -> dict[str, Optional[float] | bool]:
        if self._client is None:
            return {"alive": False, "latency_ms": None}
        start = time.perf_counter()
        try:
            await self._client.ping()
        except Exception as exc:  # pragma: no cover - ping failure
            self._logger.exception("Redis health check failed: %s", exc)
            return {"alive": False, "latency_ms": None}
        latency_ms = (time.perf_counter() - start) * 1000
        return {"alive": True, "latency_ms": latency_ms}

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[redis.Redis]:
        if self._client is None:
            raise RuntimeError("Redis client not initialized")
        yield self._client

    @property
    def is_connected(self) -> bool:
        return self._client is not None


_redis = RedisClient()


def get_redis() -> RedisClient:
    return _redis

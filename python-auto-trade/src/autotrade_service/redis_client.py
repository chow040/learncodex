from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import redis.asyncio as redis

from .config import get_settings


class RedisClient:
    def __init__(self) -> None:
        self._client: redis.Redis | None = None
        self._logger = logging.getLogger("autotrade.redis")

    async def connect(self) -> None:
        settings = get_settings()
        if not settings.redis_url:
            self._logger.warning("REDIS_URL not configured; Redis features disabled")
            return
        self._client = redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
        try:
            await self._client.ping()
        except Exception as exc:  # pragma: no cover
            self._logger.exception("Failed to ping Redis: %s", exc)
            self._client = None
            raise

    async def disconnect(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None

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

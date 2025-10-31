from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator, Any, Protocol

try:
    import asyncpg
except ModuleNotFoundError:  # pragma: no cover - fallback for local/test environments without asyncpg
    class _AsyncConnection(Protocol):
        async def fetch(self, query: str, *args) -> list[dict]: ...

    class _AsyncPool:
        async def close(self) -> None: ...
        async def acquire(self):  # type: ignore[override]
            class _DummyContext:
                async def __aenter__(self):
                    return self

                async def __aexit__(self, exc_type, exc, tb):
                    return False

            return _DummyContext()

    class _AsyncPGStub:  # type: ignore
        Pool = _AsyncPool

        @staticmethod
        async def create_pool(*_args, **_kwargs) -> _AsyncPool:
            raise RuntimeError("asyncpg is not installed; database operations unavailable")

    asyncpg = _AsyncPGStub()  # type: ignore[assignment]

from .config import get_settings


class Database:
    def __init__(self) -> None:
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        settings = get_settings()
        if not settings.db_url:
            return
        self._pool = await asyncpg.create_pool(str(settings.db_url), min_size=1, max_size=5)

    async def disconnect(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[Any]:
        if self._pool is None:
            raise RuntimeError("Database pool is not initialized")
        async with self._pool.acquire() as connection:
            yield connection

    @property
    def is_connected(self) -> bool:
        return self._pool is not None


_db = Database()


def get_db() -> Database:
    return _db

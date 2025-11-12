import asyncio
import time

from autotrade_service.redis_client import RedisClient


class DummyRedis:
    def __init__(self) -> None:
        self._store: dict[str, tuple[str, float | None]] = {}

    async def ping(self) -> bool:  # pragma: no cover - trivial
        return True

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        expire_at = time.monotonic() + ex if ex else None
        self._store[key] = (value, expire_at)

    async def get(self, key: str) -> str | None:
        entry = self._store.get(key)
        if not entry:
            return None
        value, expire_at = entry
        if expire_at and time.monotonic() >= expire_at:
            self._store.pop(key, None)
            return None
        return value

    async def aclose(self) -> None:
        self._store.clear()


def _fake_factory(*args, **kwargs):
    return DummyRedis()


def test_redis_connect_and_ping():
    async def _run() -> None:
        client = RedisClient(factory=_fake_factory)
        await client.connect(url="redis://fake")

        assert client.is_connected
        assert await client.ping() is True

    asyncio.run(_run())


def test_redis_set_get_and_ttl_expiration():
    async def _run() -> None:
        client = RedisClient(factory=_fake_factory)
        await client.connect(url="redis://fake")

        async with client.acquire() as conn:
            await conn.set("phase1", "complete", ex=1)
            assert await conn.get("phase1") == "complete"
            await asyncio.sleep(1.1)
            assert await conn.get("phase1") is None

    asyncio.run(_run())


def test_redis_health_check_reports_latency():
    async def _run() -> None:
        client = RedisClient(factory=_fake_factory)
        await client.connect(url="redis://fake")

        result = await client.health_check()

        assert result["alive"] is True
        assert result["latency_ms"] is not None

    asyncio.run(_run())

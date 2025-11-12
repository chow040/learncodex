import json

import pytest
from fastapi.testclient import TestClient

from autotrade_service import main
from autotrade_service.config import Settings


class DummyRedis:
    def __init__(self) -> None:
        self.connected = False

    async def connect(self) -> None:
        self.connected = True

    async def disconnect(self) -> None:
        self.connected = False

    @property
    def is_connected(self) -> bool:
        return self.connected

    def get_connection(self):  # pragma: no cover - simple helper
        return self

    async def health_check(self) -> dict[str, object]:
        return {"alive": self.connected, "latency_ms": 0.1}

    @staticmethod
    async def get(_key: str) -> None:  # pragma: no cover - unused in this test
        return None

    async def acquire(self):
        class _Conn:
            async def __aenter__(self_inner):
                return self

            async def __aexit__(self_inner, exc_type, exc, tb):
                return False

        return _Conn()


class DummyStatus:
    def __init__(self) -> None:
        self.last_run_at = None
        self.last_duration_seconds = None
        self.last_error = None
        self.api_success = 0
        self.api_failures = 0
        self.redis_writes = 0
        self.consecutive_failures = 0


class DummyMarketDataScheduler:
    instances: list["DummyMarketDataScheduler"] = []

    def __init__(self, *args, **kwargs) -> None:
        self.start_count = 0
        self.stop_count = 0
        self.status = DummyStatus()
        self.args = args
        self.kwargs = kwargs
        DummyMarketDataScheduler.instances.append(self)

    async def start(self) -> None:
        self.start_count += 1

    async def stop(self) -> None:
        self.stop_count += 1


class DummyLLMScheduler(DummyMarketDataScheduler):
    pass


class DummyExchange:
    def __init__(self, *args, **kwargs) -> None:
        self.closed = False
        self.started = True

    async def close(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_dual_scheduler_lifecycle(monkeypatch):
    settings = Settings(
        dual_scheduler_enabled=True,
        market_data_symbols=["BTC-USDT-SWAP"],
        redis_url="redis://localhost:6379/0",
    )

    DummyMarketDataScheduler.instances.clear()
    DummyLLMScheduler.instances.clear()

    dummy_redis = DummyRedis()

    async def fake_exchange(_settings):
        return DummyExchange()

    monkeypatch.setattr(main, "get_settings", lambda: settings)
    monkeypatch.setattr(main, "get_redis", lambda: dummy_redis)
    monkeypatch.setattr(main, "_create_ccxt_exchange", fake_exchange)
    monkeypatch.setattr(main, "MarketDataScheduler", DummyMarketDataScheduler)
    monkeypatch.setattr(main, "LLMDecisionScheduler", DummyLLMScheduler)

    main._market_data_scheduler = None
    main._llm_decision_scheduler = None

    with TestClient(main.app) as client:
        response = client.get("/healthz")
        assert response.status_code == 200
        payload = response.json()
        assert payload["schedulers"]["mode"] == "dual"

    market_scheduler = DummyMarketDataScheduler.instances[0]
    llm_scheduler = DummyLLMScheduler.instances[0]

    assert market_scheduler.start_count == 1
    assert market_scheduler.stop_count == 1
    assert llm_scheduler.start_count == 1
    assert llm_scheduler.stop_count == 1


class DummySingleScheduler:
    def __init__(self) -> None:
        self.start_count = 0
        self.stop_count = 0

    async def start(self) -> None:
        self.start_count += 1

    async def stop(self) -> None:
        self.stop_count += 1

    def status(self):
        class _Status:
            def as_dict(self_inner):
                return {
                    "implementation": "dummy",
                    "is_running": True,
                    "is_paused": False,
                    "last_run_at": None,
                    "next_run_at": None,
                    "consecutive_failures": 0,
                    "jobs": [],
                }

        return _Status()


@pytest.mark.asyncio
async def test_single_scheduler_graceful_shutdown(monkeypatch):
    settings = Settings(
        dual_scheduler_enabled=False,
        redis_url="redis://localhost:6379/0",
    )
    dummy_scheduler = DummySingleScheduler()
    dummy_redis = DummyRedis()

    monkeypatch.setattr(main, "get_settings", lambda: settings)
    monkeypatch.setattr(main, "get_scheduler", lambda impl=None: dummy_scheduler)
    monkeypatch.setattr(main, "get_redis", lambda: dummy_redis)

    with TestClient(main.app) as client:
        response = client.get("/healthz")
        assert response.status_code == 200

    assert dummy_scheduler.start_count == 1
    assert dummy_scheduler.stop_count == 1

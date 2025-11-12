import json
import os
from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient

from autotrade_service import main
from autotrade_service.config import get_settings
from autotrade_service.api import routes as api_routes
from autotrade_service.repositories import (
    AutoTradeDecision,
    AutoTradeDecisionPrompt,
    AutoTradeEvent,
    AutoTradeExitPlan,
    AutoTradePortfolioSnapshot,
    AutoTradePosition,
)


class DummyRedis:
    def __init__(self):
        self.store: dict[str, str] = {}
        self._connected = False

    async def connect(self):
        self._connected = True

    async def disconnect(self):
        self._connected = False

    @property
    def is_connected(self) -> bool:
        return self._connected

    def get_connection(self):
        return self

    async def health_check(self):
        return {"alive": self._connected, "latency_ms": 0.1}

    async def get(self, key: str):
        return self.store.get(key)

    @asynccontextmanager
    async def acquire(self):  # pragma: no cover - simple helper
        yield self


class DummySchedulerStatus:
    def as_dict(self):  # pragma: no cover - simple serialization
        return {
            "implementation": "dummy",
            "is_running": True,
            "is_paused": False,
            "last_run_at": None,
            "next_run_at": None,
            "consecutive_failures": 0,
            "jobs": [],
        }


class DummyScheduler:
    async def start(self):
        return None

    async def stop(self):
        return None

    def status(self):
        return DummySchedulerStatus()


@pytest.fixture
def client(monkeypatch):
    dummy_redis = DummyRedis()
    dummy_scheduler = DummyScheduler()
    monkeypatch.setattr(main, "get_redis", lambda: dummy_redis)
    monkeypatch.setattr(api_routes, "get_redis", lambda: dummy_redis)
    monkeypatch.setattr(main, "get_scheduler", lambda impl=None: dummy_scheduler)
    previous_dual = os.environ.get("AUTOTRADE_DUAL_SCHEDULER_ENABLED")
    os.environ["AUTOTRADE_DUAL_SCHEDULER_ENABLED"] = "false"
    os.environ["AUTOTRADE_MARKET_DATA_SYMBOLS"] = json.dumps(["BTC-USDT-SWAP"])
    get_settings.cache_clear()
    with TestClient(main.app) as test_client:
        yield test_client, dummy_redis
    if previous_dual is None:
        os.environ.pop("AUTOTRADE_DUAL_SCHEDULER_ENABLED", None)
    else:
        os.environ["AUTOTRADE_DUAL_SCHEDULER_ENABLED"] = previous_dual
    os.environ.pop("AUTOTRADE_MARKET_DATA_SYMBOLS", None)
    get_settings.cache_clear()


def test_market_data_websocket_ping(client):
    test_client, _ = client
    with test_client.websocket_connect("/ws/market-data") as websocket:
        websocket.send_text("ping")
        message = websocket.receive_json()
        assert message["type"] == "pong"


def test_prices_endpoint_returns_cached_data(client):
    test_client, dummy_redis = client
    dummy_redis.store["market:BTC-USDT-SWAP:ticker"] = json.dumps({
        "symbol": "BTC-USDT-SWAP",
        "last_price": 12345.0,
        "change_pct_24h": 1.23,
        "timestamp": "2024-01-01T00:00:00Z",
    })
    response = test_client.get("/api/market/v1/prices")
    payload = response.json()
    assert response.status_code == 200
    assert payload["count"] == 1
    assert payload["symbols"]["BTC-USDT-SWAP"]["price"] == 12345.0


def test_health_endpoint_includes_scheduler_status(client):
    test_client, _ = client
    response = test_client.get("/healthz")
    data = response.json()
    assert data["redis"]["alive"] is True
    assert data["schedulers"]["mode"] == "single"
    assert data["schedulers"]["default"]["implementation"] == "dummy"


def test_portfolio_endpoint_includes_market_data(client, monkeypatch):
    test_client, dummy_redis = client
    ticker_payload = {
        "symbol": "BTC-USDT-SWAP",
        "last_price": 12345.0,
        "change_pct_24h": 1.23,
        "timestamp": "2024-01-01T00:00:00+00:00",
    }
    dummy_redis.store["market:BTC-USDT-SWAP:ticker"] = json.dumps(ticker_payload)
    async def fake_fetch():
        return AutoTradePortfolioSnapshot(
            portfolio_id="pf-1",
            automation_enabled=True,
            mode="live",
            available_cash=1000.0,
            equity=1500.0,
            total_pnl=500.0,
            pnl_pct=0.5,
            sharpe=1.0,
            drawdown_pct=0.1,
            last_run_at="2024-01-01T00:00:00Z",
            next_run_in_minutes=5,
            positions=[
                AutoTradePosition(
                    symbol="BTC-USDT-SWAP",
                    quantity=0.1,
                    entry_price=10000.0,
                    mark_price=12000.0,
                    pnl=200.0,
                    pnl_pct=0.2,
                    leverage=2.0,
                    confidence=0.8,
                    exit_plan=AutoTradeExitPlan(profit_target=13000.0, stop_loss=9000.0, invalidation="breach"),
                )
            ],
            closed_positions=[],
            decisions=[
                AutoTradeDecision(
                    id="dec-1",
                    symbol="BTC-USDT-SWAP",
                    action="buy",
                    size_pct=10.0,
                    confidence=0.8,
                    rationale="test",
                    created_at="2024-01-01T00:00:00Z",
                    prompt=AutoTradeDecisionPrompt(
                        system_prompt="sys",
                        user_payload="user",
                        chain_of_thought="cot",
                        invalidations=[],
                        observation_window="1h",
                    ),
                )
            ],
            events=[AutoTradeEvent(id="evt-1", label="started", timestamp="2024-01-01T00:00:00Z")],
        )

    monkeypatch.setattr(api_routes, "fetch_latest_portfolio", fake_fetch)

    response = test_client.get("/internal/autotrade/v1/portfolio")
    assert response.status_code == 200
    payload = response.json()["portfolio"]
    assert "marketData" not in payload

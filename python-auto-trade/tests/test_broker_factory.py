import asyncio

import pytest

from autotrade_service.brokers.factory import build_broker
from autotrade_service.brokers.okx_demo import OKXDemoBroker
from autotrade_service.config import Settings
from autotrade_service.providers.okx_client import OKXClient
from autotrade_service.simulation.broker import SimulatedBroker
from autotrade_service.simulation.state import SimulatedPortfolio


class DummyOKXClient:
    async def create_order(self, *args, **kwargs):  # pragma: no cover - stub
        return {}


@pytest.mark.asyncio
async def test_build_broker_returns_simulated():
    settings = Settings()
    settings.trading_broker = "simulated"
    portfolio = SimulatedPortfolio(portfolio_id="pf-1", starting_cash=1000, current_cash=1000)

    broker = await build_broker(settings=settings, portfolio=portfolio, runtime_mode="simulator")

    assert isinstance(broker, SimulatedBroker)
    snapshot = await broker.get_portfolio_snapshot()
    assert snapshot is portfolio


@pytest.mark.asyncio
async def test_build_broker_returns_okx(monkeypatch):
    settings = Settings()
    settings.trading_broker = "okx_demo"
    settings.okx_api_key = "demo"
    settings.okx_secret_key = "secret"
    settings.okx_passphrase = "pass"

    async def fake_create(**kwargs):
        return DummyOKXClient()

    monkeypatch.setattr(OKXClient, "create", fake_create)

    broker = await build_broker(settings=settings, runtime_mode="paper")
    assert isinstance(broker, OKXDemoBroker)

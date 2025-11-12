import pytest

from autotrade_service.config import Settings
from autotrade_service.repositories import fetch_latest_portfolio, get_runtime_mode


class StubOKXClient:
    async def fetch_balance(self):
        return {
            "free": {"USDT": 100.0},
            "total": {"USDT": 150.0},
        }

    async def fetch_positions(self):
        return [
            {
                "symbol": "BTC-USDT-SWAP",
                "contracts": 1.0,
                "entryPrice": 100.0,
                "markPrice": 110.0,
                "unrealizedPnl": 10.0,
                "leverage": 2,
            }
        ]

    async def close(self):  # pragma: no cover - compatibility
        return None


@pytest.mark.asyncio
async def test_fetch_latest_portfolio_okx_demo(monkeypatch):
    settings = Settings()
    settings.trading_broker = "okx_demo"
    settings.okx_api_key = "demo"
    settings.okx_secret_key = "secret"
    settings.okx_passphrase = "pass"

    async def fake_create(**kwargs):
        return StubOKXClient()

    class DummyDB:
        is_connected = False

    monkeypatch.setattr("autotrade_service.repositories.OKXClient.create", fake_create)
    monkeypatch.setattr("autotrade_service.repositories.get_settings", lambda: settings)
    monkeypatch.setattr("autotrade_service.repositories.get_db", lambda: DummyDB())

    snapshot = await fetch_latest_portfolio()
    assert snapshot.mode == "OKX Demo Trading"
    assert snapshot.available_cash == 100.0
    assert snapshot.equity == 150.0
    assert snapshot.positions[0].pnl == 10.0


@pytest.mark.asyncio
async def test_get_runtime_mode_falls_back_to_settings(monkeypatch):
    settings = Settings()
    settings.trading_broker = "okx_demo"

    class DummyDB:
        is_connected = False

    monkeypatch.setattr("autotrade_service.repositories.get_db", lambda: DummyDB())
    monkeypatch.setattr("autotrade_service.repositories.get_settings", lambda: settings)

    mode = await get_runtime_mode()
    assert mode == "paper"

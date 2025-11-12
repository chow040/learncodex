import sys
from pathlib import Path

import pytest

from autotrade_service.brokers.okx_demo import OKXDemoBroker
from autotrade_service.config import Settings
from autotrade_service.llm.schemas import DecisionAction, DecisionPayload
from autotrade_service.providers import OKXClient

TESTS_ROOT = Path(__file__).resolve().parents[1]
if str(TESTS_ROOT) not in sys.path:  # pragma: no cover - environment guard
    sys.path.append(str(TESTS_ROOT))

from utils.mock_okx_exchange import MockOKXExchange  # noqa: E402


@pytest.mark.asyncio
async def test_okx_demo_broker_execute_with_mock_exchange(monkeypatch):
    settings = Settings()
    settings.okx_api_key = "demo-key"
    settings.okx_secret_key = "demo-secret"
    settings.okx_passphrase = "demo-pass"
    settings.ccxt_symbol_map = {"BTC-USDT-SWAP": "BTC/USDT:USDT"}

    exchange = MockOKXExchange()
    client = await OKXClient.create(settings=settings, exchange_factory=lambda cfg: exchange)
    broker = OKXDemoBroker(client, settings=settings)

    decision = DecisionPayload(
        symbol="BTC-USDT-SWAP",
        action=DecisionAction.BUY,
        quantity=0.01,
        confidence=0.9,
    )

    messages = await broker.execute([decision], {"BTC-USDT-SWAP": 25_000.0})

    assert "Submitted buy order" in messages[0]
    assert exchange.orders[0]["symbol"] == "BTC/USDT:USDT"
    assert exchange.positions["BTC/USDT:USDT"] == pytest.approx(0.01)

    balance = await broker.fetch_balance()
    assert balance["free"]["USDT"] < 10_000.0

    positions = await broker.fetch_positions()
    assert positions[0]["symbol"] == "BTC/USDT:USDT"

    trades = await broker.fetch_trade_history("BTC/USDT:USDT")
    assert trades[0]["symbol"] == "BTC/USDT:USDT"

    await client.close()

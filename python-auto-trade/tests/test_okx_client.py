import asyncio

import pytest

from autotrade_service.config import Settings
from autotrade_service.providers.okx_client import (
    OKXClient,
    OKXClientConfig,
    OKXClientError,
)


class FakeExchange:
    def __init__(self):
        self.sandbox = None
        self.loaded = False
        self.create_calls = 0
        self.fail_once = True

    def set_sandbox_mode(self, flag: bool):
        self.sandbox = flag

    async def load_markets(self):
        self.loaded = True

    async def create_order(self, *args, **kwargs):
        self.create_calls += 1
        if self.fail_once:
            self.fail_once = False
            raise RuntimeError("transient error")
        return {"id": "order-1", "args": args, "kwargs": kwargs}

    async def edit_order(self, order_id, symbol, order_type, side, amount, price, params):
        return {"id": order_id, "symbol": symbol, "amount": amount, "price": price, "params": params}

    async def fetch_balance(self):
        return {"total": {"USDT": 100}}

    async def fetch_my_trades(self, symbol, since=None, limit=None):
        return [{"symbol": symbol, "since": since, "limit": limit}]

    async def close(self):
        return None


def _settings_with_okx_keys() -> Settings:
    settings = Settings()
    settings.okx_api_key = "demo-key"
    settings.okx_secret_key = "demo-secret"
    settings.okx_passphrase = "pass"
    settings.okx_demo_mode = True
    settings.okx_max_retries = 2
    settings.okx_backoff_seconds = 0.01
    settings.okx_backoff_max_seconds = 0.02
    return settings


@pytest.mark.asyncio
async def test_okx_client_initializes_in_sandbox_mode():
    settings = _settings_with_okx_keys()
    exchange = FakeExchange()

    client = await OKXClient.create(settings=settings, exchange_factory=lambda _: exchange)

    assert exchange.loaded is True
    assert exchange.sandbox is True
    await client.close()


@pytest.mark.asyncio
async def test_okx_client_retries_on_transient_errors():
    settings = _settings_with_okx_keys()
    exchange = FakeExchange()

    client = await OKXClient.create(settings=settings, exchange_factory=lambda _: exchange)
    order = await client.create_order("BTC/USDT", "limit", "buy", 1, 100)

    assert order["id"] == "order-1"
    assert exchange.create_calls == 2
    await client.close()


@pytest.mark.asyncio
async def test_okx_client_edit_and_fetch_trades():
    settings = _settings_with_okx_keys()
    exchange = FakeExchange()
    client = await OKXClient.create(settings=settings, exchange_factory=lambda _: exchange)

    edited = await client.edit_order("abc", "BTC/USDT", amount=1.5, price=105)
    assert edited["id"] == "abc"

    trades = await client.fetch_trades("BTC/USDT", since=123, limit=10)
    assert trades[0]["symbol"] == "BTC/USDT"
    assert trades[0]["since"] == 123
    assert trades[0]["limit"] == 10

    await client.close()


@pytest.mark.asyncio
async def test_okx_client_raises_without_credentials():
    settings = Settings()
    settings.okx_api_key = None
    settings.okx_secret_key = None
    settings.okx_passphrase = None

    with pytest.raises(OKXClientError):
        await OKXClient.create(settings=settings, exchange_factory=lambda _: FakeExchange())

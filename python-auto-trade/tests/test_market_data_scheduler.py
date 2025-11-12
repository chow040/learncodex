import asyncio
import json
import time

from autotrade_service.config import Settings
from autotrade_service.schedulers.market_data_scheduler import MarketDataScheduler


class DummyRedis:
    def __init__(self):
        self.store: dict[str, tuple[str, float]] = {}

    async def setex(self, key: str, ttl: int, value: str) -> None:
        self.store[key] = (value, time.monotonic() + ttl)

    async def get(self, key: str):
        payload = self.store.get(key)
        if not payload:
            return None
        value, expires = payload
        if time.monotonic() > expires:
            self.store.pop(key, None)
            return None
        return value


class FakeCCXTExchange:
    def __init__(self) -> None:
        self.orderbook_calls = 0

    async def fetch_ticker(self, symbol: str):
        price = 100 if symbol.startswith("BTC") else 50
        return {
            "symbol": symbol,
            "last": price,
            "bid": price - 1,
            "ask": price + 1,
            "high": price + 10,
            "low": price - 10,
            "baseVolume": 1000,
            "percentage": 1.23,
            "info": {"change24h": 1.0},
        }

    async def fetch_order_book(self, symbol: str, limit: int = 20):
        self.orderbook_calls += 1
        return {"bids": [[99, 1]], "asks": [[101, 1]], "timestamp": 1700000000000}

    async def fetchFundingRate(self, symbol: str):
        return {"fundingRate": 0.0001, "nextFundingTime": 123}

    async def fetch_ohlcv(self, symbol: str, timeframe: str = "1m", limit: int = 50):
        candles = []
        for i in range(limit):
            candles.append([
                1700000000000 + i * 60000,
                100,
                105,
                95,
                95 + i * 0.1,
                10,
            ])
        return candles


class DummyWS:
    def __init__(self):
        self.messages = []

    async def broadcast_market_data(self, snapshot):
        self.messages.append(snapshot)


def test_market_data_scheduler_run_cycle_records_metrics():
    async def _run():
        redis = DummyRedis()
        exchange = FakeCCXTExchange()
        ws = DummyWS()
        settings = Settings()
        settings.market_data_symbols = ["BTC-USDT-SWAP"]
        settings.ccxt_exchange_id = "okx"
        settings.ccxt_symbol_map = {"BTC-USDT-SWAP": "BTC/USDT:USDT"}
        scheduler = MarketDataScheduler(
            redis_client=redis,
            exchange=exchange,
            websocket_manager=ws,
            settings=settings,
        )

        await scheduler.run_cycle()

        ticker_raw = await redis.get("market:BTC-USDT-SWAP:ticker")
        assert ticker_raw is not None
        ticker = json.loads(ticker_raw)
        assert ticker["symbol"] == "BTC-USDT-SWAP"
        indicators_raw = await redis.get("market:BTC-USDT-SWAP:indicators")
        assert indicators_raw is not None
        assert ws.messages, "websocket broadcast expected"
        assert scheduler.status.api_success >= 5
        assert scheduler.status.api_failures == 0
        assert scheduler.status.redis_writes == 6

    asyncio.run(_run())


def test_market_data_scheduler_handles_symbol_failure():
    class PartialFailureExchange(FakeCCXTExchange):
        async def fetch_order_book(self, symbol: str, limit: int = 20):
            self.orderbook_calls += 1
            raise RuntimeError("orderbook unavailable")

    async def _run():
        redis = DummyRedis()
        exchange = PartialFailureExchange()
        settings = Settings()
        settings.market_data_symbols = ["BTC-USDT-SWAP"]
        settings.ccxt_exchange_id = "okx"
        settings.ccxt_symbol_map = {"BTC-USDT-SWAP": "BTC/USDT:USDT"}
        scheduler = MarketDataScheduler(
            redis_client=redis,
            exchange=exchange,
            websocket_manager=None,
            settings=settings,
        )

        await scheduler.run_cycle()

        assert scheduler.status.api_failures > 0
        assert scheduler.status.api_success >= 1  # ticker still succeeds
        assert scheduler.status.redis_writes >= 5  # ticker + funding + 2x candles + indicators

    asyncio.run(_run())


def test_market_data_scheduler_multi_symbol_load():
    async def _run():
        redis = DummyRedis()
        exchange = FakeCCXTExchange()
        ws = DummyWS()
        settings = Settings()
        settings.market_data_symbols = ["BTC-USDT-SWAP", "ETH-USDT-SWAP"]
        settings.ccxt_exchange_id = "okx"
        settings.ccxt_symbol_map = {
            "BTC-USDT-SWAP": "BTC/USDT:USDT",
            "ETH-USDT-SWAP": "ETH/USDT:USDT",
        }
        scheduler = MarketDataScheduler(
            redis_client=redis,
            exchange=exchange,
            websocket_manager=ws,
            settings=settings,
        )

        await scheduler.run_cycle()

        for symbol in settings.market_data_symbols:
            assert await redis.get(f"market:{symbol}:ticker") is not None
        assert ws.messages, "Expected broadcast snapshot"
        snapshot = ws.messages[-1]
        assert set(snapshot.keys()) == {"BTC-USDT-SWAP", "ETH-USDT-SWAP"}

    asyncio.run(_run())

import asyncio
import json
from datetime import datetime, timezone, timedelta

from autotrade_service.config import Settings
from autotrade_service.schedulers.llm_decision_scheduler import LLMDecisionScheduler


class DummyRedis:
    def __init__(self, payloads):
        self.payloads = payloads

    async def get(self, key: str):
        return self.payloads.get(key)


def _iso(minutes_ago: int = 0) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()


def test_llm_scheduler_fetches_cached_data():
    settings = Settings()
    settings.market_data_symbols = ["BTC-USDT-SWAP"]
    payloads = {
        "market:BTC-USDT-SWAP:ticker": json.dumps({"symbol": "BTC-USDT-SWAP", "last_price": 100, "timestamp": _iso()}),
        "market:BTC-USDT-SWAP:orderbook": json.dumps({"bids": [], "asks": []}),
        "market:BTC-USDT-SWAP:funding": json.dumps({"funding_rate": "0.0001"}),
        "market:BTC-USDT-SWAP:ohlcv:15m": json.dumps({"candles": []}),
        "market:BTC-USDT-SWAP:ohlcv:1h": json.dumps({"candles": []}),
        "market:BTC-USDT-SWAP:indicators": json.dumps({"short_term": {"ema_20": 1}}),
    }
    scheduler = LLMDecisionScheduler(DummyRedis(payloads), settings=settings)

    async def _run():
        data = await scheduler._fetch_market_data_from_cache()
        assert "BTC-USDT-SWAP" in data
        entry = data["BTC-USDT-SWAP"]
        assert entry.ticker["symbol"] == "BTC-USDT-SWAP"
        assert entry.indicators["short_term"]["ema_20"] == 1
        assert entry.stale is False

    asyncio.run(_run())


def test_llm_scheduler_marks_stale_data():
    settings = Settings()
    settings.market_data_symbols = ["BTC-USDT-SWAP"]
    settings.llm_data_stale_threshold_seconds = 1
    payloads = {
        "market:BTC-USDT-SWAP:ticker": json.dumps({"symbol": "BTC-USDT-SWAP", "last_price": 100, "timestamp": _iso(minutes_ago=5)})
    }
    scheduler = LLMDecisionScheduler(DummyRedis(payloads), settings=settings)

    async def _run():
        data = await scheduler._fetch_market_data_from_cache()
        entry = data["BTC-USDT-SWAP"]
        assert entry.stale is True
        assert scheduler.status.stale_symbols == 1

    asyncio.run(_run())


def test_llm_scheduler_respects_custom_trading_symbols():
    settings = Settings()
    settings.market_data_symbols = ["BTC-USDT-SWAP", "ETH-USDT-SWAP"]
    settings.llm_trading_symbols = ["ETH-USDT-SWAP"]
    payloads = {
        "market:ETH-USDT-SWAP:ticker": json.dumps({"symbol": "ETH-USDT-SWAP", "last_price": 2000, "timestamp": _iso()}),
    }
    scheduler = LLMDecisionScheduler(DummyRedis(payloads), settings=settings)

    async def _run():
        data = await scheduler._fetch_market_data_from_cache()
        assert list(data.keys()) == ["ETH-USDT-SWAP"]

    asyncio.run(_run())

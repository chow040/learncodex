from __future__ import annotations
import asyncio
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import sys
import types
from typing import Any, Dict

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

if "langchain_deepseek" not in sys.modules:
    langchain_deepseek = types.ModuleType("langchain_deepseek")

    class _ChatDeepSeek:  # pragma: no cover - stub class for tests
        def __init__(self, *args: object, **kwargs: object) -> None:
            raise RuntimeError("langchain_deepseek is a test stub")

    langchain_deepseek.ChatDeepSeek = _ChatDeepSeek
    langchain_deepseek.__all__ = ["ChatDeepSeek"]
    sys.modules["langchain_deepseek"] = langchain_deepseek

from autotrade_service.config import Settings
from autotrade_service.providers.okx_derivatives import (
    DerivativesProviderConfig,
    DerivativesProviderError,
    DerivativesSnapshot,
    OKXDerivativesFetcher,
)
from autotrade_service.tools import DerivativesDataTool, ToolCache


class FakeClock:
    def __init__(self) -> None:
        self._now = datetime(2025, 1, 1, tzinfo=timezone.utc)

    def advance(self, seconds: float) -> None:
        self._now += timedelta(seconds=seconds)

    def __call__(self) -> datetime:
        return self._now


class StubExchange:
    def __init__(
        self,
        funding_payload: Dict[str, Any] | None = None,
        open_interest_payload: Dict[str, Any] | None = None,
    ) -> None:
        self.funding_payload = funding_payload or {
            "fundingRate": "0.0001",
            "nextFundingRate": "0.00012",
            "nextFundingTimestamp": 1_700_000_000_000,
            "markPrice": "1000.5",
            "info": {
                "fundingRate": "0.0001",
                "nextFundingRate": "0.00012",
                "fundingTime": "1700000000000",
                "markPx": "1000.6",
            },
        }
        self.open_interest_payload = open_interest_payload or {
            "openInterestValue": "15000000000",
            "openInterestAmount": "130000",
            "timestamp": 1_700_000_000_000,
            "info": {
                "oi": "15000000000",
                "oiCcy": "130000",
                "markPx": "1000.7",
                "ts": "1700000000000",
            },
        }
        self.funding_calls: list[str] = []
        self.open_interest_calls: list[str] = []
        self.closed = False
        self._market_loaded = False

    async def load_markets(self) -> dict[str, Any]:
        self._market_loaded = True
        return {}

    async def fetchFundingRate(self, symbol: str, params: dict[str, Any] | None = None) -> dict[str, Any]:  # noqa: N802
        self.funding_calls.append(symbol)
        return self.funding_payload

    async def fetchOpenInterest(self, symbol: str, params: dict[str, Any] | None = None) -> dict[str, Any]:  # noqa: N802
        self.open_interest_calls.append(symbol)
        return self.open_interest_payload

    async def close(self) -> None:
        self.closed = True


def _config(symbol_mapping: dict[str, str], funding_ttl: float = 300.0, oi_ttl: float = 60.0) -> DerivativesProviderConfig:
    return DerivativesProviderConfig(
        enabled=True,
        exchange_id="okx",
        symbol_mapping={key: value for key, value in symbol_mapping.items()},
        funding_cache_ttl_seconds=funding_ttl,
        open_interest_cache_ttl_seconds=oi_ttl,
        rate_limit=20,
        timeout_seconds=5.0,
        max_retries=2,
        backoff_seconds=0.01,
        backoff_max_seconds=0.05,
    )


def test_fetch_snapshot_combines_data_and_caches() -> None:
    clock = FakeClock()
    exchange = StubExchange()

    async def scenario() -> None:
        fetcher = OKXDerivativesFetcher(
            config=_config({"BTC": "BTC-USDT-SWAP"}, funding_ttl=300.0, oi_ttl=300.0),
            exchange_factory=lambda _cfg: exchange,
            now_fn=clock,
        )
        try:
            snapshot = await fetcher.fetch_snapshot("BTC")
            assert snapshot.symbol == "BTC"
            assert snapshot.provider == "okx"
            assert snapshot.funding_rate == pytest.approx(0.0001)
            assert snapshot.funding_rate_pct == pytest.approx(0.01)
            assert snapshot.funding_rate_annual_pct == pytest.approx(0.0001 * 100 * 3 * 365)
            assert snapshot.predicted_funding_rate == pytest.approx(0.00012)
            assert snapshot.open_interest_usd == pytest.approx(15_000_000_000.0)
            assert snapshot.open_interest_contracts == pytest.approx(130_000.0)
            assert snapshot.mark_price == pytest.approx(1000.5)
            assert exchange.funding_calls == ["BTC/USDT:USDT"]
            assert exchange.open_interest_calls == ["BTC/USDT:USDT"]

            clock.advance(10)
            snapshot_cached = await fetcher.fetch_snapshot("BTC")
            assert snapshot_cached.funding_rate == pytest.approx(snapshot.funding_rate)
            assert exchange.funding_calls == ["BTC/USDT:USDT"]
            assert exchange.open_interest_calls == ["BTC/USDT:USDT"]

            clock.advance(400)
            refreshed = await fetcher.fetch_snapshot("BTC")
            assert refreshed.funding_rate == pytest.approx(snapshot.funding_rate)
            assert len(exchange.funding_calls) == 2
            assert len(exchange.open_interest_calls) == 2
        finally:
            await fetcher.close()
            assert exchange.closed

    asyncio.run(scenario())


class DummyFetcher:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.config = _config({"BTC": "BTC-USDT-SWAP", "ETH": "ETH-USDT-SWAP"})

    async def fetch_snapshot(self, symbol: str) -> DerivativesSnapshot:
        self.calls.append(symbol)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)
        return DerivativesSnapshot(
            symbol=symbol,
            funding_rate=0.0001,
            funding_rate_pct=0.01,
            funding_rate_annual_pct=10.95,
            predicted_funding_rate=0.00012,
            next_funding_time=now + timedelta(hours=8),
            open_interest_usd=12_345_678.0,
            open_interest_contracts=98_765.0,
            open_interest_timestamp=now,
            mark_price=99_999.0,
            fetched_at=now,
            provider="okx",
            raw_funding={"fundingRate": "0.0001"},
            raw_open_interest={"oi": "12345678"},
        )


def test_derivatives_tool_fetch_and_cache() -> None:
    async def scenario() -> None:
        cache = ToolCache(ttl_seconds=120.0)
        fetcher = DummyFetcher()
        tool = DerivativesDataTool(fetcher=fetcher, cache=cache)

        result_first = await tool.fetch(["BTC"])
        assert "BTC" in result_first
        assert fetcher.calls == ["BTC"]

        # Second call should hit the ToolCache (no additional fetch)
        result_second = await tool.fetch(["BTC"])
        assert result_second["BTC"].funding_rate == result_first["BTC"].funding_rate
        assert fetcher.calls == ["BTC"]

    asyncio.run(scenario())


def test_derivatives_tool_fetch_serialized_structure() -> None:
    async def scenario() -> None:
        fetcher = DummyFetcher()
        tool = DerivativesDataTool(fetcher=fetcher, cache=None)
        payload = await tool.fetch_serialized(["ETH"])
        eth_payload = payload["ETH"]
        assert eth_payload["funding_rate_pct"] == 0.01
        assert "raw_funding" in eth_payload
        assert isinstance(eth_payload["next_funding_time"], str)

    asyncio.run(scenario())


@pytest.mark.asyncio
@pytest.mark.skipif(
    os.environ.get("AUTOTRADE_OKX_LIVE_SMOKE") != "1",
    reason="Live OKX smoke test disabled (set AUTOTRADE_OKX_LIVE_SMOKE=1 to enable)",
)
async def test_okx_derivatives_live_smoke() -> None:
    """
    Call the real OKX endpoints using CCXT to ensure funding/open-interest data is reachable.
    Requires public market access; credentials may unlock higher rate limits but are optional.
    """
    settings = Settings()
    if not settings.okx_derivatives_enabled:
        pytest.skip("OKX derivatives disabled in settings")

    fetcher = OKXDerivativesFetcher(settings=settings)
    try:
        snapshot = await fetcher.fetch_snapshot("BTC")
        assert snapshot.funding_rate is not None
        assert snapshot.open_interest_usd is not None
        assert snapshot.open_interest_usd > 0
        # mark price can occasionally be missing from the API, but when present it must be positive
        if snapshot.mark_price is not None:
            assert snapshot.mark_price > 0
        # open-interest timestamp should be recent (within 1 day)
        assert snapshot.open_interest_timestamp is not None
        age = datetime.now(timezone.utc) - snapshot.open_interest_timestamp
        assert age.total_seconds() < 86_400
    finally:
        await fetcher.close()


def test_derivatives_tool_symbol_normalization_variants() -> None:
    async def scenario() -> None:
        fetcher = DummyFetcher()
        tool = DerivativesDataTool(fetcher=fetcher, cache=None)

        snapshot = await tool.fetch(["btc-usd"])
        assert "BTC" in snapshot
        assert fetcher.calls == ["BTC"]

        fetcher.calls.clear()
        snapshot_multi = await tool.fetch(["BTC/USDT", "BTCUSD"])
        assert "BTC" in snapshot_multi
        assert fetcher.calls == ["BTC", "BTC"]

        with pytest.raises(ValueError):
            tool.normalize_symbol("UNKNOWN")

    asyncio.run(scenario())


def test_fetch_snapshot_open_interest_cache_expires_independently() -> None:
    clock = FakeClock()
    exchange = StubExchange()

    async def scenario() -> None:
        fetcher = OKXDerivativesFetcher(
            config=_config({"BTC": "BTC-USDT-SWAP"}, funding_ttl=300.0, oi_ttl=1.0),
            exchange_factory=lambda _cfg: exchange,
            now_fn=clock,
        )
        try:
            await fetcher.fetch_snapshot("BTC")
            assert exchange.funding_calls == ["BTC/USDT:USDT"]
            assert exchange.open_interest_calls == ["BTC/USDT:USDT"]

            clock.advance(2)
            await fetcher.fetch_snapshot("BTC")
            assert len(exchange.funding_calls) == 1
            assert len(exchange.open_interest_calls) == 2
        finally:
            await fetcher.close()

    asyncio.run(scenario())


def test_fetch_snapshot_unknown_symbol_raises() -> None:
    async def scenario() -> None:
        fetcher = OKXDerivativesFetcher(
            config=_config({"BTC": "BTC-USDT-SWAP"}),
            exchange_factory=lambda _cfg: StubExchange(),
        )
        try:
            with pytest.raises(DerivativesProviderError):
                await fetcher.fetch_snapshot("ETH")
        finally:
            await fetcher.close()

    asyncio.run(scenario())

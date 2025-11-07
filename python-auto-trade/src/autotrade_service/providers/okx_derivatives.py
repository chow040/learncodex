from __future__ import annotations

import asyncio
import inspect
import logging
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Optional, Protocol

import ccxt.async_support as ccxt  # type: ignore[import-not-found]

from ..config import Settings, get_settings


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DerivativesProviderError(RuntimeError):
    pass


class AsyncExchange(Protocol):
    async def load_markets(self) -> dict[str, Any]:
        ...

    async def fetchFundingRate(self, symbol: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:  # noqa: N802 - CCXT camelCase
        ...

    async def fetchOpenInterest(self, symbol: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:  # noqa: N802 - CCXT camelCase
        ...

    async def close(self) -> None:
        ...


ExchangeFactory = Callable[["DerivativesProviderConfig"], Awaitable[AsyncExchange] | AsyncExchange]


@dataclass(slots=True)
class DerivativesProviderConfig:
    enabled: bool
    exchange_id: str
    symbol_mapping: dict[str, str]
    funding_cache_ttl_seconds: float = 300.0
    open_interest_cache_ttl_seconds: float = 60.0
    rate_limit: int = 20
    timeout_seconds: float = 10.0
    max_retries: int = 3
    backoff_seconds: float = 1.0
    backoff_max_seconds: float = 10.0

    @classmethod
    def from_settings(cls, settings: Settings) -> "DerivativesProviderConfig":
        symbol_mapping = {key.upper(): value for key, value in (settings.okx_symbol_mapping or {}).items()}
        if not symbol_mapping:
            raise DerivativesProviderError("OKX symbol mapping cannot be empty")
        return cls(
            enabled=settings.okx_derivatives_enabled,
            exchange_id=settings.okx_exchange_id,
            symbol_mapping=symbol_mapping,
            funding_cache_ttl_seconds=settings.okx_funding_cache_ttl_seconds,
            open_interest_cache_ttl_seconds=settings.okx_oi_cache_ttl_seconds,
            rate_limit=settings.okx_rate_limit,
            timeout_seconds=settings.okx_timeout_seconds,
            max_retries=settings.okx_max_retries,
            backoff_seconds=settings.okx_backoff_seconds,
            backoff_max_seconds=settings.okx_backoff_max_seconds,
        )


@dataclass(slots=True)
class DerivativesSnapshot:
    symbol: str
    funding_rate: float
    funding_rate_pct: float
    funding_rate_annual_pct: float | None
    predicted_funding_rate: float | None
    next_funding_time: datetime | None
    open_interest_usd: float | None
    open_interest_contracts: float | None
    open_interest_timestamp: datetime | None
    mark_price: float | None
    fetched_at: datetime
    provider: str = "okx"
    raw_funding: dict[str, Any] | None = None
    raw_open_interest: dict[str, Any] | None = None


@dataclass(slots=True)
class _CacheEntry:
    value: Any
    stored_at: datetime


@dataclass(slots=True)
class _FundingData:
    rate: float
    predicted_rate: float | None
    next_funding_time: datetime | None
    mark_price: float | None
    raw: dict[str, Any]


@dataclass(slots=True)
class _OpenInterestData:
    usd: float | None
    contracts: float | None
    timestamp: datetime | None
    mark_price: float | None
    raw: dict[str, Any]


def _inst_id_to_ccxt_symbol(inst_id: str) -> str:
    parts = inst_id.split("-")
    if len(parts) < 2:
        raise DerivativesProviderError(f"Invalid OKX instrument id: {inst_id}")
    base = parts[0]
    quote = parts[1]
    settlement = quote
    return f"{base}/{quote}:{settlement}"


def _coerce_float(*values: Any) -> float | None:
    for value in values:
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def _ms_to_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        millis = int(value)
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(millis / 1000, tz=timezone.utc)


class OKXDerivativesFetcher:
    """
    Fetches funding rate and open interest snapshots for OKX perpetual swaps.
    """

    def __init__(
        self,
        config: DerivativesProviderConfig | None = None,
        *,
        settings: Settings | None = None,
        exchange_factory: ExchangeFactory | None = None,
        now_fn: Callable[[], datetime] | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._config = config or DerivativesProviderConfig.from_settings(self._settings)
        self._logger = logging.getLogger("autotrade.providers.okx")
        self._exchange_factory = exchange_factory or self._create_exchange
        self._now = now_fn or _utcnow
        self._exchange: AsyncExchange | None = None
        self._exchange_lock = asyncio.Lock()
        self._cache_lock = asyncio.Lock()
        self._funding_cache: Dict[str, _CacheEntry] = {}
        self._open_interest_cache: Dict[str, _CacheEntry] = {}

    async def fetch_snapshot(self, symbol: str) -> DerivativesSnapshot:
        if not self._config.enabled:
            raise DerivativesProviderError("OKX derivatives integration is disabled via configuration")
        normalized_symbol = symbol.upper()
        inst_id = self._config.symbol_mapping.get(normalized_symbol)
        if not inst_id:
            raise DerivativesProviderError(f"No OKX instrument id configured for symbol {symbol}")

        now = self._now()
        funding_data: _FundingData | None
        open_interest_data: _OpenInterestData | None
        needs_funding = False
        needs_open_interest = False

        async with self._cache_lock:
            funding_entry = self._funding_cache.get(normalized_symbol)
            if funding_entry and (now - funding_entry.stored_at).total_seconds() < self._config.funding_cache_ttl_seconds:
                funding_data = funding_entry.value
                self._logger.debug("Funding cache hit for %s", normalized_symbol)
            else:
                funding_data = None
                needs_funding = True
            open_interest_entry = self._open_interest_cache.get(normalized_symbol)
            if open_interest_entry and (now - open_interest_entry.stored_at).total_seconds() < self._config.open_interest_cache_ttl_seconds:
                open_interest_data = open_interest_entry.value
                self._logger.debug("Open interest cache hit for %s", normalized_symbol)
            else:
                open_interest_data = None
                needs_open_interest = True

        tasks: list[tuple[str, Awaitable[Any]]] = []
        if needs_funding:
            tasks.append(("funding", self._fetch_funding(inst_id)))
        if needs_open_interest:
            tasks.append(("open_interest", self._fetch_open_interest(inst_id)))

        if tasks:
            results = await asyncio.gather(*(task for _, task in tasks), return_exceptions=True)
            for (label, _task), result in zip(tasks, results):
                if isinstance(result, Exception):
                    self._logger.error("Failed to fetch %s for %s: %s", label, normalized_symbol, result)
                    raise DerivativesProviderError(f"Failed to fetch {label} for {normalized_symbol}") from result
                if label == "funding":
                    funding_data = result
                elif label == "open_interest":
                    open_interest_data = result

            fetched_at = self._now()
            async with self._cache_lock:
                if needs_funding and funding_data is not None:
                    self._funding_cache[normalized_symbol] = _CacheEntry(value=funding_data, stored_at=fetched_at)
                if needs_open_interest and open_interest_data is not None:
                    self._open_interest_cache[normalized_symbol] = _CacheEntry(value=open_interest_data, stored_at=fetched_at)

        if funding_data is None or open_interest_data is None:
            raise DerivativesProviderError(f"Incomplete derivatives data for {normalized_symbol}")

        mark_price = funding_data.mark_price
        if mark_price is None:
            mark_price = open_interest_data.mark_price

        funding_rate_pct = funding_data.rate * 100
        annual_pct: float | None = None
        if funding_data.rate is not None:
            annual_pct = funding_data.rate * 100 * 3 * 365  # 3 settlements per day (8h cycle)

        snapshot = DerivativesSnapshot(
            symbol=normalized_symbol,
            funding_rate=funding_data.rate,
            funding_rate_pct=funding_rate_pct,
            funding_rate_annual_pct=annual_pct,
            predicted_funding_rate=funding_data.predicted_rate,
            next_funding_time=funding_data.next_funding_time,
            open_interest_usd=open_interest_data.usd,
            open_interest_contracts=open_interest_data.contracts,
            open_interest_timestamp=open_interest_data.timestamp,
            mark_price=mark_price,
            fetched_at=now,
            raw_funding=funding_data.raw,
            raw_open_interest=open_interest_data.raw,
        )
        return snapshot

    async def close(self) -> None:
        async with self._exchange_lock:
            if self._exchange is not None:
                try:
                    await self._exchange.close()
                finally:
                    self._exchange = None

    async def _fetch_funding(self, inst_id: str) -> _FundingData:
        exchange = await self._ensure_exchange()
        ccxt_symbol = _inst_id_to_ccxt_symbol(inst_id)

        async def call() -> dict[str, Any]:
            return await exchange.fetchFundingRate(ccxt_symbol)

        payload = await self._with_retries(f"funding rate for {inst_id}", call)
        info = payload.get("info", {})
        if not info:
            info = payload
        rate = _coerce_float(payload.get("fundingRate"), info.get("fundingRate")) or 0.0
        predicted = _coerce_float(payload.get("nextFundingRate"), info.get("nextFundingRate"))
        next_time = _ms_to_datetime(
            payload.get("nextFundingTimestamp")
            or info.get("fundingTime")
            or info.get("nextFundingTime")
            or payload.get("fundingTime")
        )
        mark_price = _coerce_float(payload.get("markPrice"), info.get("markPx"), info.get("markPrice"))

        return _FundingData(
            rate=rate,
            predicted_rate=predicted,
            next_funding_time=next_time,
            mark_price=mark_price,
            raw=payload,
        )

    async def _fetch_open_interest(self, inst_id: str) -> _OpenInterestData:
        exchange = await self._ensure_exchange()
        ccxt_symbol = _inst_id_to_ccxt_symbol(inst_id)

        async def call() -> dict[str, Any]:
            return await exchange.fetchOpenInterest(ccxt_symbol)

        payload = await self._with_retries(f"open interest for {inst_id}", call)
        info = payload.get("info", {})
        if not info:
            info = payload
        usd = _coerce_float(payload.get("openInterestValue"), info.get("oi"), info.get("oiUsd"))
        contracts = _coerce_float(payload.get("openInterestAmount"), info.get("oiCcy"))
        timestamp = _ms_to_datetime(payload.get("timestamp") or info.get("ts"))
        mark_price = _coerce_float(payload.get("markPrice"), info.get("markPx"))

        return _OpenInterestData(
            usd=usd,
            contracts=contracts,
            timestamp=timestamp,
            mark_price=mark_price,
            raw=payload,
        )

    async def _ensure_exchange(self) -> AsyncExchange:
        if self._exchange is not None:
            return self._exchange
        async with self._exchange_lock:
            if self._exchange is None:
                exchange = self._exchange_factory(self._config)
                if inspect.isawaitable(exchange):
                    exchange = await exchange  # type: ignore[assignment]
                if not hasattr(exchange, "load_markets"):
                    raise DerivativesProviderError("Exchange factory returned invalid exchange instance")
                await exchange.load_markets()
                self._exchange = exchange
        assert self._exchange is not None
        return self._exchange

    def _create_exchange(self, config: DerivativesProviderConfig) -> AsyncExchange:
        if not hasattr(ccxt, config.exchange_id):
            raise DerivativesProviderError(f"Unsupported CCXT exchange id: {config.exchange_id}")
        exchange_cls = getattr(ccxt, config.exchange_id)
        exchange = exchange_cls(
            {
                "enableRateLimit": True,
                "rateLimit": config.rate_limit,
                "timeout": int(config.timeout_seconds * 1000),
            }
        )
        return exchange

    async def _with_retries(self, label: str, fn: Callable[[], Awaitable[dict[str, Any]]]) -> dict[str, Any]:
        attempts = 0
        delay = self._config.backoff_seconds
        while True:
            attempts += 1
            try:
                return await fn()
            except Exception as exc:
                if attempts >= self._config.max_retries:
                    raise DerivativesProviderError(f"Exceeded retries fetching {label}") from exc
                jitter = random.uniform(0.5, 1.5)
                sleep_for = min(delay * jitter, self._config.backoff_max_seconds)
                self._logger.warning(
                    "Error fetching %s (attempt %s/%s): %s - retrying in %.2fs",
                    label,
                    attempts,
                    self._config.max_retries,
                    exc,
                    sleep_for,
                )
                await asyncio.sleep(sleep_for)
                delay = min(delay * 2, self._config.backoff_max_seconds)

    @property
    def config(self) -> DerivativesProviderConfig:
        return self._config


__all__ = [
    "DerivativesProviderConfig",
    "DerivativesProviderError",
    "DerivativesSnapshot",
    "OKXDerivativesFetcher",
]

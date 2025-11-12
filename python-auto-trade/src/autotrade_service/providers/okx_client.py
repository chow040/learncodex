from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

import ccxt.async_support as ccxt

from ..config import Settings, get_settings

logger = logging.getLogger("autotrade.providers.okx_client")


class OKXClientError(RuntimeError):
    """Raised when the OKX REST client exhausts retries or encounters a fatal error."""


@dataclass(slots=True)
class OKXClientConfig:
    """Configuration for the OKX trading client."""

    api_key: str
    secret_key: str
    passphrase: str
    demo_mode: bool = True
    timeout_seconds: float = 10.0
    max_retries: int = 3
    backoff_seconds: float = 1.0
    backoff_max_seconds: float = 10.0


class OKXClient:
    """
    Thin asynchronous wrapper around ccxt.okx with retry logic and sandbox support.
    """

    def __init__(self, config: OKXClientConfig, exchange: ccxt.okx) -> None:
        self._config = config
        self._exchange = exchange
        self._lock = asyncio.Lock()

    @classmethod
    async def create(
        cls,
        *,
        settings: Settings | None = None,
        exchange_factory: Callable[[OKXClientConfig], ccxt.okx] | None = None,
    ) -> "OKXClient":
        settings = settings or get_settings()
        if not settings.okx_api_key or not settings.okx_secret_key or not settings.okx_passphrase:
            raise OKXClientError("OKX API credentials are not configured")

        config = OKXClientConfig(
            api_key=settings.okx_api_key,
            secret_key=settings.okx_secret_key,
            passphrase=settings.okx_passphrase,
            demo_mode=settings.okx_demo_mode,
            timeout_seconds=settings.okx_timeout_seconds,
            max_retries=settings.okx_max_retries,
            backoff_seconds=settings.okx_backoff_seconds,
            backoff_max_seconds=settings.okx_backoff_max_seconds,
        )

        factory = exchange_factory or cls._create_exchange
        exchange = factory(config)
        await exchange.load_markets()
        logger.info("OKX client initialized (sandbox=%s)", config.demo_mode)
        return cls(config, exchange)

    @staticmethod
    def _create_exchange(config: OKXClientConfig) -> ccxt.okx:
        exchange = ccxt.okx(
            {
                "apiKey": config.api_key,
                "secret": config.secret_key,
                "password": config.passphrase,
                "enableRateLimit": True,
                "timeout": int(config.timeout_seconds * 1000),
            }
        )
        if config.demo_mode:
            exchange.set_sandbox_mode(True)
            if "urls" in exchange.__dict__:
                exchange.urls["api"]["rest"] = "https://my.okx.com"
        return exchange

    async def close(self) -> None:
        if self._exchange:
            await self._exchange.close()

    async def create_order(
        self,
        symbol: str,
        order_type: str,
        side: str,
        amount: float,
        price: float | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        params = params or {}
        return await self._call_with_retries(
            f"create_order({symbol})",
            lambda: self._exchange.create_order(symbol, order_type, side, amount, price, params),
        )

    async def cancel_order(self, order_id: str, symbol: str | None = None) -> dict[str, Any]:
        return await self._call_with_retries(
            f"cancel_order({order_id})", lambda: self._exchange.cancel_order(order_id, symbol)
        )

    async def edit_order(
        self,
        order_id: str,
        symbol: str,
        *,
        amount: float | None = None,
        price: float | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        params = params or {}
        if not hasattr(self._exchange, "edit_order"):
            raise OKXClientError("Exchange does not support edit_order")
        return await self._call_with_retries(
            f"edit_order({order_id})",
            lambda: self._exchange.edit_order(order_id, symbol, None, None, amount, price, params),
        )

    async def fetch_order(self, order_id: str, symbol: str | None = None) -> dict[str, Any]:
        return await self._call_with_retries(
            f"fetch_order({order_id})", lambda: self._exchange.fetch_order(order_id, symbol)
        )

    async def fetch_open_orders(self, symbol: str | None = None) -> list[dict[str, Any]]:
        return await self._call_with_retries(
            f"fetch_open_orders({symbol or 'all'})", lambda: self._exchange.fetch_open_orders(symbol)
        )

    async def fetch_balance(self) -> dict[str, Any]:
        return await self._call_with_retries("fetch_balance", self._exchange.fetch_balance)

    async def fetch_positions(self) -> list[dict[str, Any]]:
        if not hasattr(self._exchange, "fetch_positions"):
            raise OKXClientError("Exchange does not support fetch_positions")
        return await self._call_with_retries("fetch_positions", self._exchange.fetch_positions)

    async def fetch_trades(
        self,
        symbol: str | None = None,
        *,
        since: int | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        return await self._call_with_retries(
            f"fetch_trades({symbol})", lambda: self._exchange.fetch_my_trades(symbol, since=since, limit=limit)
        )

    async def _call_with_retries(
        self,
        label: str,
        func: Callable[[], Awaitable[Any]],
    ) -> Any:
        delay = self._config.backoff_seconds
        for attempt in range(1, self._config.max_retries + 1):
            try:
                async with self._lock:
                    return await func()
            except Exception as exc:  # pragma: no cover - network layer errors
                if attempt >= self._config.max_retries:
                    raise OKXClientError(f"Exceeded retries for {label}") from exc
                jitter = 0.5 + (attempt * 0.1)
                sleep_for = min(delay * jitter, self._config.backoff_max_seconds)
                logger.warning(
                    "OKX call %s failed (attempt %s/%s): %s – retrying in %.2fs",
                    label,
                    attempt,
                    self._config.max_retries,
                    exc,
                    sleep_for,
                )
                await asyncio.sleep(sleep_for)
                delay = min(delay * 2, self._config.backoff_max_seconds)

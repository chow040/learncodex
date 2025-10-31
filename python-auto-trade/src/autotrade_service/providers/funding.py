from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol

import httpx

from ..config import get_settings


class FundingProviderError(RuntimeError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class FundingProvider(Protocol):
    async def fetch(self, symbol: str) -> dict[str, Any]:
        ...


@dataclass(slots=True)
class FundingProviderConfig:
    base_url: str | None
    timeout_seconds: float = 5.0
    api_key: str | None = None
    headers: dict[str, str] | None = None


@dataclass(slots=True)
class FundingSnapshot:
    symbol: str
    funding_rate: float
    open_interest: float
    provider: str
    fetched_at: datetime


class FundingFetcher:
    """
    Normalizes funding/open-interest data from a pluggable provider endpoint.
    """

    def __init__(
        self,
        config: FundingProviderConfig | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        settings = get_settings()
        self._config = config or FundingProviderConfig(
            base_url=settings.funding_provider_base_url or "https://api.exchange.coinbase.com",
            timeout_seconds=settings.funding_provider_timeout_seconds,
            api_key=settings.funding_provider_api_key,
        )
        if not self._config.base_url:
            raise FundingProviderError("Funding provider base URL not configured")
        headers = {"User-Agent": "autotrade-service/0.1"}
        if self._config.api_key:
            headers["Authorization"] = f"Bearer {self._config.api_key}"
        if self._config.headers:
            headers.update(self._config.headers)
        self._client = client or httpx.AsyncClient(timeout=self._config.timeout_seconds, headers=headers)
        self._logger = logging.getLogger("autotrade.providers.funding")
        self._lock = asyncio.Lock()

    async def fetch_snapshot(self, symbol: str) -> FundingSnapshot:
        async with self._lock:
            response = await self._client.get(f"{self._config.base_url}/funding/{symbol}")
            if response.status_code >= 400:
                raise FundingProviderError(f"Failed to fetch funding for {symbol}: {response.status_code}")
            payload = response.json()
            return FundingSnapshot(
                symbol=symbol,
                funding_rate=float(payload.get("funding_rate", 0.0)),
                open_interest=float(payload.get("open_interest", 0.0)),
                provider=self._config.base_url,
                fetched_at=_utcnow(),
            )

    async def close(self) -> None:
        await self._client.aclose()

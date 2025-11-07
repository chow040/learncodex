from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Sequence

from ..config import Settings, get_settings
from ..providers.okx_derivatives import (
    DerivativesProviderError,
    DerivativesSnapshot,
    OKXDerivativesFetcher,
)
from .cache import ToolCache


@dataclass(slots=True)
class DerivativesToolSnapshot:
    symbol: str
    snapshot: DerivativesSnapshot


class DerivativesDataTool:
    """
    Thin wrapper around OKXDerivativesFetcher that exposes cached snapshot retrieval
    for LangChain tool executions. Results can be cached via ToolCache so repeated
    tool calls within a single decision run avoid extra network requests.
    """

    def __init__(
        self,
        *,
        fetcher: OKXDerivativesFetcher,
        cache: ToolCache | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._fetcher = fetcher
        self._cache = cache
        self._settings = settings or get_settings()
        self._logger = logging.getLogger("autotrade.tools.derivatives")

    async def fetch(self, symbols: Sequence[str]) -> Dict[str, DerivativesSnapshot]:
        if not symbols:
            raise ValueError("No symbols provided for derivatives data fetch")

        normalized: list[str] = []
        for symbol in symbols:
            if not symbol:
                continue
            normalized.append(self._resolve_input_symbol(symbol))
        if not normalized:
            raise ValueError(
                "No valid symbols provided for derivatives data fetch. "
                "Use base symbols like 'BTC' or trading pairs like 'BTC-USD'."
            )

        snapshots: Dict[str, DerivativesSnapshot] = {}
        missing: list[str] = []

        for symbol in normalized:
            cached = self._get_cached(symbol)
            if cached:
                snapshots[symbol] = cached.snapshot
            else:
                missing.append(symbol)

        for symbol in missing:
            try:
                snapshot = await self._fetcher.fetch_snapshot(symbol)
            except DerivativesProviderError:
                self._logger.exception("Failed to fetch derivatives snapshot for %s", symbol)
                raise
            snapshots[symbol] = snapshot
            self._set_cached(symbol, snapshot)

        return snapshots

    async def fetch_serialized(self, symbols: Sequence[str]) -> Dict[str, Dict[str, Any]]:
        """
        Fetch derivatives snapshots and return JSON-serializable payloads per symbol.
        """
        snapshots = await self.fetch(symbols)
        return {symbol: self._serialize_snapshot(snapshot) for symbol, snapshot in snapshots.items()}

    def normalize_symbol(self, symbol: str) -> str:
        """
        Normalize arbitrary symbol strings to the configured OKX mapping key.
        Raises ValueError if the symbol cannot be resolved.
        """

        return self._resolve_input_symbol(symbol)

    def _get_cached(self, symbol: str) -> DerivativesToolSnapshot | None:
        if not self._cache:
            return None
        cached = self._cache.get(self._cache_key(symbol))
        if cached is None:
            return None
        if isinstance(cached, DerivativesToolSnapshot):
            return cached
        # Backwards compatibility: handle storing raw snapshots directly
        if isinstance(cached, DerivativesSnapshot):
            return DerivativesToolSnapshot(symbol=symbol, snapshot=cached)
        return None

    def _set_cached(self, symbol: str, snapshot: DerivativesSnapshot) -> None:
        if not self._cache:
            return
        payload = DerivativesToolSnapshot(symbol=symbol, snapshot=snapshot)
        self._cache.set(self._cache_key(symbol), payload)

    def _cache_key(self, symbol: str) -> str:
        return f"derivatives:{symbol}"

    @staticmethod
    def _serialize_snapshot(snapshot: DerivativesSnapshot) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "funding_rate": snapshot.funding_rate,
            "funding_rate_pct": snapshot.funding_rate_pct,
            "funding_rate_annual_pct": snapshot.funding_rate_annual_pct,
            "predicted_funding_rate": snapshot.predicted_funding_rate,
            "next_funding_time": _serialize_datetime(snapshot.next_funding_time),
            "open_interest_usd": snapshot.open_interest_usd,
            "open_interest_contracts": snapshot.open_interest_contracts,
            "open_interest_timestamp": _serialize_datetime(snapshot.open_interest_timestamp),
            "mark_price": snapshot.mark_price,
            "provider": snapshot.provider,
            "fetched_at": _serialize_datetime(snapshot.fetched_at),
        }
        # Include raw payloads for debugging / advanced use
        if snapshot.raw_funding is not None:
            payload["raw_funding"] = snapshot.raw_funding
        if snapshot.raw_open_interest is not None:
            payload["raw_open_interest"] = snapshot.raw_open_interest
        return payload

    def _resolve_input_symbol(self, symbol: str) -> str:
        candidate = str(symbol).strip().upper()
        mapping = self._fetcher.config.symbol_mapping

        def _candidates(value: str) -> list[str]:
            items = [value]
            items.append(value.replace("/", "-"))
            items.append(value.replace("/", ""))
            items.append(value.replace("-", ""))
            if value.endswith("USDT"):
                items.append(value[:-4])
            if value.endswith("USD"):
                items.append(value[:-3])
            expanded: list[str] = []
            for candidate in items:
                expanded.append(candidate)
                if "-" in candidate:
                    expanded.append(candidate.split("-", 1)[0])
                if "/" in candidate:
                    expanded.append(candidate.split("/", 1)[0])
                if candidate.endswith(":USDT"):
                    expanded.append(candidate.split(":", 1)[0])
            return [item for item in dict.fromkeys(expanded) if item]

        for option in _candidates(candidate):
            if option in mapping:
                return option
        raise ValueError(
            f"No OKX symbol mapping configured for '{symbol}'. "
            "Update AUTOTRADE_OKX_SYMBOL_MAPPING or pass a supported symbol."
        )


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc).isoformat()  # pragma: no cover - defensive path
    return value.isoformat()


__all__ = ["DerivativesDataTool", "DerivativesToolSnapshot"]

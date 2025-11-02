from __future__ import annotations

import inspect
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional, Sequence

import ccxt.async_support as ccxt  # type: ignore[import-not-found]

from ..config import Settings, get_settings
from ..market_data.ccxt_adapter import CCXTMarketConfig
from .cache import ToolCache

ExchangeFactory = Callable[[str, CCXTMarketConfig], ccxt.Exchange | Awaitable[ccxt.Exchange]]


def seconds_to_ccxt_timeframe(seconds: int) -> str:
    """
    Convert seconds to CCXT timeframe string format.
    
    Args:
        seconds: Number of seconds in the timeframe
        
    Returns:
        CCXT-compatible timeframe string (e.g., "1m", "5m", "1h", "4h", "1d")
        
    Raises:
        ValueError: If seconds cannot be converted to a standard CCXT timeframe
    """
    # Standard CCXT timeframes in order of preference
    conversions = [
        (604800, "1w"),   # 7 days
        (86400, "1d"),    # 1 day
        (43200, "12h"),   # 12 hours
        (21600, "6h"),    # 6 hours
        (14400, "4h"),    # 4 hours
        (7200, "2h"),     # 2 hours
        (3600, "1h"),     # 1 hour
        (1800, "30m"),    # 30 minutes
        (900, "15m"),     # 15 minutes
        (300, "5m"),      # 5 minutes
        (180, "3m"),      # 3 minutes
        (60, "1m"),       # 1 minute
    ]
    
    for sec, timeframe in conversions:
        if seconds == sec:
            return timeframe
    
    # If exact match not found, try to find a suitable divisor
    if seconds >= 3600 and seconds % 3600 == 0:
        hours = seconds // 3600
        return f"{hours}h"
    elif seconds >= 60 and seconds % 60 == 0:
        minutes = seconds // 60
        return f"{minutes}m"
    
    raise ValueError(
        f"Cannot convert {seconds} seconds to a standard CCXT timeframe. "
        f"Supported values: 60 (1m), 180 (3m), 300 (5m), 900 (15m), 1800 (30m), "
        f"3600 (1h), 7200 (2h), 14400 (4h), 21600 (6h), 43200 (12h), 86400 (1d), 604800 (1w)"
    )


@dataclass(slots=True)
class OhlcCandle:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(slots=True)
class LiveMarketData:
    symbol: str
    ohlcv_intraday: List[OhlcCandle]
    ohlcv_high_timeframe: List[OhlcCandle]
    last_price: float
    fetched_at: datetime
    metadata: Dict[str, Any]


class LiveMarketDataTool:
    """
    Fetches OHLC data from CCXT on demand for LangChain tool invocations.

    The tool keeps no persistent polling loop; each call creates a short-lived
    exchange client, pulls the requested timeframes, and optionally stores the
    payload in the shared ToolCache so subsequent tool calls within the same run
    avoid extra network requests.
    """

    def __init__(
        self,
        *,
        cache: ToolCache | None = None,
        settings: Settings | None = None,
        exchange_factory: ExchangeFactory | None = None,
        intraday_timeframe: str | None = None,
        intraday_limit: int | None = None,
        high_timeframe: str | None = None,
        high_limit: int | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        config_symbols = self._settings.symbols or ["BTC-USD"]
        self._ccxt_config = CCXTMarketConfig.from_settings(self._settings, config_symbols)
        self._cache = cache
        self._custom_exchange_factory = exchange_factory
        
        # Short-term timeframe: use provided value, or config, or default to 1m
        self._intraday_timeframe = intraday_timeframe or self._settings.ccxt_short_term_timeframe or "1m"
        default_limit = self._settings.ccxt_ohlcv_limit or 200
        # Ensure we have at least enough bars for indicator calculations without forcing large history
        self._intraday_limit = intraday_limit or max(default_limit, 50)
        
        # Long-term timeframe: use provided value, or config ccxt_long_term_timeframe, or fall back to converting from seconds
        if high_timeframe is not None:
            self._high_timeframe = high_timeframe
        elif hasattr(self._settings, 'ccxt_long_term_timeframe') and self._settings.ccxt_long_term_timeframe:
            self._high_timeframe = self._settings.ccxt_long_term_timeframe
        else:
            try:
                self._high_timeframe = seconds_to_ccxt_timeframe(self._settings.indicator_high_timeframe_seconds)
            except ValueError as e:
                self._logger = logging.getLogger("autotrade.tools.live_market")
                self._logger.warning(
                    "Could not convert indicator_high_timeframe_seconds=%d to CCXT timeframe: %s. "
                    "Falling back to '4h'.",
                    self._settings.indicator_high_timeframe_seconds,
                    e,
                )
                self._high_timeframe = "4h"
        
        # High limit: calculate based on timeframe to maintain consistent time coverage
        if high_limit is not None:
            self._high_limit = high_limit
        else:
            # Use config setting, or calculate based on timeframe for ~5 days of data
            if hasattr(self._settings, 'ccxt_ohlcv_high_limit'):
                self._high_limit = self._settings.ccxt_ohlcv_high_limit
            else:
                # Fallback calculation: 5 days = 120 hours
                timeframe_hours = self._settings.indicator_high_timeframe_seconds / 3600
                target_hours = 120  # 5 days
                self._high_limit = max(30, int(target_hours / timeframe_hours))
        
        self._logger = logging.getLogger("autotrade.tools.live_market")

    async def fetch(self, symbols: Sequence[str]) -> Dict[str, LiveMarketData]:
        if not self._settings.ccxt_enabled:
            raise RuntimeError("CCXT is disabled; enable AUTOTRADE_CCXT_ENABLED to use LiveMarketDataTool.")

        normalized = [symbol.upper() for symbol in symbols]
        cached_results: Dict[str, LiveMarketData] = {}
        missing: List[str] = []
        for symbol in normalized:
            cached = self._get_cached(symbol)
            if cached:
                cached_results[symbol] = cached
            else:
                missing.append(symbol)

        if not missing:
            return cached_results

        exchange = await self._create_exchange()
        try:
            results = await self._fetch_symbols(exchange, missing)
            cached_results.update(results)
            return cached_results
        finally:
            await self._close_exchange(exchange)

    def _get_cached(self, symbol: str) -> LiveMarketData | None:
        if not self._cache:
            return None
        cached = self._cache.get(self._cache_key(symbol))
        if cached is None:
            return None
        return cached

    async def _fetch_symbols(
        self,
        exchange: ccxt.Exchange,
        symbols: Iterable[str],
    ) -> Dict[str, LiveMarketData]:
        results: Dict[str, LiveMarketData] = {}
        fetched_at = datetime.now(timezone.utc)
        for symbol in symbols:
            ccxt_symbol = self._resolve_symbol(symbol)
            intraday_rows = await exchange.fetch_ohlcv(
                ccxt_symbol,
                timeframe=self._intraday_timeframe,
                limit=self._intraday_limit,
            )
            high_tf_rows = await exchange.fetch_ohlcv(
                ccxt_symbol,
                timeframe=self._high_timeframe,
                limit=self._high_limit,
            )
            if not intraday_rows:
                self._logger.warning("No intraday OHLCV data returned for %s (%s)", symbol, ccxt_symbol)
            intraday = self._convert_rows(intraday_rows)
            higher_tf = self._convert_rows(high_tf_rows)
            last_price = intraday[-1].close if intraday else 0.0
            payload = LiveMarketData(
                symbol=symbol,
                ohlcv_intraday=intraday,
                ohlcv_high_timeframe=higher_tf,
                last_price=last_price,
                fetched_at=fetched_at,
                metadata={
                    "short_term_timeframe": self._intraday_timeframe,
                    "long_term_timeframe": self._high_timeframe,
                    "short_term_limit": self._intraday_limit,
                    "long_term_limit": self._high_limit,
                    "ccxt_symbol": ccxt_symbol,
                },
            )
            if self._cache:
                self._cache.set(self._cache_key(symbol), payload)
            results[symbol] = payload
        return results

    async def _build_default_exchange(self, exchange_id: str, config: CCXTMarketConfig) -> ccxt.Exchange:
        try:
            exchange_class = getattr(ccxt, exchange_id)
        except AttributeError as exc:  # pragma: no cover - misconfiguration
            raise ValueError(f"Unknown CCXT exchange: {exchange_id}") from exc
        options: Dict[str, Any] = {
            "enableRateLimit": True,
            "timeout": int(config.timeout_seconds * 1000),
        }
        exchange = exchange_class(options)
        if config.api_key:
            exchange.apiKey = config.api_key
        if config.secret:
            exchange.secret = config.secret
        if config.password:
            exchange.password = config.password
        return exchange

    async def _create_exchange(self) -> ccxt.Exchange:
        exchange: ccxt.Exchange
        if self._custom_exchange_factory:
            factory = self._custom_exchange_factory
            candidate: ccxt.Exchange | Awaitable[ccxt.Exchange]
            try:
                candidate = factory(self._ccxt_config.exchange_id, self._ccxt_config)
            except TypeError:
                try:
                    candidate = factory(self._ccxt_config)
                except TypeError:
                    candidate = factory()  # type: ignore[call-arg]
            if inspect.isawaitable(candidate):
                exchange = await candidate
            else:
                exchange = candidate
        else:
            exchange = await self._build_default_exchange(
                self._ccxt_config.exchange_id,
                self._ccxt_config,
            )
        try:
            await exchange.load_markets()
        except Exception:
            # Ensure transport resources are released if load_markets fails
            await self._close_exchange(exchange)
            raise
        return exchange

    async def _close_exchange(self, exchange: ccxt.Exchange) -> None:
        try:
            await exchange.close()
        except Exception:  # pragma: no cover - best effort cleanup
            self._logger.debug("Failed to close exchange session", exc_info=True)

    def _resolve_symbol(self, symbol: str) -> str:
        mapping = self._ccxt_config.symbol_map
        if symbol in mapping:
            return mapping[symbol]
        fallback = symbol.replace("-", "/")
        self._logger.debug("Symbol %s not in configured map; falling back to %s", symbol, fallback)
        return fallback

    @staticmethod
    def _convert_rows(rows: List[List[Any]]) -> List[OhlcCandle]:
        candles: List[OhlcCandle] = []
        for row in rows:
            if len(row) < 6:
                continue
            timestamp = LiveMarketDataTool._to_datetime(row[0])
            candles.append(
                OhlcCandle(
                    timestamp=timestamp,
                    open=float(row[1]),
                    high=float(row[2]),
                    low=float(row[3]),
                    close=float(row[4]),
                    volume=float(row[5]),
                )
            )
        return candles

    @staticmethod
    def _to_datetime(value: int | float | None) -> datetime:
        if value is None:
            return datetime.now(timezone.utc)
        return datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc)

    def _cache_key(self, symbol: str) -> str:
        return f"live-market:{symbol}"

__all__ = ["LiveMarketData", "LiveMarketDataTool", "OhlcCandle"]

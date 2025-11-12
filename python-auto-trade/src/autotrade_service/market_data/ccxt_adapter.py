from __future__ import annotations

import asyncio
import inspect
import logging
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Iterable, Optional, Protocol

import ccxt.async_support as ccxt  # type: ignore[import-not-found]

from ..config import Settings, get_settings
from .models import SymbolTick
from .tick_buffer import RedisTickBuffer


def _utc_from_millis(value: int | float | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc)


class CCXTExchange(Protocol):
    async def load_markets(self) -> dict[str, Any]:
        ...

    async def fetch_trades(
        self,
        symbol: str,
        since: Optional[int] = None,
        limit: Optional[int] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        ...

    async def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1m",
        since: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> list[list[float | int]]:
        ...

    async def close(self) -> None:
        ...


ExchangeFactory = Callable[[str, "CCXTMarketConfig"], Awaitable[CCXTExchange] | CCXTExchange]


def _default_symbol_map(symbols: Iterable[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for symbol in symbols:
        exchange_symbol = symbol.replace("-", "/")
        mapping[symbol] = exchange_symbol
    return mapping


@dataclass(slots=True)
class CCXTMarketConfig:
    exchange_id: str
    symbol_map: dict[str, str]
    poll_interval_seconds: float = 210.0
    poll_jitter_seconds: float = 15.0
    trades_limit: int = 200
    ohlcv_limit: int = 150
    timeframe: str = "1m"
    enable_trades: bool = True
    enable_ohlcv: bool = True
    timeout_seconds: float = 10.0
    max_retries: int = 3
    backoff_seconds: float = 5.0
    backoff_max_seconds: float = 120.0
    api_key: str | None = None
    secret: str | None = None
    password: str | None = None

    @classmethod
    def from_settings(cls, settings: Settings, fallback_symbols: Iterable[str]) -> "CCXTMarketConfig":
        symbol_map: dict[str, str]
        if settings.ccxt_symbol_map:
            symbol_map = {key: value for key, value in settings.ccxt_symbol_map.items()}
        elif settings.ccxt_symbols:
            symbol_map = {}
            for entry in settings.ccxt_symbols:
                if ":" in entry:
                    internal, ccxt_symbol = entry.split(":", 1)
                    internal_symbol = internal.strip()
                    ccxt_symbol = ccxt_symbol.strip()
                    if internal_symbol and ccxt_symbol:
                        symbol_map[internal_symbol] = ccxt_symbol
                else:
                    internal_symbol = entry.replace("/", "-")
                    symbol_map[internal_symbol] = entry
        else:
            symbol_map = _default_symbol_map(fallback_symbols)
        if not symbol_map:
            raise ValueError("CCXT symbol map cannot be empty")
        return cls(
            exchange_id=settings.ccxt_exchange_id,
            symbol_map=symbol_map,
            poll_interval_seconds=settings.ccxt_poll_interval_seconds,
            poll_jitter_seconds=settings.ccxt_poll_jitter_seconds,
            trades_limit=settings.ccxt_trades_limit,
            ohlcv_limit=settings.ccxt_ohlcv_short_term_candles_no,
            timeframe=settings.ccxt_short_term_timeframe,
            enable_trades=settings.ccxt_enable_trades,
            enable_ohlcv=settings.ccxt_enable_ohlcv,
            timeout_seconds=settings.ccxt_timeout_seconds,
            max_retries=settings.ccxt_max_retries,
            backoff_seconds=settings.ccxt_backoff_seconds,
            backoff_max_seconds=settings.ccxt_backoff_max_seconds,
            api_key=settings.ccxt_api_key,
            secret=settings.ccxt_secret,
            password=settings.ccxt_password,
        )

    @property
    def internal_symbols(self) -> list[str]:
        return list(self.symbol_map.keys())


@dataclass(slots=True)
class CCXTMarketState:
    last_trade_timestamp: dict[str, int] = field(default_factory=dict)
    last_ohlcv_timestamp: dict[str, int] = field(default_factory=dict)


class CCXTMarketDataAdapter:
    """
    Async CCXT polling adapter that normalizes trade and OHLCV payloads to SymbolTick events.
    """

    def __init__(
        self,
        config: CCXTMarketConfig | None = None,
        *,
        tick_buffer: RedisTickBuffer | None = None,
        exchange_factory: ExchangeFactory | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._config = config or CCXTMarketConfig.from_settings(self._settings, self._settings.symbols or [])
        self._tick_buffer = tick_buffer or RedisTickBuffer()
        self._exchange_factory = exchange_factory or self._create_exchange
        self._exchange: CCXTExchange | None = None
        self._state = CCXTMarketState()
        self._logger = logging.getLogger("autotrade.market.ccxt")
        self._poll_lock = asyncio.Lock()
        self._start_lock = asyncio.Lock()
        self._running = False
        self._loop_task: asyncio.Task[None] | None = None
        self._consecutive_failures = 0

    async def start(self) -> None:
        async with self._start_lock:
            if self._running:
                return
            self._running = True
            if self._loop_task is None or self._loop_task.done():
                self._loop_task = asyncio.create_task(self._run_loop(), name="ccxt-market-poller")

    async def stop(self) -> None:
        async with self._start_lock:
            self._running = False
            if self._loop_task and not self._loop_task.done():
                self._loop_task.cancel()
                try:
                    await self._loop_task
                except asyncio.CancelledError:
                    pass
            self._loop_task = None
            if self._exchange:
                await self._exchange.close()
                self._exchange = None

    async def poll_once(self) -> int:
        async with self._poll_lock:
            exchange = await self._ensure_exchange()
            total_ticks = 0
            for internal_symbol, ccxt_symbol in self._config.symbol_map.items():
                if self._config.enable_trades:
                    total_ticks += await self._ingest_trades(exchange, internal_symbol, ccxt_symbol)
                if self._config.enable_ohlcv:
                    total_ticks += await self._ingest_ohlcv(exchange, internal_symbol, ccxt_symbol)
            return total_ticks

    async def _run_loop(self) -> None:
        while self._running:
            try:
                count = await self.poll_once()
                if count:
                    self._logger.debug("Ingested %s CCXT ticks", count)
                self._consecutive_failures = 0
            except asyncio.CancelledError:  # pragma: no cover - expected on shutdown
                break
            except Exception as exc:  # pragma: no cover - network/path
                self._consecutive_failures += 1
                self._logger.warning("CCXT polling error (attempt %s): %s", self._consecutive_failures, exc)
                if self._consecutive_failures > self._config.max_retries:
                    self._logger.error("CCXT polling exceeded max retries; continuing with backoff")
            await self._sleep_interval()

    async def _sleep_interval(self) -> None:
        base = self._config.poll_interval_seconds
        jitter = random.uniform(0.0, self._config.poll_jitter_seconds)
        delay = base + jitter
        if self._consecutive_failures:
            backoff = min(
                self._config.backoff_seconds * (2 ** (self._consecutive_failures - 1)),
                self._config.backoff_max_seconds,
            )
            delay = max(delay, backoff)
        await asyncio.sleep(max(delay, 1.0))

    async def _ensure_exchange(self) -> CCXTExchange:
        if self._exchange is not None:
            return self._exchange
        exchange = self._exchange_factory(self._config.exchange_id, self._config)
        if inspect.isawaitable(exchange):
            exchange = await exchange
        await exchange.load_markets()
        self._exchange = exchange
        return exchange

    def _create_exchange(self, exchange_id: str, config: CCXTMarketConfig) -> CCXTExchange:
        try:
            exchange_class = getattr(ccxt, exchange_id)
        except AttributeError as exc:  # pragma: no cover - misconfiguration
            raise ValueError(f"Unknown CCXT exchange: {exchange_id}") from exc
        options: Dict[str, Any] = {
            "enableRateLimit": True,
            "timeout": int(config.timeout_seconds * 1000),
        }
        
        # OKX demo trading support
        if exchange_id == "okx" and self._settings.okx_demo_mode:
            options["demo"] = True
            # Set regional base URL if configured
            if self._settings.okx_base_url:
                options["hostname"] = self._settings.okx_base_url.replace("https://", "")
        
        exchange = exchange_class(options)
        if config.api_key:
            exchange.apiKey = config.api_key
        if config.secret:
            exchange.secret = config.secret
        if config.password:
            exchange.password = config.password
        return exchange

    async def _ingest_trades(self, exchange: CCXTExchange, internal_symbol: str, ccxt_symbol: str) -> int:
        since = self._state.last_trade_timestamp.get(internal_symbol)
        params: Dict[str, Any] = {}
        request_since = since
        if self._config.exchange_id == "coinbase" and since is not None:
            params["until"] = int(datetime.now(timezone.utc).timestamp() * 1000)
        trades = await exchange.fetch_trades(
            ccxt_symbol,
            since=request_since,
            limit=self._config.trades_limit,
            params=params,
        )
        emitted = 0
        last_ts = since or 0
        for trade in trades:
            timestamp = int(trade.get("timestamp") or 0)
            if since and timestamp <= since:
                continue
            tick = SymbolTick(
                symbol=internal_symbol,
                price=float(trade.get("price") or 0.0),
                volume=float(trade.get("amount") or trade.get("volume") or 0.0),
                side=str(trade.get("side") or "unknown"),
                exchange_timestamp=_utc_from_millis(timestamp),
                raw=trade,
            )
            await self._tick_buffer.append(tick)
            emitted += 1
            last_ts = max(last_ts, timestamp)
        if emitted:
            self._state.last_trade_timestamp[internal_symbol] = last_ts
        return emitted

    async def _ingest_ohlcv(self, exchange: CCXTExchange, internal_symbol: str, ccxt_symbol: str) -> int:
        since = self._state.last_ohlcv_timestamp.get(internal_symbol)
        ohlcv = await exchange.fetch_ohlcv(
            ccxt_symbol,
            timeframe=self._config.timeframe,
            since=since,
            limit=self._config.ohlcv_limit,
        )
        emitted = 0
        last_ts = since or 0
        for row in ohlcv:
            if len(row) < 6:
                continue
            timestamp = int(row[0])
            if since and timestamp <= since:
                continue
            open_, high, low, close, volume = float(row[1]), float(row[2]), float(row[3]), float(row[4]), float(row[5])
            tick_payload = {
                "type": "ohlcv",
                "open": open_,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
                "timeframe": self._config.timeframe,
            }
            tick = SymbolTick(
                symbol=internal_symbol,
                price=close,
                volume=volume,
                side="unknown",
                exchange_timestamp=_utc_from_millis(timestamp),
                raw=tick_payload,
            )
            await self._tick_buffer.append(tick)
            emitted += 1
            last_ts = max(last_ts, timestamp)
        if emitted:
            self._state.last_ohlcv_timestamp[internal_symbol] = last_ts
        return emitted

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Sequence

from redis.asyncio import Redis

from ..config import Settings, get_settings
from ..market_data.ccxt_adapter import CCXTMarketConfig
from ..indicators.calculations import IndicatorCalculations


@dataclass(slots=True)
class MarketDataSchedulerStatus:
    last_run_at: datetime | None
    last_duration_seconds: float | None
    last_error: str | None
    api_success: int = 0
    api_failures: int = 0
    redis_writes: int = 0
    consecutive_failures: int = 0


class MarketDataScheduler:
    """High-frequency scheduler responsible for caching market data in Redis."""

    def __init__(
        self,
        *,
        redis_client: Redis,
        exchange: Any,
        websocket_manager: Any | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.redis = redis_client
        self.exchange = exchange
        self.ws_manager = websocket_manager
        self.settings = settings or get_settings()
        self.symbols = self.settings.market_data_symbols
        self._ccxt_config = CCXTMarketConfig.from_settings(
            self.settings,
            self.symbols or [],
        )
        self.symbol_map = self._ccxt_config.symbol_map
        self.interval_seconds = self.settings.market_data_refresh_interval_seconds
        self.logger = logging.getLogger("autotrade.scheduler.market_data")
        self.indicator_calc = IndicatorCalculations()
        self._running = False
        self._task: asyncio.Task[None] | None = None
        self.status = MarketDataSchedulerStatus(None, None, None)
        self._alert_threshold = 3

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop(), name="market-data-scheduler")
        self.logger.info(
            "Market data scheduler started (interval=%ss symbols=%s)",
            self.interval_seconds,
            len(self.symbols),
        )

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:  # pragma: no cover - expected on shutdown
                pass
        self.logger.info("Market data scheduler stopped")

    async def trigger_once(self) -> None:
        await self.run_cycle()

    async def _run_loop(self) -> None:
        while self._running:
            await self.run_cycle()
            await asyncio.sleep(self.interval_seconds)

    async def run_cycle(self) -> None:
        start = _utcnow()
        self.logger.debug("Market data cycle started")
        self._reset_cycle_metrics()
        try:
            market_snapshot = await self._refresh_all_symbols()
            if market_snapshot and self.ws_manager:
                await self.ws_manager.broadcast_market_data(market_snapshot)
            self.status.last_error = None
            self.status.consecutive_failures = 0
        except Exception as exc:  # pragma: no cover - error path
            self.status.last_error = str(exc)
            self.logger.exception("Market data cycle failed: %s", exc)
            self.status.consecutive_failures += 1
            if self.status.consecutive_failures >= self._alert_threshold:
                self.logger.error(
                    "Market data scheduler failed %s consecutive times",
                    self.status.consecutive_failures,
                )
        finally:
            duration = (_utcnow() - start).total_seconds()
            self.status.last_run_at = start
            self.status.last_duration_seconds = duration
            self.logger.info("Market data cycle completed in %.2fs", duration)

    async def _refresh_all_symbols(self) -> Dict[str, Dict[str, Any]]:
        snapshots: Dict[str, Dict[str, Any]] = {}
        tasks = [self._process_symbol(symbol) for symbol in self.symbols]
        for task in asyncio.as_completed(tasks):
            result = await task
            if result:
                snapshots[result["symbol"]] = result
        return snapshots

    async def _process_symbol(self, symbol: str) -> Dict[str, Any] | None:
        try:
            ccxt_symbol = self._resolve_symbol(symbol)
            ticker, orderbook, funding = await asyncio.gather(
                self.exchange.fetch_ticker(ccxt_symbol),
                self.exchange.fetch_order_book(ccxt_symbol, limit=40),
                self.exchange.fetchFundingRate(ccxt_symbol),
                return_exceptions=True,
            )
            ticker = self._validate_api_result(symbol, "ticker", ticker, required=True)
            await self._cache_ticker(symbol, ticker)

            orderbook_data = self._validate_api_result(symbol, "orderbook", orderbook)
            if orderbook_data:
                await self._cache_orderbook(symbol, orderbook_data)
            funding_data = self._validate_api_result(symbol, "funding", funding)
            if funding_data:
                await self._cache_funding(symbol, funding_data)

            await self._cache_ohlcv(symbol, self.settings.market_data_short_timeframe, self.settings.market_data_short_ttl_seconds)
            await self._cache_ohlcv(symbol, self.settings.market_data_long_timeframe, self.settings.market_data_long_ttl_seconds)

            await self._cache_indicators(symbol)

            snapshot = {
                "symbol": symbol,
                "price": float(ticker.get("last", 0) or 0),
                "change_24h": float(ticker.get("info", {}).get("change24h", 0) or ticker.get("change", 0) or 0),
                "change_pct_24h": self._calculate_change_pct(ticker),
                "volume_24h": float(
                    ticker.get("baseVolume", 0)
                    or ticker.get("info", {}).get("vol24h", 0)
                    or 0
                ),
                "high_24h": float(ticker.get("high", 0) or 0),
                "low_24h": float(ticker.get("low", 0) or 0),
            }
            self.logger.debug("Updated market data for %s", symbol)
            return snapshot
        except Exception as exc:
            self.logger.error("Failed to refresh %s: %s", symbol, exc)
            return None

    async def _cache_ticker(self, symbol: str, payload: dict[str, Any]) -> None:
        ttl = self.settings.market_data_ticker_ttl_seconds
        info = payload.get("info") or {}
        ticker_data = {
            "symbol": symbol,
            "last_price": payload.get("last"),
            "bid": payload.get("bid"),
            "ask": payload.get("ask"),
            "volume_24h": payload.get("baseVolume") or info.get("vol24h"),
            "high_24h": payload.get("high"),
            "low_24h": payload.get("low"),
            "change_24h": info.get("change24h"),
            "change_pct_24h": self._calculate_change_pct(payload),
            "timestamp": _utcnow().isoformat(),
        }
        await self.redis.setex(f"market:{symbol}:ticker", ttl, json.dumps(ticker_data))
        self._record_redis_write()

    async def _cache_orderbook(self, symbol: str, payload: dict[str, Any]) -> None:
        ttl = self.settings.market_data_orderbook_ttl_seconds
        data = {
            "bids": payload.get("bids", [])[:20],
            "asks": payload.get("asks", [])[:20],
            "timestamp": _utcnow().isoformat(),
        }
        await self.redis.setex(f"market:{symbol}:orderbook", ttl, json.dumps(data))
        self._record_redis_write()

    async def _cache_funding(self, symbol: str, payload: dict[str, Any]) -> None:
        ttl = self.settings.market_data_funding_ttl_seconds
        info = payload.get("info") or {}
        funding_rate = (
            payload.get("fundingRate")
            or info.get("fundingRate")
            or payload.get("funding_rate")
        )
        next_time = (
            payload.get("nextFundingTime")
            or payload.get("nextFundingTimestamp")
            or info.get("nextFundingTime")
        )
        data = {
            "funding_rate": funding_rate,
            "next_funding_time": next_time,
            "timestamp": _utcnow().isoformat(),
        }
        await self.redis.setex(f"market:{symbol}:funding", ttl, json.dumps(data))
        self._record_redis_write()

    async def _cache_ohlcv(self, symbol: str, timeframe: str, ttl: int) -> None:
        limit = (
            self.settings.ccxt_ohlcv_short_term_candles_no
            if timeframe == self.settings.market_data_short_timeframe
            else self.settings.ccxt_ohlcv_long_term_candles_no
        )
        ccxt_symbol = self._resolve_symbol(symbol)
        try:
            candles = await self.exchange.fetch_ohlcv(ccxt_symbol, timeframe=timeframe, limit=limit)
            self._record_api_success(f"candles:{timeframe}")
        except Exception as exc:
            self._record_api_failure(symbol, f"candles:{timeframe}", exc)
            raise
        payload = {
            "candles": candles,
            "timeframe": timeframe,
            "limit": limit,
            "timestamp": _utcnow().isoformat(),
        }
        await self.redis.setex(
            f"market:{symbol}:ohlcv:{timeframe}",
            ttl,
            json.dumps(payload),
        )
        self._record_redis_write()

    async def _cache_indicators(self, symbol: str) -> None:
        short_tf = self.settings.market_data_short_timeframe
        long_tf = self.settings.market_data_long_timeframe
        short_raw = await self.redis.get(f"market:{symbol}:ohlcv:{short_tf}")
        long_raw = await self.redis.get(f"market:{symbol}:ohlcv:{long_tf}")
        if not short_raw or not long_raw:
            self.logger.debug("Skipping indicators for %s due to missing OHLCV", symbol)
            return
        short_candles = json.loads(short_raw)["candles"]
        long_candles = json.loads(long_raw)["candles"]
        indicators = {
            "short_term": self._calculate_short_term_indicators(short_candles),
            "long_term": self._calculate_long_term_indicators(long_candles),
            "timestamp": _utcnow().isoformat(),
        }
        ttl = self.settings.market_data_indicator_ttl_seconds
        await self.redis.setex(
            f"market:{symbol}:indicators",
            ttl,
            json.dumps(indicators),
        )
        self._record_redis_write()

    def _calculate_short_term_indicators(self, candles: Sequence[Sequence[Any]]) -> Dict[str, Any]:
        closes = self._extract_series(candles, index=4)
        volumes = self._extract_series(candles, index=5)
        highs = self._extract_series(candles, index=2)
        lows = self._extract_series(candles, index=3)
        calc = self.indicator_calc
        macd_line, macd_signal, macd_hist = calc.macd(closes)
        return {
            "rsi_7": calc.rsi(closes, period=7),
            "rsi_14": calc.rsi(closes),
            "sma_20": calc.sma(closes, 20),
            "ema_12": calc.ema(closes, 12),
            "ema_20": calc.ema(closes, 20),
            "ema_26": calc.ema(closes, 26),
            "atr_3": calc.atr(highs, lows, closes, period=3),
            "atr_14": calc.atr(highs, lows, closes, period=14),
            "volume_avg_20": calc.volume_average(volumes, 20),
            "macd": {
                "macd": round(macd_line, 6),
                "signal": round(macd_signal, 6),
                "histogram": round(macd_hist, 6),
            },
        }

    def _calculate_long_term_indicators(self, candles: Sequence[Sequence[Any]]) -> Dict[str, Any]:
        closes = self._extract_series(candles, index=4)
        highs = self._extract_series(candles, index=2)
        lows = self._extract_series(candles, index=3)
        calc = self.indicator_calc
        return {
            "ema_20": calc.ema(closes, 20),
            "ema_50": calc.ema(closes, 50),
            "sma_50": calc.sma(closes, 50),
            "sma_100": calc.sma(closes, 100),
            "atr_3": calc.atr(highs, lows, closes, period=3),
            "atr_14": calc.atr(highs, lows, closes, period=14),
            "trend": calc.trend_direction(closes, lookback=50, tolerance=0.0001),
        }

    @staticmethod
    def _extract_series(candles: Sequence[Sequence[Any]], *, index: int) -> List[float]:
        series: List[float] = []
        for candle in candles:
            try:
                series.append(float(candle[index]))
            except (IndexError, TypeError, ValueError):
                continue
        return series

    @staticmethod
    def _calculate_change_pct(ticker: Dict[str, Any]) -> float:
        percentage = ticker.get("percentage")
        if percentage is not None:
            try:
                return round(float(percentage), 2)
            except (TypeError, ValueError):
                return 0.0
        info = ticker.get("info") or {}
        try:
            change = float(info.get("change24h", 0) or ticker.get("change", 0) or 0)
            last = float(ticker.get("last", 0) or 0)
            if last:
                return round((change / last) * 100, 2)
        except (TypeError, ValueError, ZeroDivisionError):
            pass
        return 0.0

    def _reset_cycle_metrics(self) -> None:
        self.status.api_success = 0
        self.status.api_failures = 0
        self.status.redis_writes = 0

    def _record_api_success(self, endpoint: str) -> None:
        self.status.api_success += 1
        self.logger.debug("API success: %s", endpoint)

    def _record_api_failure(self, symbol: str, endpoint: str, exc: Exception) -> None:
        self.status.api_failures += 1
        self.logger.warning("API failure [%s] for %s: %s", endpoint, symbol, exc)

    def _record_redis_write(self) -> None:
        self.status.redis_writes += 1

    def _validate_api_result(
        self,
        symbol: str,
        endpoint: str,
        result: Any,
        *,
        required: bool = False,
    ) -> Dict[str, Any] | None:
        if isinstance(result, Exception):
            self._record_api_failure(symbol, endpoint, result)
            if required:
                raise result
            return None
        self._record_api_success(endpoint)
        return result

    def _resolve_symbol(self, symbol: str) -> str:
        return self.symbol_map.get(symbol, symbol.replace("-", "/"))


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


__all__ = ["MarketDataScheduler", "MarketDataSchedulerStatus"]

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict

from redis.asyncio import Redis

from ..config import Settings, get_settings
from ..schedulers.decision_runner import execute_decision_cycle
from ..schedulers.types import CachedSymbolData


@dataclass(slots=True)
class LLMSchedulerStatus:
    last_run_at: datetime | None = None
    last_duration_seconds: float | None = None
    last_error: str | None = None
    consecutive_failures: int = 0
    last_decision_count: int = 0
    stale_symbols: int = 0


class LLMDecisionScheduler:
    """Scheduler that triggers LLM decision cycles using cached market data."""

    def __init__(
        self,
        redis_client: Redis,
        *,
        settings: Settings | None = None,
    ) -> None:
        self.redis = redis_client
        self.settings = settings or get_settings()
        self.logger = logging.getLogger("autotrade.scheduler.llm")
        self.interval_minutes = self.settings.llm_scheduler_interval_minutes
        self.stale_threshold = self.settings.llm_data_stale_threshold_seconds
        self.symbols = [symbol.upper() for symbol in self.settings.resolved_llm_symbols()]
        self._task: asyncio.Task[None] | None = None
        self._running = False
        self.status = LLMSchedulerStatus()

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self.logger.info(
            "LLM decision scheduler started (interval=%s min)",
            self.interval_minutes,
        )
        self._task = asyncio.create_task(self._run_loop(), name="llm-decision-scheduler")

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:  # pragma: no cover - expected on shutdown
                pass
        self.logger.info("LLM decision scheduler stopped")

    async def trigger_once(self) -> None:
        await self.run_cycle()

    async def _run_loop(self) -> None:
        while self._running:
            await self.run_cycle()
            await asyncio.sleep(self.interval_minutes * 60)

    async def run_cycle(self) -> None:
        start = datetime.now(timezone.utc)
        try:
            cached_data = await self._fetch_market_data_from_cache()
            if not cached_data:
                self.logger.warning("Skipping LLM evaluation; no cached market data available")
                self.status.last_error = "cache-miss"
                self.status.consecutive_failures += 1
                return

            result = await execute_decision_cycle(cached_market_data=cached_data, logger=self.logger)
            if result is None or not result.response.decisions:
                self.status.last_error = None
                self.status.last_decision_count = 0
                self.status.consecutive_failures = 0
            else:
                self.status.last_error = None
                self.status.last_decision_count = len(result.response.decisions)
                self.status.consecutive_failures = 0
        except Exception as exc:  # pragma: no cover - unexpected failure path
            self.status.last_error = str(exc)
            self.status.consecutive_failures += 1
            self.logger.exception("LLM decision cycle failed: %s", exc)
        finally:
            duration = (datetime.now(timezone.utc) - start).total_seconds()
            self.status.last_run_at = start
            self.status.last_duration_seconds = duration

    async def _fetch_market_data_from_cache(self) -> Dict[str, CachedSymbolData]:
        snapshots: Dict[str, CachedSymbolData] = {}
        stale_symbols = 0
        for symbol in self.symbols:
            ticker_key = f"market:{symbol}:ticker"
            ticker_raw = await self.redis.get(ticker_key)
            if not ticker_raw:
                self.logger.warning("Missing cached ticker for %s", symbol)
                continue
            try:
                ticker = json.loads(ticker_raw)
            except json.JSONDecodeError:
                self.logger.error("Invalid ticker JSON for %s", symbol)
                continue

            ticker_age, stale = self._calculate_age(ticker.get("timestamp"))
            if stale:
                stale_symbols += 1
                self.logger.warning(
                    "Ticker for %s is stale (%.1fs old)", symbol, ticker_age or -1
                )

            orderbook = await self._read_json(f"market:{symbol}:orderbook")
            funding = await self._read_json(f"market:{symbol}:funding")
            ohlcv_short = await self._read_json(f"market:{symbol}:ohlcv:{self.settings.market_data_short_timeframe}")
            ohlcv_long = await self._read_json(f"market:{symbol}:ohlcv:{self.settings.market_data_long_timeframe}")
            indicators = await self._read_json(f"market:{symbol}:indicators")

            snapshots[symbol] = CachedSymbolData(
                symbol=symbol,
                ticker=ticker,
                orderbook=orderbook,
                funding=funding,
                ohlcv_short=ohlcv_short,
                ohlcv_long=ohlcv_long,
                indicators=indicators,
                ticker_age=ticker_age,
                stale=stale,
            )

        self.status.stale_symbols = stale_symbols
        return snapshots

    async def _read_json(self, key: str):
        payload = await self.redis.get(key)
        if not payload:
            return None
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            self.logger.error("Invalid JSON for key %s", key)
            return None

    def _calculate_age(self, timestamp: str | None) -> tuple[float | None, bool]:
        if not timestamp:
            return None, True
        try:
            parsed = datetime.fromisoformat(timestamp)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - parsed).total_seconds()
            return age, age > self.stale_threshold
        except ValueError:
            return None, True


__all__ = ["LLMDecisionScheduler", "LLMSchedulerStatus"]

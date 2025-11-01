from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Literal, Optional
import json

from .config import get_settings
from .pipelines import get_decision_pipeline, shutdown_decision_pipeline
from .llm.langchain_agent import SYSTEM_PROMPT


@dataclass(slots=True)
class SchedulerJobStatus:
    job_id: str
    name: str
    status: Literal["idle", "running", "paused"]
    last_run_at: datetime | None
    next_run_at: datetime | None
    consecutive_failures: int

    def as_dict(self) -> dict[str, str | int | None]:
        return {
            "job_id": self.job_id,
            "name": self.name,
            "status": self.status,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "next_run_at": self.next_run_at.isoformat() if self.next_run_at else None,
            "consecutive_failures": self.consecutive_failures,
        }


@dataclass(slots=True)
class SchedulerStatus:
    implementation: str
    is_running: bool
    is_paused: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    consecutive_failures: int
    jobs: list[SchedulerJobStatus]

    def as_dict(self) -> dict[str, object]:
        return {
            "implementation": self.implementation,
            "is_running": self.is_running,
            "is_paused": self.is_paused,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "next_run_at": self.next_run_at.isoformat() if self.next_run_at else None,
            "consecutive_failures": self.consecutive_failures,
            "jobs": [job.as_dict() for job in self.jobs],
        }


class SchedulerManager:
    """
    asyncio-backed scheduler controller.

    Provides pause/resume/trigger mechanics and tracks basic metadata needed by the
    HTTP control surface. A pluggable job handler enables integration with future
    evaluation pipelines.
    """

    def __init__(
        self,
        implementation: str,
        *,
        interval: timedelta | None = None,
        job_handler: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        self._implementation = implementation
        self._is_running = False
        self._is_paused = False
        self._last_run_at: datetime | None = None
        self._next_run_at: datetime | None = None
        self._consecutive_failures = 0
        self._interval = interval or timedelta(minutes=5)
        self._job_handler = job_handler or self._default_job_handler
        self._loop_task: asyncio.Task[None] | None = None
        self._wake_event = asyncio.Event()
        self._resume_event = asyncio.Event()
        self._run_lock = asyncio.Lock()
        self._logger = logging.getLogger("autotrade.scheduler")
        self._job = SchedulerJobStatus(
            job_id="portfolio-evaluator",
            name="Evaluate active portfolios",
            status="idle",
            last_run_at=None,
            next_run_at=None,
            consecutive_failures=0,
        )

    async def start(self) -> None:
        if self._is_running:
            return
        self._is_running = True
        self._is_paused = False
        self._resume_event.set()
        if self._next_run_at is None:
            self._schedule_next_run()
        if self._loop_task is None or self._loop_task.done():
            self._loop_task = asyncio.create_task(self._run_loop(), name="autotrade-scheduler-loop")

    async def stop(self) -> None:
        self._is_running = False
        self._is_paused = False
        self._wake_event.set()
        self._resume_event.set()
        if self._loop_task and not self._loop_task.done():
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:  # pragma: no cover - expected cancellation
                pass
        self._job.status = "idle"

    async def pause(self) -> None:
        self._is_paused = True
        self._job.status = "paused"

    async def resume(self) -> None:
        self._is_paused = False
        self._job.status = "idle"
        if self._is_running and self._next_run_at is None:
            self._schedule_next_run()
        self._resume_event.set()

    async def trigger_run(self) -> datetime:
        if not self._is_running:
            await self.start()
        now = datetime.now(timezone.utc)
        await self._execute_job(forced_time=now)
        return self._last_run_at or now

    def status(self) -> SchedulerStatus:
        return SchedulerStatus(
            implementation=self._implementation,
            is_running=self._is_running,
            is_paused=self._is_paused,
            last_run_at=self._last_run_at,
            next_run_at=self._next_run_at,
            consecutive_failures=self._consecutive_failures,
            jobs=[self._job],
        )

    async def _run_loop(self) -> None:
        try:
            while self._is_running:
                if self._is_paused:
                    self._job.status = "paused"
                    await self._resume_event.wait()
                    self._resume_event.clear()
                    continue

                now = datetime.now(timezone.utc)
                if self._next_run_at is None or self._next_run_at <= now:
                    self._schedule_next_run()

                wait_seconds = max((self._next_run_at - now).total_seconds(), 0.1)
                try:
                    await asyncio.wait_for(self._wake_event.wait(), timeout=wait_seconds)
                    self._wake_event.clear()
                    continue
                except asyncio.TimeoutError:
                    pass

                await self._execute_job()
        except asyncio.CancelledError:  # pragma: no cover - expected during shutdown
            pass

    async def _execute_job(self, *, forced_time: Optional[datetime] = None) -> None:
        async with self._run_lock:
            if self._is_paused:
                return

            start = forced_time or datetime.now(timezone.utc)
            self._last_run_at = start
            self._job.last_run_at = start
            self._job.status = "running"
            try:
                await self._job_handler()
                self._consecutive_failures = 0
                self._job.consecutive_failures = 0
            except Exception as exc:  # pragma: no cover - failure path
                self._consecutive_failures += 1
                self._job.consecutive_failures = self._consecutive_failures
                self._logger.exception("Scheduler job failed: %s", exc)
            finally:
                if not self._is_paused:
                    self._job.status = "idle"
                self._schedule_next_run(base=start)

    def _schedule_next_run(self, *, base: Optional[datetime] = None) -> None:
        reference = base or datetime.now(timezone.utc)
        self._next_run_at = reference + self._interval
        self._job.next_run_at = self._next_run_at

    async def _default_job_handler(self) -> None:
        from autotrade_service.simulation.broker import SimulatedBroker
        from autotrade_service.simulation import load_state, save_state
        from autotrade_service.config import get_settings
        
        settings = get_settings()
        decision_pipeline = get_decision_pipeline()
        
        # Run the decision pipeline to get LLM decisions
        result = await decision_pipeline.run_once()
        
        if result is None or not result.response.decisions:
            self._logger.info("No decisions generated from pipeline")
            return
        
        # If simulation mode is enabled, execute trades via simulated broker
        if settings.simulation_enabled:
            # Load portfolio from state file
            portfolio = load_state(settings.simulation_state_path)
            if portfolio is None:
                self._logger.error("Failed to load portfolio from state file")
                return
            
            # Create broker with loaded portfolio
            broker = SimulatedBroker(portfolio)
            
            # Collect market snapshots from tool messages (live_market_data / indicator_calculator)
            market_snapshots: dict[str, float] = {}
            for trace_entry in result.agent_trace:
                if trace_entry.get("message_type") != "ToolMessage":
                    continue
                content = trace_entry.get("content") or ""
                if not content:
                    continue
                try:
                    payload = json.loads(content)
                except json.JSONDecodeError:
                    continue

                tool_name = trace_entry.get("tool_name")
                symbol = (payload.get("symbol") or "").upper()
                if not symbol:
                    continue

                price_value: float | None = None
                if tool_name == "live_market_data":
                    price = payload.get("last_price")
                    if isinstance(price, (int, float)):
                        price_value = float(price)
                elif tool_name == "indicator_calculator":
                    price = payload.get("price")
                    if isinstance(price, (int, float)):
                        price_value = float(price)

                if price_value is not None and price_value > 0:
                    market_snapshots[symbol] = price_value

            # Ensure every decision symbol has a positive snapshot
            for decision in result.response.decisions:
                symbol = decision.symbol
                if symbol not in market_snapshots or market_snapshots[symbol] <= 0:
                    fallback = decision.take_profit or decision.stop_loss or decision.quantity or 0.0
                    if isinstance(fallback, (int, float)) and fallback > 0:
                        market_snapshots[symbol] = float(fallback)
                    else:
                        self._logger.warning(
                            "No market price available for %s; trade execution will be skipped",
                            symbol,
                        )
                        # Leave symbol absent so broker skips invalid prices
            
            # Execute the decisions (this will log to evaluation_log)
            messages = broker.execute(
                result.response.decisions,
                market_snapshots,
                system_prompt=SYSTEM_PROMPT,
                user_payload=result.prompt,
            )
            
            for msg in messages:
                self._logger.info(msg)
            
            # Refresh unrealized PnL with latest prices
            broker.mark_to_market(market_snapshots)
            
            # Save the updated portfolio state to disk
            save_state(broker.portfolio, settings.simulation_state_path)
            self._logger.info(f"Saved portfolio state with {len(broker.portfolio.evaluation_log)} evaluations")


_scheduler: SchedulerManager | None = None


def get_scheduler(implementation: str | None = None) -> SchedulerManager:
    global _scheduler
    settings = get_settings()
    interval = timedelta(minutes=settings.decision_interval_minutes)
    impl = implementation or settings.scheduler_impl
    if _scheduler is None:
        _scheduler = SchedulerManager(implementation=impl, interval=interval)
    else:
        if implementation and _scheduler._implementation != implementation:
            _scheduler._implementation = implementation
        if _scheduler._interval != interval:
            _scheduler._interval = interval
    return _scheduler


def reset_scheduler() -> None:
    """Testing hook to reset the shared scheduler instance."""
    global _scheduler
    if _scheduler is not None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(_scheduler.stop())
        else:
            loop.create_task(_scheduler.stop())
    _scheduler = None
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        asyncio.run(shutdown_decision_pipeline())
    else:
        loop.create_task(shutdown_decision_pipeline())


__all__ = ["SchedulerManager", "SchedulerStatus", "SchedulerJobStatus", "get_scheduler", "reset_scheduler"]

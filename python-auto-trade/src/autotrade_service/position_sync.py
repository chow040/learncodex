from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict
from typing import Any, Dict

from .config import Settings, get_settings
from .repositories import fetch_latest_portfolio, get_runtime_mode
from .runtime import RuntimeMode
from .websocket import connection_manager

logger = logging.getLogger("autotrade.position_sync")


def _convert_keys_to_camel(data: Any) -> Any:
    if isinstance(data, dict):
        return {_to_camel_case(k): _convert_keys_to_camel(v) for k, v in data.items()}
    if isinstance(data, list):
        return [_convert_keys_to_camel(item) for item in data]
    return data


def _to_camel_case(snake: str) -> str:
    parts = snake.split("_")
    return parts[0] + "".join(piece.title() for piece in parts[1:])


class PositionSyncService:
    def __init__(self, *, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._interval = self._settings.position_sync_interval_seconds
        self._task: asyncio.Task[None] | None = None
        self._running = False

    async def start(self) -> None:
        if self._task:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop(), name="okx-position-sync")
        logger.info("Position sync service started (interval=%ss)", self._interval)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Position sync service stopped")

    async def _run_loop(self) -> None:
        while self._running:
            try:
                await self.sync_once()
            except asyncio.CancelledError:
                break
            except Exception as exc:  # pragma: no cover - defensive
                logger.exception("Position sync failed: %s", exc)
            await asyncio.sleep(self._interval)

    async def sync_once(self) -> None:
        await refresh_portfolio_snapshot(settings=self._settings, broadcast=True)


async def refresh_portfolio_snapshot(
    *, settings: Settings | None = None, broadcast: bool = True
):
    """Force a portfolio snapshot refresh and optionally broadcast it."""
    settings = settings or get_settings()
    runtime_mode: RuntimeMode = await get_runtime_mode(settings)
    if runtime_mode == "simulator":
        logger.debug("Skipping portfolio sync in simulator mode")
        return None

    snapshot = await fetch_latest_portfolio()
    if snapshot is None:
        logger.warning("Portfolio snapshot unavailable; skipping refresh")
        return None

    if broadcast:
        payload = _convert_keys_to_camel(asdict(snapshot))
        await connection_manager.broadcast_portfolio(payload)
    return snapshot


__all__ = ["PositionSyncService"]

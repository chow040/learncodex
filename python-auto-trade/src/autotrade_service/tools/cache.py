from __future__ import annotations

import asyncio
import math
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict, List


@dataclass(slots=True)
class ToolCacheEntry:
    value: Any
    stored_at: float


@dataclass(slots=True)
class ToolCacheSnapshot:
    key: str
    stored_at: float
    age_seconds: float
    value_type: str


class ToolCache:
    """
    Lightweight per-run cache shared across LangChain tools.

    Entries expire according to the configured TTL (if provided) and the cache
    is reset for every invocation scope to guarantee isolation between runs.
    """

    def __init__(self, ttl_seconds: float | None = None) -> None:
        self._ttl_seconds = ttl_seconds
        self._store: Dict[str, ToolCacheEntry] = {}
        self._run_id: str | None = None
        self._lock = asyncio.Lock()

    @asynccontextmanager
    async def scope(self, run_id: str) -> AsyncIterator["ToolCache"]:
        """
        Context manager that scopes cache usage to a single decision job run.
        """

        async with self._lock:
            self._run_id = run_id
            self._store.clear()

        try:
            yield self
        finally:
            async with self._lock:
                self._store.clear()
                self._run_id = None

    def get(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        if self._is_expired(entry):
            self._store.pop(key, None)
            return None
        return entry.value

    def set(self, key: str, value: Any) -> None:
        self._store[key] = ToolCacheEntry(value=value, stored_at=time.time())

    def clear(self) -> None:
        self._store.clear()

    def snapshot(self) -> List[ToolCacheSnapshot]:
        snapshots: List[ToolCacheSnapshot] = []
        now = time.time()
        for key, entry in self._store.items():
            if self._is_expired(entry):
                continue
            snapshots.append(
                ToolCacheSnapshot(
                    key=key,
                    stored_at=entry.stored_at,
                    age_seconds=now - entry.stored_at,
                    value_type=type(entry.value).__name__,
                )
            )
        return snapshots

    @property
    def run_id(self) -> str | None:
        return self._run_id

    def _is_expired(self, entry: ToolCacheEntry) -> bool:
        if self._ttl_seconds is None or math.isinf(self._ttl_seconds):
            return False
        return (time.time() - entry.stored_at) > self._ttl_seconds


__all__ = ["ToolCache", "ToolCacheEntry", "ToolCacheSnapshot"]

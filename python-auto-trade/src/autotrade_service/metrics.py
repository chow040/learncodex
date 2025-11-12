from __future__ import annotations

from collections import deque
from statistics import mean
from typing import Deque, Dict


class LatencyTracker:
    def __init__(self, maxlen: int = 1000) -> None:
        self._samples: Deque[float] = deque(maxlen=maxlen)

    def record(self, value: float) -> None:
        self._samples.append(value)

    def stats(self) -> Dict[str, float] | None:
        if not self._samples:
            return None
        samples = list(self._samples)
        return {
            "count": float(len(samples)),
            "min_ms": min(samples),
            "max_ms": max(samples),
            "avg_ms": mean(samples),
            "latest_ms": samples[-1],
        }

    def reset(self) -> None:
        self._samples.clear()


_okx_order_latency = LatencyTracker()


def record_okx_order_latency(latency_ms: float) -> None:
    _okx_order_latency.record(latency_ms)


def get_okx_order_latency_stats() -> Dict[str, float] | None:
    return _okx_order_latency.stats()


def reset_okx_order_latency() -> None:  # pragma: no cover - test helper
    _okx_order_latency.reset()

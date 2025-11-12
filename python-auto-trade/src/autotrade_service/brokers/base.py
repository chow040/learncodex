from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Mapping, Sequence

from ..llm.schemas import DecisionPayload


class BaseBroker(ABC):
    """Abstract interface for broker implementations."""

    @abstractmethod
    async def execute(
        self,
        decisions: Sequence[DecisionPayload],
        market_snapshots: Mapping[str, float],
        **kwargs,
    ) -> list[str]:
        """Execute a batch of decisions and return status messages."""

    async def process_pending_feedback(self) -> None:  # pragma: no cover - default no-op
        """Hook for brokers that emit feedback events."""

    async def mark_to_market(self, market_snapshots: Mapping[str, float]) -> None:  # pragma: no cover
        """Hook for brokers that maintain a simulated portfolio."""

    async def close(self) -> None:  # pragma: no cover - default no-op
        """Clean up any network resources (e.g., close exchange sessions)."""

    async def get_portfolio_snapshot(self):  # pragma: no cover - optional
        """Return the broker-managed portfolio representation if available."""
        return None

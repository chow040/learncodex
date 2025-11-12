from __future__ import annotations

from typing import Any

from ..config import Settings, get_settings
from ..providers import OKXClient
from .okx_demo import OKXDemoBroker
from ..runtime import RuntimeMode, mode_to_broker, broker_to_mode


async def build_broker(
    *,
    settings: Settings | None = None,
    portfolio: Any = None,
    outcome_tracker: Any = None,
    runtime_mode: RuntimeMode | None = None,
):
    """Return the appropriate broker implementation based on configuration."""

    settings = settings or get_settings()
    mode = runtime_mode or broker_to_mode(getattr(settings, "trading_broker", None))
    broker_type = mode_to_broker(mode)

    if broker_type == "okx_demo":
        client = await OKXClient.create(settings=settings)
        return OKXDemoBroker(client, settings=settings, outcome_tracker=outcome_tracker)
    if broker_type == "okx_live":
        raise NotImplementedError("Live trading broker is not implemented yet")

    # Default to simulated broker
    from ..simulation.broker import SimulatedBroker

    return SimulatedBroker(
        portfolio=portfolio,
        outcome_tracker=outcome_tracker,
    )

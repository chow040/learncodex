"""Simulation execution package for paper trading."""

from .broker import SimulatedBroker
from .manager import get_market_snapshots_from_cache, simulated_to_snapshot
from .persistence import create_initial_state, load_state, save_state
from .state import ExitPlan, SimulatedPosition, SimulatedPortfolio, TradeLogEntry

__all__ = [
    "SimulatedBroker",
    "SimulatedPosition",
    "SimulatedPortfolio",
    "TradeLogEntry",
    "ExitPlan",
    "load_state",
    "save_state",
    "create_initial_state",
    "simulated_to_snapshot",
    "get_market_snapshots_from_cache",
]

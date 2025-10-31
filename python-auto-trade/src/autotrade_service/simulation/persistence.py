"""Persistence helpers for simulated portfolio state."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

from .state import SimulatedPortfolio

logger = logging.getLogger("autotrade.simulation.persistence")


def load_state(path: str | Path) -> Optional[SimulatedPortfolio]:
    """
    Load simulated portfolio state from a JSON file.
    
    Args:
        path: Path to the JSON state file
        
    Returns:
        SimulatedPortfolio if file exists and is valid, None otherwise
    """
    file_path = Path(path) if isinstance(path, str) else path
    
    if not file_path.exists():
        logger.info(f"State file not found: {file_path}")
        return None
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        portfolio = SimulatedPortfolio.from_dict(data)
        logger.info(
            f"Loaded simulation state for portfolio {portfolio.portfolio_id} "
            f"with {len(portfolio.positions)} positions and {len(portfolio.trade_log)} trades"
        )
        return portfolio
    except Exception as e:
        logger.error(f"Failed to load state from {file_path}: {e}", exc_info=True)
        return None


def save_state(portfolio: SimulatedPortfolio, path: str | Path) -> bool:
    """
    Save simulated portfolio state to a JSON file.
    
    Args:
        portfolio: SimulatedPortfolio instance to save
        path: Path where the JSON state file should be written
        
    Returns:
        True if save was successful, False otherwise
    """
    file_path = Path(path) if isinstance(path, str) else path
    
    try:
        # Ensure parent directory exists
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write to temporary file first, then rename for atomic write
        temp_path = file_path.with_suffix(".tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(portfolio.to_dict(), f, indent=2, ensure_ascii=False)
        
        # Atomic rename
        temp_path.replace(file_path)
        
        logger.debug(
            f"Saved simulation state for portfolio {portfolio.portfolio_id} "
            f"with equity ${portfolio.equity:.2f}"
        )
        return True
    except Exception as e:
        logger.error(f"Failed to save state to {file_path}: {e}", exc_info=True)
        return False


def create_initial_state(
    portfolio_id: str,
    starting_cash: float,
    path: str | Path,
) -> SimulatedPortfolio:
    """
    Create and save a new simulated portfolio with initial cash.
    
    Args:
        portfolio_id: Unique identifier for the portfolio
        starting_cash: Initial cash balance
        path: Path where the state file should be saved
        
    Returns:
        Newly created SimulatedPortfolio instance
    """
    portfolio = SimulatedPortfolio(
        portfolio_id=portfolio_id,
        starting_cash=starting_cash,
        current_cash=starting_cash,
    )
    save_state(portfolio, path)
    logger.info(
        f"Created new simulation portfolio {portfolio_id} "
        f"with ${starting_cash:.2f} starting cash"
    )
    return portfolio

"""Simulation manager to convert simulated state to portfolio snapshot."""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from ..config import get_settings
from ..repositories import (
    AutoTradeDecision,
    AutoTradeDecisionPrompt,
    AutoTradeEvent,
    AutoTradeExitPlan,
    AutoTradePortfolioSnapshot,
    AutoTradePosition,
)
from ..tools.cache import ToolCacheSnapshot
from .state import SimulatedPortfolio

logger = logging.getLogger("autotrade.simulation.manager")


def simulated_to_snapshot(portfolio: SimulatedPortfolio) -> AutoTradePortfolioSnapshot:
    """
    Convert a SimulatedPortfolio to AutoTradePortfolioSnapshot.
    
    This ensures the LLM sees the same schema in simulation mode as in production.
    
    Args:
        portfolio: SimulatedPortfolio instance
        
    Returns:
        AutoTradePortfolioSnapshot compatible with existing prompt builder
    """
    # Convert positions
    positions = [
        AutoTradePosition(
            symbol=pos.symbol,
            quantity=pos.quantity,
            entry_price=pos.entry_price,
            mark_price=pos.current_price,
            pnl=pos.unrealized_pnl,
            pnl_pct=pos.unrealized_pnl_pct,
            leverage=pos.leverage,
            confidence=pos.confidence,
            exit_plan=AutoTradeExitPlan(
                profit_target=pos.exit_plan.take_profit or pos.current_price,
                stop_loss=pos.exit_plan.stop_loss or pos.current_price,
                invalidation=pos.exit_plan.invalidation_condition or "",
            ),
        )
        for pos in portfolio.positions.values()
    ]
    
    # Convert evaluation log to decisions (most recent evaluations - including HOLD)
    decisions = [
        AutoTradeDecision(
            id=f"sim-{eval_entry.timestamp.isoformat()}-{eval_entry.symbol}",
            symbol=eval_entry.symbol,
            action=eval_entry.action.lower(),  # buy, sell, hold
            size_pct=eval_entry.size_pct,
            confidence=eval_entry.confidence,
            rationale=eval_entry.rationale,
            created_at=eval_entry.timestamp.isoformat(),
            prompt=AutoTradeDecisionPrompt(
                system_prompt=eval_entry.system_prompt,
                user_payload=eval_entry.user_payload,
                chain_of_thought=eval_entry.chain_of_thought,  # Full LLM reasoning
                invalidations=[],
                observation_window="PT5M",
            ),
        )
        for eval_entry in portfolio.evaluation_log[-30:]  # Last 30 evaluations
    ]
    
    # Convert trade log to events
    events = [
        AutoTradeEvent(
            id=f"trade-{trade.timestamp.isoformat()}",
            label=f"{trade.action} {trade.symbol} @ ${trade.price:.2f}",
            timestamp=trade.timestamp.isoformat(),
        )
        for trade in portfolio.trade_log[-20:]  # Last 20 trades
    ]
    
    return AutoTradePortfolioSnapshot(
        portfolio_id=portfolio.portfolio_id,
        automation_enabled=True,
        mode="Paper Trading (Simulation)",
        available_cash=portfolio.current_cash,
        equity=portfolio.equity,
        total_pnl=portfolio.total_pnl,
        pnl_pct=portfolio.total_pnl_pct,
        sharpe=0.0,  # TODO: Calculate Sharpe ratio from trade history
        drawdown_pct=0.0,  # TODO: Track max drawdown
        last_run_at=portfolio.updated_at.isoformat(),
        next_run_in_minutes=get_settings().decision_interval_minutes,
        positions=positions,
        decisions=decisions,
        events=events,
    )


def get_market_snapshots_from_cache(tool_cache_snapshot: List[ToolCacheSnapshot]) -> Dict[str, float]:
    """
    Extract current prices from tool cache snapshots.
    
    Args:
        tool_cache_snapshot: List of ToolCacheSnapshot from decision pipeline
        
    Returns:
        Dict mapping symbol to current mid-price
    """
    market_snapshots: Dict[str, float] = {}
    
    # For now, return empty dict - will need to be enhanced based on actual tool output format
    # The ToolCacheSnapshot has key, stored_at, age_seconds, and value_type fields
    # We need to access the actual cached values which aren't in the snapshot
    
    logger.debug(f"Processing {len(tool_cache_snapshot)} cache entries")
    
    # This is a simplified version - in production you'd parse the actual tool results
    # from the decision pipeline result
    
    return market_snapshots

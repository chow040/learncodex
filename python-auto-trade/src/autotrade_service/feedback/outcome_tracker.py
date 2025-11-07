"""
Trade Outcome Tracker - Monitors open positions and captures outcomes.

This module tracks position entries and exits, calculates PnL, and triggers
the feedback loop when trades close.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

logger = logging.getLogger(__name__)


@dataclass
class OpenPosition:
    """Tracks an open position waiting for outcome."""
    decision_id: UUID | None
    symbol: str
    action: str
    entry_price: float
    quantity: float
    entry_timestamp: datetime
    rationale: str
    rule_ids: list[UUID]
    portfolio_id: UUID | None = None


class TradeOutcomeTracker:
    """
    Tracks open positions and captures outcomes when they close.
    
    Monitors:
    - Position entries from decisions
    - Position exits (stop loss, take profit, manual close)
    - Calculates PnL and duration
    - Triggers feedback loop for self-improvement
    
    Example usage:
        tracker = TradeOutcomeTracker(feedback_engine)
        
        # When position opens
        await tracker.register_position_entry(
            decision_id=uuid4(),
            symbol="BTCUSDT",
            action="BUY",
            entry_price=50000.0,
            quantity=0.1,
            rationale="Strong momentum",
            rule_ids=[rule1_id, rule2_id],
        )
        
        # When position closes
        await tracker.register_position_exit(
            symbol="BTCUSDT",
            exit_price=52000.0,
            exit_action="CLOSE",
            exit_reason="Take profit hit",
        )
    """
    
    def __init__(self, feedback_engine):
        """
        Initialize trade outcome tracker.
        
        Args:
            feedback_engine: FeedbackLoopEngine instance for processing outcomes
        """
        self.feedback_engine = feedback_engine
        self._open_positions: dict[str, OpenPosition] = {}
        self._logger = logging.getLogger("autotrade.feedback.tracker")
    
    def register_position_entry(
        self,
        decision_id: UUID | None,
        symbol: str,
        action: str,
        entry_price: float,
        quantity: float,
        rationale: str,
        rule_ids: list[UUID],
        portfolio_id: UUID | None = None,
    ):
        """
        Register new position from decision (synchronous).
        
        Args:
            decision_id: UUID of the decision that opened this position
            symbol: Trading symbol
            action: BUY or SELL
            entry_price: Entry price
            quantity: Position size
            rationale: Decision rationale
            rule_ids: List of rule UUIDs that were applied
            portfolio_id: Optional portfolio identifier
        """
        self._open_positions[symbol] = OpenPosition(
            decision_id=decision_id,
            symbol=symbol,
            action=action,
            entry_price=entry_price,
            quantity=quantity,
            entry_timestamp=datetime.now(timezone.utc),
            rationale=rationale,
            rule_ids=rule_ids,
            portfolio_id=portfolio_id,
        )
        self._logger.info(f"Registered position entry: {symbol} {action} @ ${entry_price:.2f}")
    
    async def register_position_exit(
        self,
        symbol: str,
        exit_price: float,
        exit_action: str,
        exit_reason: str = "Manual close",
    ):
        """
        Register position exit and trigger feedback loop.
        
        Calculates PnL, saves trade outcome, and triggers critique/rule generation.
        
        Args:
            symbol: Trading symbol
            exit_price: Exit price
            exit_action: CLOSE, SELL, etc.
            exit_reason: Reason for exit (stop loss, take profit, manual)
        """
        if symbol not in self._open_positions:
            self._logger.warning(f"Position exit for untracked symbol: {symbol}")
            return  # Position not tracked
        
        position = self._open_positions.pop(symbol)
        exit_time = datetime.now(timezone.utc)
        
        # Calculate PnL
        if position.action == "BUY":
            pnl_pct = ((exit_price - position.entry_price) / position.entry_price) * 100
        else:  # SELL (short)
            pnl_pct = ((position.entry_price - exit_price) / position.entry_price) * 100
        
        pnl_usd = (pnl_pct / 100) * position.quantity * position.entry_price
        duration_seconds = int((exit_time - position.entry_timestamp).total_seconds())
        
        self._logger.info(
            f"Position closed: {symbol} {position.action} → {exit_action} | "
            f"PnL: {pnl_pct:+.2f}% (${pnl_usd:+.2f}) | Duration: {duration_seconds}s"
        )
        
        # Save outcome to database (optional - may be None in simulation mode)
        outcome_id: UUID | None = None
        try:
            from ..repositories import save_trade_outcome
            
            outcome_id = await save_trade_outcome(
                decision_id=position.decision_id,
                symbol=symbol,
                action=position.action,
                entry_price=position.entry_price,
                exit_price=exit_price,
                quantity=position.quantity,
                pnl_usd=pnl_usd,
                pnl_pct=pnl_pct,
                entry_timestamp=position.entry_timestamp,
                exit_timestamp=exit_time,
                duration_seconds=duration_seconds,
                rationale=position.rationale,
                rule_ids=position.rule_ids,
                portfolio_id=position.portfolio_id,
            )
            
            if outcome_id:
                self._logger.info(f"Trade outcome saved to database: {outcome_id}")
            else:
                self._logger.info("Trade outcome not saved (database unavailable - simulation mode?)")
                
        except Exception as e:
            self._logger.warning(f"Failed to save trade outcome to database: {e}")
        
        # Trigger feedback loop even if outcome wasn't saved
        # (engine can generate rules without persistence in simulation mode)
        try:
            from .feedback_engine import TradeOutcome
            
            outcome = TradeOutcome(
                id=outcome_id,  # May be None in simulation mode
                symbol=symbol,
                action=position.action,
                entry_price=position.entry_price,
                exit_price=exit_price,
                pnl_pct=pnl_pct,
                pnl_usd=pnl_usd,
                rationale=position.rationale,
                rule_ids=position.rule_ids,
                duration_seconds=duration_seconds,
            )
            
            # Process through feedback loop (critique + rule generation)
            new_rule = await self.feedback_engine.process_closed_trade(outcome)
            
            if new_rule:
                self._logger.info(f"✓ Feedback loop generated new rule: {new_rule.rule_text}")
            else:
                self._logger.debug("Feedback loop did not generate a new rule")
                
        except Exception as e:
            self._logger.error(f"Error processing trade outcome: {e}", exc_info=True)
    
    def has_open_position(self, symbol: str) -> bool:
        """Check if symbol has an open tracked position."""
        return symbol in self._open_positions
    
    def get_open_position(self, symbol: str) -> OpenPosition | None:
        """Get open position details for symbol."""
        return self._open_positions.get(symbol)
    
    def get_all_open_positions(self) -> list[OpenPosition]:
        """Get all open positions."""
        return list(self._open_positions.values())
    
    def clear_all_positions(self):
        """Clear all tracked positions (use with caution)."""
        self._open_positions.clear()
        self._logger.warning("Cleared all tracked positions")

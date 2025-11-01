"""Simulated broker for executing trades and managing positions."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Dict, List

from ..llm.schemas import DecisionAction, DecisionPayload
from .state import EvaluationLogEntry, ExitPlan, SimulatedPortfolio, SimulatedPosition, TradeLogEntry

logger = logging.getLogger("autotrade.simulation.broker")


class SimulatedBroker:
    """
    Simulated broker that processes trading decisions without real exchange interaction.
    
    Handles:
    - BUY/SELL: Create new positions or adjust existing ones
    - CLOSE: Close positions and realize PnL
    - HOLD: Update confidence and exit plans
    - Stop-loss, take-profit, and invalidation triggers
    """
    
    def __init__(
        self,
        portfolio: SimulatedPortfolio,
        max_slippage_bps: int = 5,
        position_size_limit_pct: float = 50.0,
    ):
        """
        Initialize simulated broker.
        
        Args:
            portfolio: SimulatedPortfolio instance to manage
            max_slippage_bps: Maximum allowed slippage in basis points
            position_size_limit_pct: Maximum position size as % of equity
        """
        self.portfolio = portfolio
        self.max_slippage_bps = max_slippage_bps
        self.position_size_limit_pct = position_size_limit_pct
    
    def execute(
        self,
        decisions: List[DecisionPayload],
        market_snapshots: Dict[str, float],
        *,
        system_prompt: str = "",
        user_payload: str = "",
    ) -> List[str]:
        """
        Execute a batch of trading decisions.
        
        Args:
            decisions: List of DecisionPayload from LLM
            market_snapshots: Dict mapping symbol to current mid-price
            
        Returns:
            List of execution messages/warnings
        """
        messages: List[str] = []
        timestamp = datetime.utcnow()
        
        for decision in decisions:
            symbol = decision.symbol
            action = decision.action
            
            # Get current price
            if symbol not in market_snapshots:
                msg = f"No market data for {symbol}; skipping decision"
                logger.warning(msg)
                messages.append(msg)
                continue
            
            current_price = market_snapshots[symbol]
            if current_price is None or current_price <= 0:
                msg = f"Invalid market price ({current_price}) for {symbol}; skipping decision"
                logger.warning(msg)
                messages.append(msg)
                continue
            
            # Log all LLM evaluations (including HOLD) to evaluation_log
            self.portfolio.evaluation_log.append(
                EvaluationLogEntry(
                    timestamp=timestamp,
                    symbol=symbol,
                    action=action.value.upper(),  # BUY, SELL, HOLD, CLOSE
                    confidence=decision.confidence or 0.0,
                    size_pct=decision.size_pct or 0.0,
                    rationale=decision.rationale or "",
                    price=current_price,
                    executed=False,  # Will be set to True if trade is executed
                    chain_of_thought=decision.chain_of_thought or "",  # Full LLM reasoning
                    system_prompt=system_prompt,
                    user_payload=user_payload,
                )
            )
            
            # Apply slippage
            slippage_factor = self.max_slippage_bps / 10000.0
            if action == DecisionAction.BUY:
                fill_price = current_price * (1 + slippage_factor)
            elif action == DecisionAction.SELL:
                fill_price = current_price * (1 - slippage_factor)
            else:
                fill_price = current_price
            
            try:
                if action == DecisionAction.BUY:
                    msg = self._execute_buy(decision, fill_price, timestamp)
                    self._mark_evaluation_executed(symbol, timestamp)
                elif action == DecisionAction.SELL:
                    msg = self._execute_sell(decision, fill_price, timestamp)
                    self._mark_evaluation_executed(symbol, timestamp)
                elif action == DecisionAction.CLOSE:
                    msg = self._execute_close(symbol, fill_price, timestamp)
                    self._mark_evaluation_executed(symbol, timestamp)
                elif action == DecisionAction.HOLD:
                    msg = self._execute_hold(decision, current_price)
                else:
                    msg = f"Unknown action {action} for {symbol}"
                    logger.warning(msg)
                
                messages.append(msg)
            except Exception as e:
                msg = f"Error executing {action} for {symbol}: {e}"
                logger.error(msg, exc_info=True)
                messages.append(msg)
        
        self.portfolio.updated_at = timestamp
        return messages
    
    def _mark_evaluation_executed(self, symbol: str, timestamp: datetime) -> None:
        """Mark the most recent evaluation for this symbol as executed."""
        # Find the most recent evaluation entry for this symbol and mark it as executed
        for entry in reversed(self.portfolio.evaluation_log):
            if entry.symbol == symbol and entry.timestamp == timestamp:
                entry.executed = True
                break
    
    def _execute_buy(
        self,
        decision: DecisionPayload,
        fill_price: float,
        timestamp: datetime,
    ) -> str:
        """Execute a BUY decision."""
        symbol = decision.symbol
        
        # Calculate position size
        if decision.size_pct is not None:
            position_value = self.portfolio.equity * (decision.size_pct / 100.0)
        elif decision.quantity is not None:
            position_value = decision.quantity * fill_price
        else:
            # Default to 10% of equity
            position_value = self.portfolio.equity * 0.10
        
        # Apply position size limit
        max_position_value = self.portfolio.equity * (self.position_size_limit_pct / 100.0)
        if position_value > max_position_value:
            position_value = max_position_value
        
        if fill_price <= 0:
            raise ValueError(f"Invalid fill price ({fill_price}) for BUY {symbol}")
        
        quantity = position_value / fill_price
        cost = quantity * fill_price
        if quantity <= 0 or cost <= 0:
            return (
                f"Computed non-positive trade size for BUY {symbol} "
                f"(quantity={quantity}, cost={cost}); skipping execution"
            )
        
        # Check if we have enough cash
        if cost > self.portfolio.current_cash:
            return f"Insufficient cash for BUY {symbol}: need ${cost:.2f}, have ${self.portfolio.current_cash:.2f}"
        
        # Deduct cash
        self.portfolio.current_cash -= cost
        
        # Create or update position
        if symbol in self.portfolio.positions:
            # Average up/down
            existing_pos = self.portfolio.positions[symbol]
            total_quantity = existing_pos.quantity + quantity
            avg_price = (
                (existing_pos.quantity * existing_pos.entry_price + quantity * fill_price)
                / total_quantity
            )
            existing_pos.quantity = total_quantity
            existing_pos.entry_price = avg_price
            existing_pos.current_price = fill_price
            existing_pos.confidence = decision.confidence or existing_pos.confidence
            
            # Update exit plan
            existing_pos.exit_plan = self._build_exit_plan(decision, fill_price)
            
            action_desc = "averaged"
        else:
            # New position
            exit_plan = self._build_exit_plan(decision, fill_price)
            self.portfolio.positions[symbol] = SimulatedPosition(
                symbol=symbol,
                quantity=quantity,
                entry_price=fill_price,
                entry_timestamp=timestamp,
                current_price=fill_price,
                confidence=decision.confidence or 0.0,
                leverage=1.0,
                exit_plan=exit_plan,
            )
            action_desc = "opened"
        
        # Log trade
        self.portfolio.trade_log.append(
            TradeLogEntry(
                timestamp=timestamp,
                symbol=symbol,
                action="BUY",
                price=fill_price,
                quantity=quantity,
                realized_pnl=0.0,
                reason=decision.rationale or "",
            )
        )
        
        return (
            f"BUY {action_desc} {symbol}: {quantity:.4f} @ ${fill_price:.2f} "
            f"(cost: ${cost:.2f}, cash remaining: ${self.portfolio.current_cash:.2f})"
        )
    
    def _execute_sell(
        self,
        decision: DecisionPayload,
        fill_price: float,
        timestamp: datetime,
    ) -> str:
        """Execute a SELL decision (short selling not yet supported)."""
        # For now, treat SELL as CLOSE if position exists
        symbol = decision.symbol
        if symbol in self.portfolio.positions:
            return self._execute_close(symbol, fill_price, timestamp, reason=decision.rationale)
        else:
            return f"SELL ignored for {symbol}: no existing position (short selling not supported)"
    
    def _execute_close(
        self,
        symbol: str,
        fill_price: float,
        timestamp: datetime,
        reason: str | None = None,
    ) -> str:
        """Execute a CLOSE decision."""
        if symbol not in self.portfolio.positions:
            return f"CLOSE ignored for {symbol}: no position to close"
        
        position = self.portfolio.positions.pop(symbol)
        proceeds = position.quantity * fill_price
        realized_pnl = position.quantity * (fill_price - position.entry_price)
        
        # Add proceeds to cash
        self.portfolio.current_cash += proceeds
        
        # Log trade
        self.portfolio.trade_log.append(
            TradeLogEntry(
                timestamp=timestamp,
                symbol=symbol,
                action="CLOSE",
                price=fill_price,
                quantity=position.quantity,
                realized_pnl=realized_pnl,
                reason=reason or "",
            )
        )
        
        return (
            f"CLOSE {symbol}: {position.quantity:.4f} @ ${fill_price:.2f} "
            f"(proceeds: ${proceeds:.2f}, realized PnL: ${realized_pnl:.2f}, "
            f"cash: ${self.portfolio.current_cash:.2f})"
        )
    
    def _execute_hold(self, decision: DecisionPayload, current_price: float) -> str:
        """Execute a HOLD decision (update exit plans and confidence)."""
        symbol = decision.symbol
        
        if symbol not in self.portfolio.positions:
            return f"HOLD ignored for {symbol}: no position"
        
        position = self.portfolio.positions[symbol]
        position.current_price = current_price
        
        if decision.confidence is not None:
            position.confidence = decision.confidence
        
        # Update exit plan if provided
        if decision.stop_loss or decision.take_profit or decision.invalidation_condition:
            position.exit_plan = self._build_exit_plan(decision, current_price)
        
        return (
            f"HOLD {symbol}: price ${current_price:.2f}, "
            f"unrealized PnL: ${position.unrealized_pnl:.2f} ({position.unrealized_pnl_pct:.2f}%)"
        )
    
    def _build_exit_plan(self, decision: DecisionPayload, current_price: float) -> ExitPlan:
        """Build ExitPlan from decision payload."""
        return ExitPlan(
            stop_loss=decision.stop_loss,
            take_profit=decision.take_profit,
            invalidation_condition=decision.invalidation_condition,
        )
    
    def mark_to_market(self, market_snapshots: Dict[str, float]) -> None:
        """
        Update current prices for all positions and check exit triggers.
        
        Args:
            market_snapshots: Dict mapping symbol to current mid-price
        """
        timestamp = datetime.utcnow()
        
        # Update position prices
        for symbol, position in list(self.portfolio.positions.items()):
            if symbol in market_snapshots:
                current_price = market_snapshots[symbol]
                position.current_price = current_price
                
                # Check exit triggers
                self._check_exit_triggers(symbol, position, current_price, timestamp)
        
        self.portfolio.updated_at = timestamp
    
    def _check_exit_triggers(
        self,
        symbol: str,
        position: SimulatedPosition,
        current_price: float,
        timestamp: datetime,
    ) -> None:
        """Check if stop-loss, take-profit, or invalidation conditions are met."""
        exit_plan = position.exit_plan
        
        # Check stop-loss
        if exit_plan.stop_loss is not None:
            if current_price <= exit_plan.stop_loss:
                logger.info(f"Stop-loss triggered for {symbol} at ${current_price:.2f}")
                self._execute_close(
                    symbol,
                    current_price,
                    timestamp,
                    reason=f"Stop-loss triggered at ${current_price:.2f}",
                )
                return
        
        # Check take-profit
        if exit_plan.take_profit is not None:
            if current_price >= exit_plan.take_profit:
                logger.info(f"Take-profit triggered for {symbol} at ${current_price:.2f}")
                self._execute_close(
                    symbol,
                    current_price,
                    timestamp,
                    reason=f"Take-profit triggered at ${current_price:.2f}",
                )
                return
        
        # Check invalidation condition
        if exit_plan.invalidation_condition:
            if self._evaluate_invalidation(exit_plan.invalidation_condition, symbol, current_price):
                logger.info(f"Invalidation triggered for {symbol}: {exit_plan.invalidation_condition}")
                self._execute_close(
                    symbol,
                    current_price,
                    timestamp,
                    reason=f"Invalidation: {exit_plan.invalidation_condition}",
                )
                return
    
    def _evaluate_invalidation(
        self,
        condition: str,
        symbol: str,
        current_price: float,
    ) -> bool:
        """
        Attempt to parse and evaluate simple invalidation conditions.
        
        Examples:
        - "close below 4000"
        - "price drops below 3900"
        
        Returns True if condition is met, False otherwise or if condition cannot be parsed.
        """
        try:
            # Simple regex patterns for common conditions
            # Pattern: "close/price below/under X"
            below_match = re.search(r"(close|price)\s+(below|under)\s+(\d+(?:\.\d+)?)", condition, re.IGNORECASE)
            if below_match:
                threshold = float(below_match.group(3))
                if current_price < threshold:
                    return True
            
            # Pattern: "close/price above/over X"
            above_match = re.search(r"(close|price)\s+(above|over)\s+(\d+(?:\.\d+)?)", condition, re.IGNORECASE)
            if above_match:
                threshold = float(above_match.group(3))
                if current_price > threshold:
                    return True
            
            # If we can't parse it, log and return False
            logger.debug(f"Could not parse invalidation condition for {symbol}: {condition}")
            return False
        except Exception as e:
            logger.warning(f"Error evaluating invalidation condition '{condition}': {e}")
            return False

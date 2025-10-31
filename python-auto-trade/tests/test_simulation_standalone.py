"""Standalone unit tests for simulation broker and state management (no external dependencies)."""

from datetime import datetime

import pytest


# Import only what we need directly
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from autotrade_service.simulation.state import (
    SimulatedPortfolio,
    SimulatedPosition,
    ExitPlan,
    TradeLogEntry,
)
from autotrade_service.simulation.broker import SimulatedBroker

# Mock DecisionPayload to avoid importing LLM dependencies
from dataclasses import dataclass
from typing import Optional

@dataclass
class MockDecisionPayload:
    symbol: str
    action: str
    size_pct: Optional[float] = None
    quantity: Optional[float] = None
    confidence: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    invalidation_condition: Optional[str] = None
    rationale: Optional[str] = None


@pytest.fixture
def portfolio():
    """Create a test portfolio with initial cash."""
    return SimulatedPortfolio(
        portfolio_id="test",
        starting_cash=10000.0,
        current_cash=10000.0,
    )


@pytest.fixture
def broker(portfolio):
    """Create a test broker."""
    return SimulatedBroker(
        portfolio=portfolio,
        max_slippage_bps=5,
        position_size_limit_pct=50.0,
    )


def test_portfolio_initial_state(portfolio):
    """Test initial portfolio state."""
    assert portfolio.current_cash == 10000.0
    assert portfolio.equity == 10000.0
    assert len(portfolio.positions) == 0
    assert len(portfolio.trade_log) == 0
    assert portfolio.total_pnl == 0.0


def test_execute_buy(broker):
    """Test executing a BUY decision."""
    decision = MockDecisionPayload(
        symbol="BTCUSDT",
        action="BUY",
        size_pct=10.0,
        confidence=0.8,
        stop_loss=45000.0,
        take_profit=55000.0,
    )
    
    market_snapshots = {"BTCUSDT": 50000.0}
    messages = broker.execute([decision], market_snapshots)
    
    assert len(messages) == 1
    assert "BUY" in messages[0]
    assert "BTCUSDT" in messages[0]
    
    # Check portfolio state
    assert len(broker.portfolio.positions) == 1
    assert "BTCUSDT" in broker.portfolio.positions
    
    pos = broker.portfolio.positions["BTCUSDT"]
    assert pos.quantity > 0
    assert pos.entry_price > 0
    assert pos.exit_plan.stop_loss == 45000.0
    assert pos.exit_plan.take_profit == 55000.0
    
    # Check cash was deducted
    assert broker.portfolio.current_cash < 10000.0
    
    # Check trade log
    assert len(broker.portfolio.trade_log) == 1
    trade = broker.portfolio.trade_log[0]
    assert trade.action == "BUY"
    assert trade.symbol == "BTCUSDT"


def test_execute_close(broker):
    """Test executing a CLOSE decision."""
    # First, open a position
    buy_decision = MockDecisionPayload(
        symbol="BTCUSDT",
        action="BUY",
        size_pct=20.0,
    )
    broker.execute([buy_decision], {"BTCUSDT": 50000.0})
    
    initial_cash = broker.portfolio.current_cash
    
    # Now close it at a higher price
    close_decision = MockDecisionPayload(
        symbol="BTCUSDT",
        action="CLOSE",
    )
    messages = broker.execute([close_decision], {"BTCUSDT": 52000.0})
    
    assert len(messages) == 1
    assert "CLOSE" in messages[0]
    
    # Position should be closed
    assert "BTCUSDT" not in broker.portfolio.positions
    
    # Cash should have increased (profitable trade)
    assert broker.portfolio.current_cash > initial_cash
    
    # Trade log should have 2 entries
    assert len(broker.portfolio.trade_log) == 2
    close_trade = broker.portfolio.trade_log[-1]
    assert close_trade.action == "CLOSE"
    assert close_trade.realized_pnl > 0


def test_stop_loss_trigger(broker):
    """Test that stop-loss automatically closes position."""
    decision = MockDecisionPayload(
        symbol="BTCUSDT",
        action="BUY",
        size_pct=10.0,
        stop_loss=48000.0,
    )
    broker.execute([decision], {"BTCUSDT": 50000.0})
    
    assert "BTCUSDT" in broker.portfolio.positions
    
    # Mark to market below stop-loss
    broker.mark_to_market({"BTCUSDT": 47000.0})
    
    # Position should be closed
    assert "BTCUSDT" not in broker.portfolio.positions
    
    # Should have a CLOSE trade
    close_trade = broker.portfolio.trade_log[-1]
    assert close_trade.action == "CLOSE"
    assert "Stop-loss" in close_trade.reason


def test_take_profit_trigger(broker):
    """Test that take-profit automatically closes position."""
    decision = MockDecisionPayload(
        symbol="BTCUSDT",
        action="BUY",
        size_pct=10.0,
        take_profit=55000.0,
    )
    broker.execute([decision], {"BTCUSDT": 50000.0})
    
    # Mark to market above take-profit
    broker.mark_to_market({"BTCUSDT": 56000.0})
    
    # Position should be closed
    assert "BTCUSDT" not in broker.portfolio.positions
    
    close_trade = broker.portfolio.trade_log[-1]
    assert close_trade.action == "CLOSE"
    assert "Take-profit" in close_trade.reason
    assert close_trade.realized_pnl > 0


def test_portfolio_serialization(portfolio):
    """Test portfolio serialization and deserialization."""
    # Add a position
    portfolio.positions["BTCUSDT"] = SimulatedPosition(
        symbol="BTCUSDT",
        quantity=1.0,
        entry_price=50000.0,
        entry_timestamp=datetime.utcnow(),
        current_price=51000.0,
        confidence=0.8,
        leverage=1.0,
        exit_plan=ExitPlan(
            stop_loss=48000.0,
            take_profit=55000.0,
            invalidation_condition="close below 45000",
        ),
    )
    
    # Serialize
    data = portfolio.to_dict()
    
    # Deserialize
    restored = SimulatedPortfolio.from_dict(data)
    
    assert restored.portfolio_id == portfolio.portfolio_id
    assert restored.current_cash == portfolio.current_cash
    assert len(restored.positions) == 1
    assert "BTCUSDT" in restored.positions
    
    pos = restored.positions["BTCUSDT"]
    assert pos.symbol == "BTCUSDT"
    assert pos.quantity == 1.0
    assert pos.entry_price == 50000.0
    assert pos.exit_plan.stop_loss == 48000.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

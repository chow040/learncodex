"""Unit tests for simulation broker and state management."""

from datetime import datetime

import pytest

from autotrade_service.llm.schemas import DecisionAction, DecisionPayload
from autotrade_service.simulation import SimulatedBroker, SimulatedPortfolio


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
    decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.BUY,
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


def test_execute_buy_with_slippage(broker):
    """Test that slippage is applied to buy orders."""
    decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.BUY,
        size_pct=10.0,
    )
    
    market_snapshots = {"BTCUSDT": 50000.0}
    broker.execute([decision], market_snapshots)
    
    pos = broker.portfolio.positions["BTCUSDT"]
    # With 5 bps slippage, entry price should be ~50025 (50000 * 1.0005)
    assert pos.entry_price > 50000.0
    assert pos.entry_price < 50100.0


def test_execute_close(broker):
    """Test executing a CLOSE decision."""
    # First, open a position
    buy_decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.BUY,
        size_pct=20.0,
    )
    broker.execute([buy_decision], {"BTCUSDT": 50000.0})
    
    initial_cash = broker.portfolio.current_cash
    position_qty = broker.portfolio.positions["BTCUSDT"].quantity
    
    # Now close it at a higher price
    close_decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.CLOSE,
    )
    messages = broker.execute([close_decision], {"BTCUSDT": 52000.0})
    
    assert len(messages) == 1
    assert "CLOSE" in messages[0]
    assert "BTCUSDT" in messages[0]
    
    # Position should be closed
    assert "BTCUSDT" not in broker.portfolio.positions
    
    # Cash should have increased (profitable trade)
    assert broker.portfolio.current_cash > initial_cash
    
    # Trade log should have 2 entries (BUY + CLOSE)
    assert len(broker.portfolio.trade_log) == 2
    close_trade = broker.portfolio.trade_log[-1]
    assert close_trade.action == "CLOSE"
    assert close_trade.realized_pnl > 0  # Profitable


def test_execute_hold(broker):
    """Test executing a HOLD decision."""
    # First, open a position
    buy_decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.BUY,
        size_pct=10.0,
    )
    broker.execute([buy_decision], {"BTCUSDT": 50000.0})
    
    # Update with HOLD
    hold_decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.HOLD,
        confidence=0.9,
        stop_loss=48000.0,
    )
    messages = broker.execute([hold_decision], {"BTCUSDT": 51000.0})
    
    assert len(messages) == 1
    assert "HOLD" in messages[0]
    
    pos = broker.portfolio.positions["BTCUSDT"]
    assert pos.current_price == 51000.0
    assert pos.confidence == 0.9
    assert pos.exit_plan.stop_loss == 48000.0


def test_insufficient_cash(broker):
    """Test that orders are rejected when insufficient cash."""
    decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.BUY,
        size_pct=150.0,  # More than available
    )
    
    messages = broker.execute([decision], {"BTCUSDT": 50000.0})
    
    assert len(messages) == 1
    assert "Insufficient cash" in messages[0]
    assert len(broker.portfolio.positions) == 0


def test_mark_to_market(broker):
    """Test mark-to-market updates position prices."""
    # Open a position
    decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.BUY,
        size_pct=20.0,
    )
    broker.execute([decision], {"BTCUSDT": 50000.0})
    
    # Mark to market at new price
    broker.mark_to_market({"BTCUSDT": 55000.0})
    
    pos = broker.portfolio.positions["BTCUSDT"]
    assert pos.current_price == 55000.0
    assert pos.unrealized_pnl > 0  # Profitable


def test_stop_loss_trigger(broker):
    """Test that stop-loss automatically closes position."""
    # Open a position with stop-loss
    decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.BUY,
        size_pct=10.0,
        stop_loss=48000.0,
    )
    broker.execute([decision], {"BTCUSDT": 50000.0})
    
    assert "BTCUSDT" in broker.portfolio.positions
    
    # Mark to market below stop-loss
    broker.mark_to_market({"BTCUSDT": 47000.0})
    
    # Position should be closed
    assert "BTCUSDT" not in broker.portfolio.positions
    
    # Should have a CLOSE trade with realized loss
    close_trade = broker.portfolio.trade_log[-1]
    assert close_trade.action == "CLOSE"
    assert "Stop-loss" in close_trade.reason


def test_take_profit_trigger(broker):
    """Test that take-profit automatically closes position."""
    # Open a position with take-profit
    decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.BUY,
        size_pct=10.0,
        take_profit=55000.0,
    )
    broker.execute([decision], {"BTCUSDT": 50000.0})
    
    # Mark to market above take-profit
    broker.mark_to_market({"BTCUSDT": 56000.0})
    
    # Position should be closed
    assert "BTCUSDT" not in broker.portfolio.positions
    
    # Should have a CLOSE trade with realized profit
    close_trade = broker.portfolio.trade_log[-1]
    assert close_trade.action == "CLOSE"
    assert "Take-profit" in close_trade.reason
    assert close_trade.realized_pnl > 0


def test_invalidation_condition_below(broker):
    """Test invalidation condition parsing (price below)."""
    decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.BUY,
        size_pct=10.0,
        invalidation_condition="close below 45000",
    )
    broker.execute([decision], {"BTCUSDT": 50000.0})
    
    # Mark to market below invalidation
    broker.mark_to_market({"BTCUSDT": 44000.0})
    
    # Position should be closed
    assert "BTCUSDT" not in broker.portfolio.positions
    
    close_trade = broker.portfolio.trade_log[-1]
    assert "Invalidation" in close_trade.reason


def test_portfolio_equity_calculation(portfolio):
    """Test portfolio equity calculation with positions."""
    from autotrade_service.simulation import SimulatedPosition, ExitPlan
    
    # Add a position
    portfolio.positions["BTCUSDT"] = SimulatedPosition(
        symbol="BTCUSDT",
        quantity=0.5,
        entry_price=50000.0,
        entry_timestamp=datetime.utcnow(),
        current_price=52000.0,
        exit_plan=ExitPlan(),
    )
    
    # Deduct cash used
    portfolio.current_cash = 7500.0  # 10000 - 2500
    
    # Equity should be cash + position value
    # Position value = 0.5 * 52000 = 26000
    expected_equity = 7500.0 + 26000.0
    assert portfolio.equity == expected_equity
    
    # Unrealized PnL = 0.5 * (52000 - 50000) = 1000
    assert portfolio.total_unrealized_pnl == 1000.0


def test_portfolio_serialization(portfolio):
    """Test portfolio serialization and deserialization."""
    from autotrade_service.simulation import SimulatedPosition, ExitPlan
    
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
    from autotrade_service.simulation import SimulatedPortfolio
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

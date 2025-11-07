"""Test integration between SimulatedBroker and TradeOutcomeTracker."""

import pytest
from datetime import datetime
from uuid import uuid4

from autotrade_service.simulation.broker import SimulatedBroker
from autotrade_service.simulation.state import SimulatedPortfolio
from autotrade_service.llm.schemas import DecisionPayload, DecisionAction
from autotrade_service.feedback.outcome_tracker import TradeOutcomeTracker


class MockFeedbackEngine:
    """Mock feedback engine for testing."""
    
    def __init__(self):
        self.processed_outcomes = []
    
    async def process_trade_outcome(self, outcome):
        """Store processed outcomes for verification."""
        self.processed_outcomes.append(outcome)
        return None  # No rule generated in mock


def test_broker_registers_position_entry():
    """Test that broker registers position entry with tracker."""
    # Setup
    portfolio = SimulatedPortfolio(
        starting_capital=10000.0,
        current_cash=10000.0,
    )
    
    mock_engine = MockFeedbackEngine()
    tracker = TradeOutcomeTracker(feedback_engine=mock_engine)
    broker = SimulatedBroker(portfolio, outcome_tracker=tracker)
    
    # Create buy decision
    decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.BUY,
        size_pct=10.0,
        confidence=0.75,
        rationale="Strong bullish momentum",
        leverage=2.0,
    )
    
    market_snapshots = {"BTCUSDT": 50000.0}
    
    # Execute
    messages = broker.execute([decision], market_snapshots)
    
    # Verify position was opened
    assert "BTCUSDT" in portfolio.positions
    
    # Verify tracker has open position
    assert "BTCUSDT" in tracker._open_positions
    open_pos = tracker._open_positions["BTCUSDT"]
    assert open_pos.symbol == "BTCUSDT"
    assert open_pos.action == "BUY"
    assert open_pos.entry_price == pytest.approx(50000.0 * 1.0005, rel=0.01)  # With slippage
    assert open_pos.rationale == "Strong bullish momentum"


@pytest.mark.asyncio
async def test_broker_triggers_feedback_on_exit():
    """Test that broker triggers feedback loop when position closes."""
    # Setup
    portfolio = SimulatedPortfolio(
        starting_capital=10000.0,
        current_cash=10000.0,
    )
    
    mock_engine = MockFeedbackEngine()
    tracker = TradeOutcomeTracker(feedback_engine=mock_engine)
    broker = SimulatedBroker(portfolio, outcome_tracker=tracker)
    
    # Open position
    buy_decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.BUY,
        size_pct=10.0,
        confidence=0.75,
        rationale="Entry signal",
        leverage=1.0,
    )
    
    broker.execute([buy_decision], {"BTCUSDT": 50000.0})
    
    # Close position
    close_decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.CLOSE,
        rationale="Take profit",
    )
    
    broker.execute([close_decision], {"BTCUSDT": 52000.0})
    
    # Process pending feedback
    await broker.process_pending_feedback()
    
    # Verify feedback engine was called
    assert len(mock_engine.processed_outcomes) == 1
    
    outcome = mock_engine.processed_outcomes[0]
    assert outcome["symbol"] == "BTCUSDT"
    assert outcome["action"] == "BUY"
    assert outcome["pnl_pct"] > 0  # Should be profitable
    assert outcome["entry_price"] == pytest.approx(50000.0 * 1.0005, rel=0.01)
    assert outcome["exit_price"] == pytest.approx(52000.0, rel=0.01)


@pytest.mark.asyncio
async def test_broker_feedback_with_loss():
    """Test feedback loop with losing trade."""
    # Setup
    portfolio = SimulatedPortfolio(
        starting_capital=10000.0,
        current_cash=10000.0,
    )
    
    mock_engine = MockFeedbackEngine()
    tracker = TradeOutcomeTracker(feedback_engine=mock_engine)
    broker = SimulatedBroker(portfolio, outcome_tracker=tracker)
    
    # Open position
    buy_decision = DecisionPayload(
        symbol="ETHUSDT",
        action=DecisionAction.BUY,
        size_pct=10.0,
        confidence=0.60,
        rationale="Attempted reversal trade",
        leverage=1.0,
    )
    
    broker.execute([buy_decision], {"ETHUSDT": 3000.0})
    
    # Close position at loss
    close_decision = DecisionPayload(
        symbol="ETHUSDT",
        action=DecisionAction.CLOSE,
        rationale="Stop loss triggered",
    )
    
    broker.execute([close_decision], {"ETHUSDT": 2850.0})
    
    # Process pending feedback
    await broker.process_pending_feedback()
    
    # Verify feedback engine was called
    assert len(mock_engine.processed_outcomes) == 1
    
    outcome = mock_engine.processed_outcomes[0]
    assert outcome["symbol"] == "ETHUSDT"
    assert outcome["pnl_pct"] < 0  # Should be losing
    assert outcome["rationale"] == "Attempted reversal trade"


def test_broker_without_tracker():
    """Test that broker works without tracker (backward compatibility)."""
    portfolio = SimulatedPortfolio(
        starting_capital=10000.0,
        current_cash=10000.0,
    )
    
    # Broker without tracker
    broker = SimulatedBroker(portfolio, outcome_tracker=None)
    
    decision = DecisionPayload(
        symbol="BTCUSDT",
        action=DecisionAction.BUY,
        size_pct=10.0,
        confidence=0.75,
        rationale="Test trade",
    )
    
    # Should not error
    messages = broker.execute([decision], {"BTCUSDT": 50000.0})
    
    assert "BTCUSDT" in portfolio.positions
    assert len(messages) > 0

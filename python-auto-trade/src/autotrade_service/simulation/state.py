"""Data models for simulated portfolio state."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List


@dataclass
class ExitPlan:
    """Exit plan for a simulated position."""
    stop_loss: float | None = None
    take_profit: float | None = None
    invalidation_condition: str | None = None


@dataclass
class SimulatedPosition:
    """Represents a single position in the simulated portfolio."""
    symbol: str
    quantity: float
    entry_price: float
    entry_timestamp: datetime
    current_price: float
    confidence: float = 0.0
    leverage: float = 1.0
    exit_plan: ExitPlan = field(default_factory=ExitPlan)
    
    @property
    def notional_value(self) -> float:
        """Calculate notional value of the position."""
        return abs(self.quantity * self.current_price)
    
    @property
    def unrealized_pnl(self) -> float:
        """Calculate unrealized PnL."""
        if self.quantity >= 0:  # Long position
            return self.quantity * (self.current_price - self.entry_price)
        else:  # Short position
            return abs(self.quantity) * (self.entry_price - self.current_price)
    
    @property
    def unrealized_pnl_pct(self) -> float:
        """Calculate unrealized PnL percentage."""
        entry_notional = abs(self.quantity * self.entry_price)
        if entry_notional == 0:
            return 0.0
        return (self.unrealized_pnl / entry_notional) * 100.0
    
    def to_dict(self) -> dict:
        """Serialize position to dictionary."""
        return {
            "symbol": self.symbol,
            "quantity": self.quantity,
            "entry_price": self.entry_price,
            "entry_timestamp": self.entry_timestamp.isoformat(),
            "current_price": self.current_price,
            "confidence": self.confidence,
            "leverage": self.leverage,
            "exit_plan": {
                "stop_loss": self.exit_plan.stop_loss,
                "take_profit": self.exit_plan.take_profit,
                "invalidation_condition": self.exit_plan.invalidation_condition,
            },
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> SimulatedPosition:
        """Deserialize position from dictionary."""
        exit_plan_data = data.get("exit_plan", {})
        return cls(
            symbol=data["symbol"],
            quantity=data["quantity"],
            entry_price=data["entry_price"],
            entry_timestamp=datetime.fromisoformat(data["entry_timestamp"]),
            current_price=data["current_price"],
            confidence=data.get("confidence", 0.0),
            leverage=data.get("leverage", 1.0),
            exit_plan=ExitPlan(
                stop_loss=exit_plan_data.get("stop_loss"),
                take_profit=exit_plan_data.get("take_profit"),
                invalidation_condition=exit_plan_data.get("invalidation_condition"),
            ),
        )


@dataclass
class EvaluationLogEntry:
    """Represents a single LLM evaluation (including HOLD decisions)."""
    timestamp: datetime
    symbol: str
    action: str  # BUY, SELL, HOLD
    confidence: float
    size_pct: float
    rationale: str
    price: float  # Current market price at evaluation time
    executed: bool = False  # Whether this evaluation resulted in a trade
    chain_of_thought: str = ""  # Full LLM reasoning/thinking process
    system_prompt: str = ""
    user_payload: str = ""
    tool_payload_json: str | None = None  # JSON array of tool invocations
    
    def to_dict(self) -> dict:
        """Serialize evaluation log entry to dictionary."""
        return {
            "timestamp": self.timestamp.isoformat(),
            "symbol": self.symbol,
            "action": self.action,
            "confidence": self.confidence,
            "size_pct": self.size_pct,
            "rationale": self.rationale,
            "price": self.price,
            "executed": self.executed,
            "chain_of_thought": self.chain_of_thought,
            "system_prompt": self.system_prompt,
            "user_payload": self.user_payload,
            "tool_payload_json": self.tool_payload_json,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> EvaluationLogEntry:
        """Deserialize evaluation log entry from dictionary."""
        return cls(
            timestamp=datetime.fromisoformat(data["timestamp"]),
            symbol=data["symbol"],
            action=data["action"],
            confidence=data.get("confidence", 0.0),
            size_pct=data.get("size_pct", 0.0),
            rationale=data.get("rationale", ""),
            price=data.get("price", 0.0),
            executed=data.get("executed", False),
            chain_of_thought=data.get("chain_of_thought", ""),
            system_prompt=data.get("system_prompt", ""),
            user_payload=data.get("user_payload", ""),
            tool_payload_json=data.get("tool_payload_json"),
        )


@dataclass
class TradeLogEntry:
    """Represents a single trade execution in the log."""
    timestamp: datetime
    symbol: str
    action: str  # BUY, SELL, CLOSE
    price: float
    quantity: float
    realized_pnl: float = 0.0
    reason: str = ""
    
    def to_dict(self) -> dict:
        """Serialize trade log entry to dictionary."""
        return {
            "timestamp": self.timestamp.isoformat(),
            "symbol": self.symbol,
            "action": self.action,
            "price": self.price,
            "quantity": self.quantity,
            "realized_pnl": self.realized_pnl,
            "reason": self.reason,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> TradeLogEntry:
        """Deserialize trade log entry from dictionary."""
        return cls(
            timestamp=datetime.fromisoformat(data["timestamp"]),
            symbol=data["symbol"],
            action=data["action"],
            price=data["price"],
            quantity=data["quantity"],
            realized_pnl=data.get("realized_pnl", 0.0),
            reason=data.get("reason", ""),
        )


@dataclass
class ClosedPosition:
    """Represents a realized/closed position with PnL attribution."""
    symbol: str
    quantity: float
    entry_price: float
    exit_price: float
    entry_timestamp: datetime
    exit_timestamp: datetime
    realized_pnl: float
    realized_pnl_pct: float
    leverage: float
    reason: str = ""

    def to_dict(self) -> dict:
        """Serialize closed position to dictionary."""
        return {
            "symbol": self.symbol,
            "quantity": self.quantity,
            "entry_price": self.entry_price,
            "exit_price": self.exit_price,
            "entry_timestamp": self.entry_timestamp.isoformat(),
            "exit_timestamp": self.exit_timestamp.isoformat(),
            "realized_pnl": self.realized_pnl,
            "realized_pnl_pct": self.realized_pnl_pct,
            "leverage": self.leverage,
            "reason": self.reason,
        }

    @classmethod
    def from_dict(cls, data: dict) -> ClosedPosition:
        """Deserialize closed position from dictionary."""
        return cls(
            symbol=data["symbol"],
            quantity=data["quantity"],
            entry_price=data["entry_price"],
            exit_price=data["exit_price"],
            entry_timestamp=datetime.fromisoformat(data["entry_timestamp"]),
            exit_timestamp=datetime.fromisoformat(data["exit_timestamp"]),
            realized_pnl=data.get("realized_pnl", 0.0),
            realized_pnl_pct=data.get("realized_pnl_pct", 0.0),
            leverage=data.get("leverage", 1.0),
            reason=data.get("reason", ""),
        )


@dataclass
class SimulatedPortfolio:
    """Complete simulated portfolio state."""
    portfolio_id: str
    starting_cash: float
    current_cash: float
    positions: Dict[str, SimulatedPosition] = field(default_factory=dict)
    trade_log: List[TradeLogEntry] = field(default_factory=list)
    evaluation_log: List[EvaluationLogEntry] = field(default_factory=list)
    closed_positions: List[ClosedPosition] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    
    @property
    def total_position_value(self) -> float:
        """Calculate total value of all positions at current prices."""
        return sum(pos.notional_value for pos in self.positions.values())
    
    @property
    def equity(self) -> float:
        """Calculate total portfolio equity (cash + positions)."""
        return self.current_cash + self.total_position_value
    
    @property
    def total_unrealized_pnl(self) -> float:
        """Calculate total unrealized PnL across all positions."""
        return sum(pos.unrealized_pnl for pos in self.positions.values())
    
    @property
    def total_realized_pnl(self) -> float:
        """Calculate total realized PnL from trade log."""
        return sum(entry.realized_pnl for entry in self.trade_log)
    
    @property
    def total_pnl(self) -> float:
        """Calculate total PnL (realized + unrealized)."""
        return self.total_realized_pnl + self.total_unrealized_pnl
    
    @property
    def total_pnl_pct(self) -> float:
        """Calculate total PnL percentage relative to starting capital."""
        if self.starting_cash == 0:
            return 0.0
        return (self.total_pnl / self.starting_cash) * 100.0
    
    @property
    def equity_pct_change(self) -> float:
        """Calculate equity percentage change from starting cash."""
        if self.starting_cash == 0:
            return 0.0
        return ((self.equity - self.starting_cash) / self.starting_cash) * 100.0
    
    def to_dict(self) -> dict:
        """Serialize portfolio to dictionary."""
        return {
            "portfolio_id": self.portfolio_id,
            "starting_cash": self.starting_cash,
            "current_cash": self.current_cash,
            "positions": {symbol: pos.to_dict() for symbol, pos in self.positions.items()},
            "trade_log": [entry.to_dict() for entry in self.trade_log],
            "evaluation_log": [entry.to_dict() for entry in self.evaluation_log],
            "closed_positions": [entry.to_dict() for entry in self.closed_positions],
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> SimulatedPortfolio:
        """Deserialize portfolio from dictionary."""
        positions = {
            symbol: SimulatedPosition.from_dict(pos_data)
            for symbol, pos_data in data.get("positions", {}).items()
        }
        trade_log = [
            TradeLogEntry.from_dict(entry_data)
            for entry_data in data.get("trade_log", [])
        ]
        evaluation_log = [
            EvaluationLogEntry.from_dict(entry_data)
            for entry_data in data.get("evaluation_log", [])
        ]
        closed_positions = [
            ClosedPosition.from_dict(entry_data)
            for entry_data in data.get("closed_positions", [])
        ]
        return cls(
            portfolio_id=data["portfolio_id"],
            starting_cash=data["starting_cash"],
            current_cash=data["current_cash"],
            positions=positions,
            trade_log=trade_log,
            evaluation_log=evaluation_log,
            closed_positions=closed_positions,
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
        )

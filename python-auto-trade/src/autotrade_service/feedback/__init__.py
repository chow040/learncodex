"""
Feedback Loop Module - Self-improving LLM trading system.

This module implements the feedback loop where the trading AI learns from
past trades by generating and storing decision rules. No external RL models
or fine-tuning - pure in-context learning through natural language.

Components:
- FeedbackLoopEngine: Core critique and rule generation
- TradeOutcome: Dataclass for closed trade results
- LearnedRule: Dataclass for generated rules
- TradeOutcomeTracker: Monitors positions and triggers feedback loop
"""

from .feedback_engine import FeedbackLoopEngine, LearnedRule, TradeOutcome
from .outcome_tracker import OpenPosition, TradeOutcomeTracker

__all__ = [
    "FeedbackLoopEngine",
    "LearnedRule",
    "TradeOutcome",
    "TradeOutcomeTracker",
    "OpenPosition",
]

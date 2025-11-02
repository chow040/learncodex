from __future__ import annotations

import json
from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, Field, field_validator


class DecisionAction(str, Enum):
    HOLD = "HOLD"
    CLOSE = "CLOSE"
    BUY = "BUY"
    SELL = "SELL"
    NO_ENTRY = "NO_ENTRY"  # No position and no entry signal


class DecisionPayload(BaseModel):
    symbol: str
    action: DecisionAction
    quantity: Optional[float] = None
    size_pct: Optional[float] = Field(None, ge=0, le=100)
    leverage: Optional[float] = Field(None, ge=1, le=20)  # Leverage for the position
    confidence: Optional[float] = Field(None, ge=0, le=1)
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    max_slippage_bps: Optional[int] = Field(None, ge=0)
    rationale: Optional[str] = None
    invalidation_condition: Optional[str] = None
    chain_of_thought: Optional[str] = None  # Full LLM reasoning before decision

    @field_validator("symbol")
    @classmethod
    def validate_symbol(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("symbol must be non-empty")
        return value.upper()


class DecisionRequest(BaseModel):
    decisions: List[DecisionPayload]

    @classmethod
    def parse_payload(cls, payload: Any) -> "DecisionRequest":
        if isinstance(payload, str):
            payload = json.loads(payload)
        if isinstance(payload, list):
            return cls(decisions=payload)  # type: ignore[arg-type]
        if isinstance(payload, dict):
            return cls(**payload)
        raise ValueError("LLM payload must be a JSON array or object")


class DecisionResult(BaseModel):
    decisions: List[DecisionPayload]
    raw_json: str

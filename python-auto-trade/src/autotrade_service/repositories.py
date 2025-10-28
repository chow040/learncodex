from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, TypedDict

import asyncpg

from .db import get_db


@dataclass
class AutoTradeExitPlan:
    profit_target: float
    stop_loss: float
    invalidation: str


@dataclass
class AutoTradePosition:
    symbol: str
    quantity: float
    entry_price: float
    mark_price: float
    pnl: float
    pnl_pct: float
    leverage: float
    confidence: float
    exit_plan: AutoTradeExitPlan


@dataclass
class AutoTradeDecisionPrompt:
    system_prompt: str
    user_payload: str
    chain_of_thought: str
    invalidations: list[str]
    observation_window: str


@dataclass
class AutoTradeDecision:
    id: str
    symbol: str
    action: str
    size_pct: float
    confidence: float
    rationale: str
    created_at: str
    prompt: AutoTradeDecisionPrompt


@dataclass
class AutoTradeEvent:
    id: str
    label: str
    timestamp: str


@dataclass
class AutoTradePortfolioSnapshot:
    portfolio_id: str
    automation_enabled: bool
    mode: str
    available_cash: float
    equity: float
    total_pnl: float
    pnl_pct: float
    sharpe: float
    drawdown_pct: float
    last_run_at: str
    next_run_in_minutes: int
    positions: list[AutoTradePosition]
    decisions: list[AutoTradeDecision]
    events: list[AutoTradeEvent]


class DecisionRow(TypedDict):
    id: str
    symbol: str
    action: str
    size_pct: Decimal | None
    confidence: Decimal | None
    rationale: str | None
    created_at: Any
    prompt_uri: str | None
    prompt_payload: str | None
    cot_uri: str | None


def _to_float(value: Decimal | float | int | None, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _parse_exit_plan(value: Any, mark_price: float) -> AutoTradeExitPlan:
    if isinstance(value, dict):
        return AutoTradeExitPlan(
            profit_target=_to_float(value.get("profitTarget"), mark_price),
            stop_loss=_to_float(value.get("stopLoss"), mark_price),
            invalidation=str(value.get("invalidation", "")),
        )
    return AutoTradeExitPlan(
        profit_target=mark_price,
        stop_loss=mark_price,
        invalidation="",
    )


def _map_position(row: asyncpg.Record) -> AutoTradePosition:
    quantity = _to_float(row["quantity"])
    entry_price = _to_float(row["avg_cost"])
    mark_price = _to_float(row["mark_price"])
    pnl = _to_float(row["unrealized_pnl"])
    leverage = _to_float(row["leverage"], 0.0)
    exit_plan = _parse_exit_plan(row.get("exit_plan"), mark_price)
    pnl_pct = 0.0
    notional = entry_price * quantity
    if notional:
        pnl_pct = (pnl / notional) * 100.0
    return AutoTradePosition(
        symbol=row["symbol"],
        quantity=quantity,
        entry_price=entry_price,
        mark_price=mark_price,
        pnl=pnl,
        pnl_pct=pnl_pct,
        leverage=leverage,
        confidence=_to_float(row.get("confidence"), 0.0),
        exit_plan=exit_plan,
    )


def _map_event(row: asyncpg.Record) -> AutoTradeEvent:
    label = None
    payload = row.get("payload")
    if isinstance(payload, dict):
        label = payload.get("label")
    return AutoTradeEvent(
        id=row["id"],
        label=label or row["event_type"],
        timestamp=row["created_at"].isoformat() if row["created_at"] else "",
    )


def _map_decision(row: DecisionRow) -> AutoTradeDecision:
    prompt = AutoTradeDecisionPrompt(
        system_prompt=row.get("prompt_uri") or "",
        user_payload=row.get("prompt_payload") or "",
        chain_of_thought=row.get("cot_uri") or "",
        invalidations=[],
        observation_window="PT5M",
    )
    created_at = row["created_at"].isoformat() if row["created_at"] else ""
    return AutoTradeDecision(
        id=row["id"],
        symbol=row["symbol"],
        action=row["action"],
        size_pct=_to_float(row.get("size_pct"), 0.0),
        confidence=_to_float(row.get("confidence"), 0.0),
        rationale=row.get("rationale") or "",
        created_at=created_at,
        prompt=prompt,
    )


async def fetch_latest_portfolio() -> AutoTradePortfolioSnapshot | None:
    db = get_db()
    if not db.is_connected:
        return None
    async with db.acquire() as conn:
        portfolio = await conn.fetchrow(
            "SELECT * FROM auto_portfolios ORDER BY updated_at DESC LIMIT 1"
        )
        if not portfolio:
            return None

        portfolio_id = portfolio["id"]
        positions_rows = await conn.fetch(
            "SELECT * FROM portfolio_positions WHERE portfolio_id = $1",
            portfolio_id,
        )
        events_rows = await conn.fetch(
            "SELECT * FROM autotrade_events WHERE portfolio_id = $1 ORDER BY created_at DESC",
            portfolio_id,
        )
        decisions_rows = await conn.fetch(
            """
            SELECT
              l.*, 
              prompt.storage_uri AS prompt_uri,
              prompt.storage_uri AS prompt_payload,
              cot.storage_uri AS cot_uri
            FROM llm_decision_logs l
            LEFT JOIN llm_prompt_payloads prompt ON l.prompt_ref = prompt.id
            LEFT JOIN llm_prompt_payloads cot ON l.cot_ref = cot.id
            WHERE l.portfolio_id = $1
            ORDER BY l.created_at DESC
            """,
            portfolio_id,
        )

    positions = [_map_position(row) for row in positions_rows]
    total_positions_value = sum(pos.mark_price * pos.quantity for pos in positions)
    total_pnl = sum(pos.pnl for pos in positions)
    starting_capital = _to_float(portfolio.get("starting_capital"), 0.0)
    current_cash = _to_float(portfolio.get("current_cash"), 0.0)
    equity = current_cash + total_positions_value
    pnl_pct = (total_pnl / starting_capital * 100.0) if starting_capital else 0.0

    decisions = [_map_decision(row) for row in decisions_rows]
    events = [_map_event(row) for row in events_rows]

    return AutoTradePortfolioSnapshot(
        portfolio_id=str(portfolio_id),
        automation_enabled=bool(portfolio.get("automation_enabled")),
        mode="Paper trading",  # Placeholder until mode stored explicitly
        available_cash=current_cash,
        equity=equity,
        total_pnl=total_pnl,
        pnl_pct=pnl_pct,
        sharpe=_to_float(portfolio.get("sharpe"), 0.0),
        drawdown_pct=_to_float(portfolio.get("drawdown_pct"), 0.0),
        last_run_at=portfolio.get("last_run_at").isoformat() if portfolio.get("last_run_at") else "",
        next_run_in_minutes=5,
        positions=positions,
        decisions=decisions,
        events=events,
    )


async def fetch_decisions(symbol: str | None = None) -> list[AutoTradeDecision]:
    db = get_db()
    if not db.is_connected:
        return []
    query = """
        SELECT
          l.*, 
          prompt.storage_uri AS prompt_uri,
          prompt.storage_uri AS prompt_payload,
          cot.storage_uri AS cot_uri
        FROM llm_decision_logs l
        LEFT JOIN llm_prompt_payloads prompt ON l.prompt_ref = prompt.id
        LEFT JOIN llm_prompt_payloads cot ON l.cot_ref = cot.id
    """
    params: list[Any] = []
    if symbol:
        query += " WHERE l.symbol = $1"
        params.append(symbol)
    query += " ORDER BY l.created_at DESC"

    async with db.acquire() as conn:
        rows: list[DecisionRow] = await conn.fetch(query, *params)

    return [_map_decision(row) for row in rows]


async def fetch_decision_by_id(decision_id: str) -> AutoTradeDecision | None:
    db = get_db()
    if not db.is_connected:
        return None
    async with db.acquire() as conn:
        row: DecisionRow | None = await conn.fetchrow(
            """
            SELECT
              l.*, 
              prompt.storage_uri AS prompt_uri,
              prompt.storage_uri AS prompt_payload,
              cot.storage_uri AS cot_uri
            FROM llm_decision_logs l
            LEFT JOIN llm_prompt_payloads prompt ON l.prompt_ref = prompt.id
            LEFT JOIN llm_prompt_payloads cot ON l.cot_ref = cot.id
            WHERE l.id = $1
            """,
            decision_id,
        )
    if row is None:
        return None
    return _map_decision(row)

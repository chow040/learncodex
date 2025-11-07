from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from decimal import Decimal
from datetime import datetime
from typing import Any, Iterable, TypedDict
from uuid import UUID

try:
    import asyncpg
except ModuleNotFoundError:  # pragma: no cover - fallback for local/test environments without asyncpg
    class _AsyncPGStub:  # type: ignore
        Record = dict

    asyncpg = _AsyncPGStub()  # type: ignore[assignment]

from .config import get_settings
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
class AutoTradeClosedPosition:
    symbol: str
    quantity: float
    entry_price: float
    exit_price: float
    entry_timestamp: str
    exit_timestamp: str
    realized_pnl: float
    realized_pnl_pct: float
    leverage: float
    reason: str


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
    tool_payload_json: str | None = None  # JSON array of tool invocations


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
    closed_positions: list[AutoTradeClosedPosition]
    decisions: list[AutoTradeDecision]
    events: list[AutoTradeEvent]


@dataclass(slots=True)
class MarketSnapshot:
    symbol: str
    bucket_start: datetime
    bucket_end: datetime
    open_price: float
    high_price: float
    low_price: float
    close_price: float
    volume: float


async def upsert_market_snapshots(snapshots: Iterable[MarketSnapshot]) -> None:
    rows = list(snapshots)
    if not rows:
        return
    db = get_db()
    if not db.is_connected:
        return
    query = """
        INSERT INTO market_snapshots (
            symbol,
            bucket_start,
            bucket_end,
            open_price,
            high_price,
            low_price,
            close_price,
            volume,
            updated_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, NOW()
        )
        ON CONFLICT (symbol, bucket_start)
        DO UPDATE SET
            bucket_end = EXCLUDED.bucket_end,
            open_price = EXCLUDED.open_price,
            high_price = EXCLUDED.high_price,
            low_price = EXCLUDED.low_price,
            close_price = EXCLUDED.close_price,
            volume = EXCLUDED.volume,
            updated_at = NOW()
    """
    values = [
        (
            snapshot.symbol,
            snapshot.bucket_start,
            snapshot.bucket_end,
            snapshot.open_price,
            snapshot.high_price,
            snapshot.low_price,
            snapshot.close_price,
            snapshot.volume,
        )
        for snapshot in rows
    ]
    async with db.acquire() as conn:
        await conn.executemany(query, values)


async def upsert_market_snapshot_indicators(
    *,
    symbol: str,
    bucket_start: datetime,
    bucket_end: datetime,
    open_price: float,
    high_price: float,
    low_price: float,
    close_price: float,
    volume: float,
    ema_fast: float,
    ema_slow: float | None,
    macd: float,
    macd_signal: float,
    macd_histogram: float,
    rsi: float,
    rsi_short: float,
    atr: float,
    atr_short: float,
    volatility: float,
    volume_ratio: float,
) -> None:
    db = get_db()
    if not db.is_connected:
        return
    async with db.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO market_snapshots (
                symbol,
                bucket_start,
                bucket_end,
                open_price,
                high_price,
                low_price,
                close_price,
                volume,
                ema_fast,
                ema_slow,
                macd,
                macd_signal,
                macd_histogram,
                rsi,
                rsi_short,
                atr,
                atr_short,
                volatility,
                volume_ratio,
                updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW()
            )
            ON CONFLICT (symbol, bucket_start) DO UPDATE SET
                bucket_end = GREATEST(market_snapshots.bucket_end, EXCLUDED.bucket_end),
                open_price = COALESCE(market_snapshots.open_price, EXCLUDED.open_price),
                high_price = GREATEST(market_snapshots.high_price, EXCLUDED.high_price),
                low_price = LEAST(market_snapshots.low_price, EXCLUDED.low_price),
                close_price = EXCLUDED.close_price,
                volume = EXCLUDED.volume,
                ema_fast = EXCLUDED.ema_fast,
                ema_slow = EXCLUDED.ema_slow,
                macd = EXCLUDED.macd,
                macd_signal = EXCLUDED.macd_signal,
                macd_histogram = EXCLUDED.macd_histogram,
                rsi = EXCLUDED.rsi,
                rsi_short = EXCLUDED.rsi_short,
                atr = EXCLUDED.atr,
                atr_short = EXCLUDED.atr_short,
                volatility = EXCLUDED.volatility,
                volume_ratio = EXCLUDED.volume_ratio,
                updated_at = NOW()
            """,
            symbol,
            bucket_start,
            bucket_end,
            open_price,
            high_price,
            low_price,
            close_price,
            volume,
            ema_fast,
            ema_slow,
            macd,
            macd_signal,
            macd_histogram,
            rsi,
            rsi_short,
            atr,
            atr_short,
            volatility,
            volume_ratio,
        )


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


def _map_closed_position(row: asyncpg.Record) -> AutoTradeClosedPosition:
    entry_timestamp = row.get("entry_timestamp")
    exit_timestamp = row.get("exit_timestamp")
    return AutoTradeClosedPosition(
        symbol=row["symbol"],
        quantity=_to_float(row.get("quantity"), 0.0),
        entry_price=_to_float(row.get("entry_price"), 0.0),
        exit_price=_to_float(row.get("exit_price"), 0.0),
        entry_timestamp=entry_timestamp.isoformat() if entry_timestamp else "",
        exit_timestamp=exit_timestamp.isoformat() if exit_timestamp else "",
        realized_pnl=_to_float(row.get("realized_pnl"), 0.0),
        realized_pnl_pct=_to_float(row.get("realized_pnl_pct"), 0.0),
        leverage=_to_float(row.get("leverage"), 0.0),
        reason=str(row.get("reason") or ""),
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
    settings = get_settings()
    
    # If simulation mode is enabled, load from simulated state
    if settings.simulation_enabled:
        from .simulation import load_state, simulated_to_snapshot, create_initial_state
        
        logger = logging.getLogger("autotrade.repositories")
        logger.debug("Simulation mode enabled; loading simulated portfolio state")
        
        portfolio = load_state(settings.simulation_state_path)
        
        # If no state exists, create initial state
        if portfolio is None:
            logger.info(
                f"Creating new simulation portfolio with ${settings.simulation_starting_cash:.2f}"
            )
            portfolio = create_initial_state(
                portfolio_id="simulation",
                starting_cash=settings.simulation_starting_cash,
                path=settings.simulation_state_path,
            )
        
        return simulated_to_snapshot(portfolio)
    
    # Otherwise, use production database logic
    db = get_db()
    if not db.is_connected:
        logger = logging.getLogger("autotrade.repositories")
        logger.debug("Database not connected; returning bootstrap portfolio snapshot.")
        return AutoTradePortfolioSnapshot(
            portfolio_id="bootstrap",
            automation_enabled=True,
            mode="paper",
            available_cash=10_000.0,
            equity=10_000.0,
            total_pnl=0.0,
            pnl_pct=0.0,
            sharpe=0.0,
            drawdown_pct=0.0,
            last_run_at="",
            next_run_in_minutes=3,
            positions=[],
            closed_positions=[],
            decisions=[],
            events=[],
        )
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
        closed_rows: list[Any] = []
        try:
            closed_rows = await conn.fetch(
                """
                SELECT *
                FROM portfolio_closed_positions
                WHERE portfolio_id = $1
                ORDER BY exit_timestamp DESC
                """,
                portfolio_id,
            )
        except Exception as exc:  # pragma: no cover - optional table
            logging.getLogger("autotrade.repositories").debug(
                "Closed positions unavailable for portfolio %s: %s", portfolio_id, exc
            )
            closed_rows = []

    positions = [_map_position(row) for row in positions_rows]
    closed_positions = [_map_closed_position(row) for row in closed_rows]
    total_positions_value = sum(pos.mark_price * pos.quantity for pos in positions)
    open_pnl_total = sum(pos.pnl for pos in positions)
    realized_pnl_total = sum(entry.realized_pnl for entry in closed_positions)
    total_pnl = open_pnl_total + realized_pnl_total
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
        closed_positions=closed_positions,
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
    settings = get_settings()

    # Support simulation decisions (ids prefixed with "sim-")
    if settings.simulation_enabled and decision_id.startswith("sim-"):
        from .simulation import load_state  # deferred import to avoid circular deps

        portfolio = load_state(settings.simulation_state_path)
        if portfolio:
            for entry in portfolio.evaluation_log:
                sim_id = f"sim-{entry.timestamp.isoformat()}-{entry.symbol}"
                if sim_id != decision_id:
                    continue
                prompt = AutoTradeDecisionPrompt(
                    system_prompt=entry.system_prompt,
                    user_payload=entry.user_payload,
                    chain_of_thought=entry.chain_of_thought,
                    invalidations=[],
                    observation_window="PT5M",
                )
                return AutoTradeDecision(
                    id=sim_id,
                    symbol=entry.symbol,
                    action=entry.action.lower(),
                    size_pct=entry.size_pct,
                    confidence=entry.confidence,
                    rationale=entry.rationale,
                    created_at=entry.timestamp.isoformat(),
                    prompt=prompt,
                    tool_payload_json=entry.tool_payload_json,
                )
        return None

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


# ============================================================================
# FEEDBACK LOOP REPOSITORY FUNCTIONS
# ============================================================================

logger = logging.getLogger(__name__)


@dataclass
class LearnedRuleRecord:
    """Database record for a learned rule."""
    id: UUID
    rule_text: str
    rule_type: str
    created_at: datetime
    active: bool
    effectiveness_score: float
    times_applied: int
    metadata: dict[str, Any]


async def save_learned_rule(
    rule_text: str,
    rule_type: str,
    source_trade_id: UUID | None = None,
    critique: str | None = None,
    metadata: dict[str, Any] | None = None,
    created_by: str = "system",
) -> UUID | None:
    """
    Save a new learned rule to the database.
    
    Note: Returns None if database is unavailable (e.g., simulation mode).
    This allows rule generation to work without persistence.
    
    Args:
        rule_text: Natural language rule text
        rule_type: Category (risk_management, entry, exit, position_sizing)
        source_trade_id: UUID of trade that generated this rule
        critique: LLM critique that led to this rule
        metadata: Additional context (PnL, symbol, etc.)
        created_by: 'system' or 'manual'
        
    Returns:
        UUID of the newly created rule, or None if database unavailable
    """
    db = get_db()
    if not db.is_connected:
        logger.warning("Database not connected - learned rule not persisted (simulation mode?)")
        return None
    
    # Merge critique into metadata
    full_metadata = metadata or {}
    if critique:
        full_metadata["critique"] = critique
    
    async with db.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO learned_rules 
                (rule_text, rule_type, source_trade_id, created_by, metadata)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            """,
            rule_text,
            rule_type,
            source_trade_id,
            created_by,
            json.dumps(full_metadata),
        )
    
    if row is None:
        raise RuntimeError("Failed to insert learned rule")
    
    rule_id = row["id"]
    logger.info(f"Saved learned rule {rule_id}: {rule_text[:50]}")
    return rule_id


async def fetch_active_rules(
    limit: int = 20,
    rule_type: str | None = None,
) -> list[LearnedRuleRecord]:
    """
    Fetch active learned rules, ordered by creation date (newest first).
    
    Args:
        limit: Maximum number of rules to return
        rule_type: Optional filter by rule type
        
    Returns:
        List of LearnedRuleRecord objects
    """
    db = get_db()
    if not db.is_connected:
        return []
    
    query = """
        SELECT id, rule_text, rule_type, created_at, active, 
               effectiveness_score, times_applied, metadata
        FROM learned_rules
        WHERE active = TRUE
    """
    
    params: list[Any] = []
    if rule_type:
        query += " AND rule_type = $1"
        params.append(rule_type)
    
    query += " ORDER BY created_at DESC"
    
    if limit:
        query += f" LIMIT ${len(params) + 1}"
        params.append(limit)
    
    async with db.acquire() as conn:
        rows = await conn.fetch(query, *params)
    
    return [
        LearnedRuleRecord(
            id=row["id"],
            rule_text=row["rule_text"],
            rule_type=row["rule_type"],
            created_at=row["created_at"],
            active=row["active"],
            effectiveness_score=float(row["effectiveness_score"]),
            times_applied=int(row["times_applied"]),
            metadata=row["metadata"] or {},
        )
        for row in rows
    ]


async def save_trade_outcome(
    decision_id: UUID | None,
    symbol: str,
    action: str,
    entry_price: float,
    exit_price: float,
    quantity: float,
    pnl_usd: float,
    pnl_pct: float,
    entry_timestamp: datetime,
    exit_timestamp: datetime,
    duration_seconds: int,
    rationale: str,
    rule_ids: list[UUID],
    portfolio_id: UUID | None = None,
) -> UUID | None:
    """
    Save a completed trade outcome to the database.
    
    Note: Returns None if database is unavailable (e.g., simulation mode).
    This allows the feedback loop to work in paper trading without persistence.
    
    Args:
        decision_id: Reference to llm_decision_logs (if exists)
        symbol: Trading symbol
        action: BUY, SELL, CLOSE, HOLD
        entry_price: Entry price
        exit_price: Exit price
        quantity: Position size
        pnl_usd: Profit/loss in USD
        pnl_pct: Profit/loss percentage
        entry_timestamp: When position opened
        exit_timestamp: When position closed
        duration_seconds: Trade duration
        rationale: Original decision rationale
        rule_ids: List of rule UUIDs applied
        portfolio_id: Optional portfolio reference
        
    Returns:
        UUID of the trade outcome record, or None if database unavailable
    """
    db = get_db()
    if not db.is_connected:
        logger.warning("Database not connected - trade outcome not persisted (simulation mode?)")
        return None
    
    async with db.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO trade_outcomes (
                decision_id, portfolio_id, symbol, action,
                entry_price, exit_price, quantity,
                pnl_usd, pnl_pct,
                entry_timestamp, exit_timestamp, duration_seconds,
                rationale, rule_ids
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id
            """,
            decision_id,
            portfolio_id,
            symbol,
            action,
            entry_price,
            exit_price,
            quantity,
            pnl_usd,
            pnl_pct,
            entry_timestamp,
            exit_timestamp,
            duration_seconds,
            rationale,
            rule_ids,
        )
    
    if row is None:
        raise RuntimeError("Failed to insert trade outcome")
    
    outcome_id = row["id"]
    logger.info(f"Saved trade outcome {outcome_id}: {symbol} {action} PnL={pnl_pct:.2f}%")
    return outcome_id


async def update_learned_rule(
    rule_id: UUID,
    active: bool | None = None,
    effectiveness_score: float | None = None,
    times_applied: int | None = None,
) -> None:
    """
    Update a learned rule's metadata.
    
    Args:
        rule_id: UUID of the rule to update
        active: New active status (optional)
        effectiveness_score: New effectiveness score (optional)
        times_applied: New application count (optional)
    """
    db = get_db()
    if not db.is_connected:
        raise RuntimeError("Database not connected")
    
    updates: list[str] = []
    params: list[Any] = []
    param_idx = 1
    
    if active is not None:
        updates.append(f"active = ${param_idx}")
        params.append(active)
        param_idx += 1
    
    if effectiveness_score is not None:
        updates.append(f"effectiveness_score = ${param_idx}")
        params.append(effectiveness_score)
        param_idx += 1
    
    if times_applied is not None:
        updates.append(f"times_applied = ${param_idx}")
        params.append(times_applied)
        param_idx += 1
    
    if not updates:
        return  # Nothing to update
    
    params.append(rule_id)
    query = f"""
        UPDATE learned_rules
        SET {', '.join(updates)}
        WHERE id = ${param_idx}
    """
    
    async with db.acquire() as conn:
        await conn.execute(query, *params)
    
    logger.info(f"Updated learned rule {rule_id}")


async def fetch_trade_outcomes(
    symbol: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """
    Fetch recent trade outcomes.
    
    Args:
        symbol: Optional filter by symbol
        limit: Maximum number of outcomes to return
        
    Returns:
        List of trade outcome dictionaries
    """
    db = get_db()
    if not db.is_connected:
        return []
    
    query = """
        SELECT * FROM trade_outcomes
    """
    
    params: list[Any] = []
    if symbol:
        query += " WHERE symbol = $1"
        params.append(symbol)
    
    query += " ORDER BY exit_timestamp DESC"
    
    if limit:
        query += f" LIMIT ${len(params) + 1}"
        params.append(limit)
    
    async with db.acquire() as conn:
        rows = await conn.fetch(query, *params)
    
    return [dict(row) for row in rows]


async def fetch_rule_applications(rule_id: UUID) -> list[dict[str, Any]]:
    """
    Fetch all applications of a specific rule.
    
    Args:
        rule_id: UUID of the rule
        
    Returns:
        List of rule application records
    """
    db = get_db()
    if not db.is_connected:
        return []
    
    async with db.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT * FROM rule_applications
            WHERE rule_id = $1
            ORDER BY applied_at DESC
            """,
            rule_id,
        )
    
    return [dict(row) for row in rows]

from __future__ import annotations

import json
import logging
from typing import Dict, TYPE_CHECKING

import asyncio

from ..config import get_settings
from ..brokers import build_broker
from ..feedback.feedback_engine import FeedbackLoopEngine
from ..feedback.outcome_tracker import TradeOutcomeTracker
from ..llm import AsyncDeepSeekClient
from ..llm.langchain_agent import SYSTEM_PROMPT
from ..observability import update_portfolio_drawdown
from ..persistence import persist_decision_logs
from ..schedulers.types import CachedSymbolData
from ..simulation import load_state, save_state
from ..repositories import get_runtime_mode

if TYPE_CHECKING:  # pragma: no cover - typing aid
    from ..pipelines import DecisionPipelineResult


async def execute_decision_cycle(
    *,
    cached_market_data: Dict[str, CachedSymbolData] | None = None,
    logger: logging.Logger | None = None,
) -> "DecisionPipelineResult" | None:
    from ..pipelines import get_decision_pipeline
    log = logger or logging.getLogger("autotrade.scheduler.decision")
    settings = get_settings()
    decision_pipeline = get_decision_pipeline()

    pipeline_result = await decision_pipeline.run_once(cached_market_data=cached_market_data)

    if pipeline_result is None:
        log.info("Decision pipeline returned no result")
        return None

    if not pipeline_result.response.decisions:
        log.info("No decisions generated from pipeline run %s", pipeline_result.run_id)
        return pipeline_result

    runtime_mode = await get_runtime_mode(settings)
    use_simulated = runtime_mode == "simulator"

    portfolio = None
    if use_simulated:
        portfolio = load_state(settings.simulation_state_path)
        if portfolio is None:
            log.error("Failed to load portfolio from state file")
            return pipeline_result

    outcome_tracker = None
    if settings.feedback_loop_enabled:
        try:
            llm_client = AsyncDeepSeekClient()
            feedback_engine = FeedbackLoopEngine(llm_client=llm_client, settings=settings)
            outcome_tracker = TradeOutcomeTracker(feedback_engine=feedback_engine)
            log.info("Feedback loop initialized successfully")
        except Exception as exc:  # pragma: no cover - feedback init failure
            log.warning("Failed to initialize feedback loop: %s", exc, exc_info=True)
            outcome_tracker = None

    broker = await build_broker(
        settings=settings,
        portfolio=portfolio,
        outcome_tracker=outcome_tracker,
        runtime_mode=runtime_mode,
    )

    log.info(
        "Decision pipeline produced %s decisions for run %s",
        len(pipeline_result.response.decisions),
        pipeline_result.run_id,
    )

    persisted_ids = await persist_decision_logs(
        result=pipeline_result,
        portfolio_id=pipeline_result.portfolio_id,
        runtime_mode=runtime_mode,
    )
    if persisted_ids and len(persisted_ids) != len(pipeline_result.response.decisions):
        log.warning(
            "Mismatch between persisted decision ids (%s) and decisions (%s) for run %s",
            len(persisted_ids),
            len(pipeline_result.response.decisions),
            pipeline_result.run_id,
        )
    elif not persisted_ids:
        log.warning(
            "Persisted no decisions for run %s (expected %s)",
            pipeline_result.run_id,
            len(pipeline_result.response.decisions),
        )
    else:
        log.info(
            "Persisted %s decision logs for run %s",
            len(persisted_ids),
            pipeline_result.run_id,
        )
    for decision, decision_id in zip(pipeline_result.response.decisions, persisted_ids):
        decision.decision_log_id = decision_id

    market_snapshots = _extract_market_snapshots(pipeline_result)

    # Ensure every decision symbol has a fallback price
    for decision in pipeline_result.response.decisions:
        symbol = decision.symbol
        price = market_snapshots.get(symbol, 0.0)
        if price and price > 0:
            continue
        fallback = decision.take_profit or decision.stop_loss or decision.quantity or 0.0
        if isinstance(fallback, (int, float)) and fallback > 0:
            market_snapshots[symbol] = float(fallback)
        else:
            log.warning("No market price available for %s; trade execution will be skipped", symbol)

    messages = await broker.execute(
        pipeline_result.response.decisions,
        market_snapshots,
        system_prompt=SYSTEM_PROMPT,
        user_payload=pipeline_result.prompt,
        tool_payload_json=pipeline_result.response.tool_payload_json,
    )

    await broker.process_pending_feedback()
    for msg in messages:
        log.info(msg)

    await broker.mark_to_market(market_snapshots)
    snapshot = None
    getter = getattr(broker, "get_portfolio_snapshot", None)
    if callable(getter):
        snapshot_result = getter()
        if asyncio.iscoroutine(snapshot_result):
            snapshot = await snapshot_result
        else:
            snapshot = snapshot_result

    if use_simulated and snapshot is not None:
        save_state(snapshot, settings.simulation_state_path)
        log.info("Saved portfolio state with %s evaluations", len(snapshot.evaluation_log))
    if snapshot is not None:
        drawdown = None
        if hasattr(snapshot, "drawdown_pct"):
            drawdown = getattr(snapshot, "drawdown_pct")
        elif isinstance(snapshot, dict):
            drawdown = snapshot.get("drawdown_pct")
        if drawdown is not None:
            update_portfolio_drawdown(drawdown)

    return snapshot


def _extract_market_snapshots(result: "DecisionPipelineResult") -> Dict[str, float]:
    market_snapshots: dict[str, float] = {}
    for trace_entry in result.agent_trace:
        if trace_entry.get("message_type") != "ToolMessage":
            continue
        content = trace_entry.get("content") or ""
        if not content:
            continue
        try:
            payload = json.loads(content)
        except json.JSONDecodeError:
            continue

        tool_name = trace_entry.get("tool_name")
        symbol = (payload.get("symbol") or "").upper()
        if not symbol:
            continue

        price_value: float | None = None
        if tool_name == "live_market_data":
            price = payload.get("last_price")
            if isinstance(price, (int, float)):
                price_value = float(price)
        elif tool_name == "indicator_calculator":
            price = payload.get("price")
            if isinstance(price, (int, float)):
                price_value = float(price)

        if price_value is not None and price_value > 0:
            market_snapshots[symbol] = price_value
    return market_snapshots


__all__ = ["execute_decision_cycle"]

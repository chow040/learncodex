from __future__ import annotations

import hashlib
import logging
from typing import Any, TYPE_CHECKING
from uuid import UUID

from ..db import get_db
from ..runtime import RuntimeMode
from ..repositories import fetch_active_portfolio_id

if TYPE_CHECKING:  # pragma: no cover
    from ..pipelines.decision_pipeline import DecisionPipelineResult

logger = logging.getLogger("autotrade.persistence.decision_logs")


async def persist_decision_logs(
    *,
    result: "DecisionPipelineResult",
    portfolio_id: str,
    runtime_mode: RuntimeMode,
) -> list[str]:
    """
    Persist the decisions from a pipeline run into llm_decision_logs.

    Returns:
        List of decision ids (UUID strings) corresponding to the inserted rows.
    """
    decisions = result.response.decisions
    if not decisions:
        return []

    db = get_db()
    if not db.is_connected:
        logger.warning(
            "Database not connected; skipping decision persistence (portfolio=%s run_id=%s)",
            portfolio_id,
            result.run_id,
        )
        return []

    tool_payload_json = result.response.tool_payload_json
    prompt_text = result.prompt or ""
    cot_payload = _collapse_chain_of_thought(decisions)

    try:
        async with db.acquire() as conn:  # type: ignore[assignment]
            db_portfolio_id = await _resolve_portfolio_id(conn, portfolio_id)
            if db_portfolio_id is None:
                logger.warning(
                    "Skipping decision persistence; unable to resolve portfolio id (source=%s runtime=%s)",
                    portfolio_id,
                    runtime_mode,
                )
                return []

            async with conn.transaction():
                prompt_ref = await _insert_prompt_payload(
                    conn=conn,
                    payload=prompt_text,
                    payload_type="prompt",
                )
                cot_ref = await _insert_prompt_payload(
                    conn=conn,
                    payload=cot_payload,
                    payload_type="cot",
                )

                inserted_ids: list[str] = []
                for decision in decisions:
                    action_value = decision.action.value.lower()
                    decision_id = await conn.fetchval(
                        """
                        INSERT INTO llm_decision_logs (
                            portfolio_id,
                            run_id,
                            symbol,
                            action,
                            size_pct,
                            confidence,
                            rationale,
                            prompt_ref,
                            cot_ref,
                            tool_payload_json
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        RETURNING id
                        """,
                        db_portfolio_id,
                        result.run_id,
                        decision.symbol,
                        action_value,
                        decision.size_pct,
                        decision.confidence,
                        decision.rationale,
                        prompt_ref,
                        cot_ref,
                        tool_payload_json,
                    )
                    inserted_ids.append(str(decision_id))
                logger.info(
                    "Persisted %s decisions (portfolio=%s run_id=%s)",
                    len(inserted_ids),
                    db_portfolio_id,
                    result.run_id,
                )
                return inserted_ids
    except Exception:
        logger.exception(
            "Failed to persist decision logs (portfolio=%s run_id=%s mode=%s)",
            portfolio_id,
            result.run_id,
            runtime_mode,
        )
        return []


def _collapse_chain_of_thought(decisions) -> str:
    segments = []
    for decision in decisions:
        value = (decision.chain_of_thought or "").strip()
        if value:
            segments.append(value)
    if not segments:
        return ""
    return "\n\n---\n\n".join(segments)


async def _insert_prompt_payload(
    *,
    conn: Any,
    payload: str,
    payload_type: str,
) -> str | None:
    if not payload:
        return None
    checksum = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return await conn.fetchval(
        """
        INSERT INTO llm_prompt_payloads (storage_uri, sha256, payload_type)
        VALUES ($1, $2, $3)
        RETURNING id
        """,
        payload,
        checksum,
        payload_type,
    )


async def _resolve_portfolio_id(conn: Any, candidate: str) -> str | None:
    if _looks_like_uuid(candidate):
        return candidate
    return await fetch_active_portfolio_id(conn=conn)


def _looks_like_uuid(value: str | None) -> bool:
    if not value:
        return False
    try:
        UUID(str(value))
        return True
    except (ValueError, TypeError):
        return False


__all__ = ["persist_decision_logs"]

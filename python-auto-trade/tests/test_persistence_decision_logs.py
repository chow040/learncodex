from datetime import datetime, timezone

import pytest

from autotrade_service.llm.schemas import DecisionAction, DecisionPayload, DecisionResult
from autotrade_service.persistence.decision_logs import persist_decision_logs
from autotrade_service.pipelines.decision_pipeline import DecisionPipelineResult
from autotrade_service.persistence import decision_logs as decision_logs_module


class _StubTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _StubConnection:
    def __init__(self):
        self.prompt_rows: list[tuple[tuple[str, ...], tuple[object, ...]]] = []
        self.decision_rows: list[tuple[tuple[str, ...], tuple[object, ...]]] = []
        self.fetchrow_calls: list[str] = []

    def transaction(self):
        return _StubTransaction()

    async def fetchval(self, query: str, *params):
        if "llm_prompt_payloads" in query:
            self.prompt_rows.append(((query,), params))
            return f"prompt-{len(self.prompt_rows)}"
        if "llm_decision_logs" in query:
            self.decision_rows.append(((query,), params))
            return f"dec-{len(self.decision_rows)}"
        raise AssertionError(f"Unexpected query: {query}")

    async def fetchrow(self, query: str, *params):
        self.fetchrow_calls.append(query)
        return {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}


class _StubAcquire:
    def __init__(self, conn: _StubConnection):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _StubDB:
    def __init__(self, conn: _StubConnection):
        self._conn = conn
        self.is_connected = True

    def acquire(self):
        return _StubAcquire(self._conn)


@pytest.mark.asyncio
async def test_persist_decision_logs_inserts_prompt_and_decisions(monkeypatch):
    conn = _StubConnection()
    stub_db = _StubDB(conn)
    monkeypatch.setattr(
        "autotrade_service.persistence.decision_logs.get_db",
        lambda: stub_db,
    )

    decisions = [
        DecisionPayload(
            symbol="BTC-USDT-SWAP",
            action=DecisionAction.BUY,
            size_pct=10,
            confidence=0.8,
            rationale="go long",
            chain_of_thought="Reasoning A",
        ),
        DecisionPayload(
            symbol="ETH-USDT-SWAP",
            action=DecisionAction.SELL,
            size_pct=5,
            confidence=0.6,
            rationale="hedge",
            chain_of_thought="Reasoning B",
        ),
    ]
    pipeline_result = DecisionPipelineResult(
        prompt="full prompt",
        response=DecisionResult(decisions=decisions, raw_json="[]", tool_payload_json="[]"),
        generated_at=datetime.now(timezone.utc),
        portfolio_id="11111111-1111-1111-1111-111111111111",
        run_id="22222222-2222-2222-2222-222222222222",
        tool_cache_snapshot=[],
        agent_trace=[],
    )

    inserted_ids = await persist_decision_logs(
        result=pipeline_result,
        portfolio_id=pipeline_result.portfolio_id,
        runtime_mode="paper",
    )

    assert inserted_ids == ["dec-1", "dec-2"]
    assert len(conn.prompt_rows) == 2  # prompt + cot
    assert len(conn.decision_rows) == 2


@pytest.mark.asyncio
async def test_persist_decision_logs_falls_back_to_db_id(monkeypatch):
    conn = _StubConnection()
    stub_db = _StubDB(conn)
    monkeypatch.setattr(
        "autotrade_service.persistence.decision_logs.get_db",
        lambda: stub_db,
    )

    async def fake_fetch_active_portfolio_id(conn=None):
        return "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    monkeypatch.setattr(
        decision_logs_module,
        "fetch_active_portfolio_id",
        fake_fetch_active_portfolio_id,
    )

    decisions = [
        DecisionPayload(
            symbol="BTC-USDT-SWAP",
            action=DecisionAction.BUY,
            size_pct=10,
            confidence=0.8,
            rationale="go long",
        )
    ]
    pipeline_result = DecisionPipelineResult(
        prompt="full prompt",
        response=DecisionResult(decisions=decisions, raw_json="[]", tool_payload_json="[]"),
        generated_at=datetime.now(timezone.utc),
        portfolio_id="okx-demo",
        run_id="33333333-3333-3333-3333-333333333333",
        tool_cache_snapshot=[],
        agent_trace=[],
    )

    inserted_ids = await persist_decision_logs(
        result=pipeline_result,
        portfolio_id=pipeline_result.portfolio_id,
        runtime_mode="paper",
    )

    assert inserted_ids == ["dec-1"]
    assert conn.decision_rows[0][1][0] == "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


@pytest.mark.asyncio
async def test_persist_decision_logs_preserves_action(monkeypatch):
    conn = _StubConnection()
    stub_db = _StubDB(conn)
    monkeypatch.setattr(
        "autotrade_service.persistence.decision_logs.get_db",
        lambda: stub_db,
    )

    decisions = [
        DecisionPayload(
            symbol="BTC-USDT-SWAP",
            action=DecisionAction.CLOSE,
            size_pct=10,
        )
    ]
    pipeline_result = DecisionPipelineResult(
        prompt="prompt",
        response=DecisionResult(decisions=decisions, raw_json="[]", tool_payload_json="[]"),
        generated_at=datetime.now(timezone.utc),
        portfolio_id="11111111-1111-1111-1111-111111111111",
        run_id="33333333-3333-3333-3333-333333333333",
        tool_cache_snapshot=[],
        agent_trace=[],
    )

    monkeypatch.setattr(
        "autotrade_service.persistence.decision_logs.fetch_active_portfolio_id",
        lambda conn=None: pipeline_result.portfolio_id,
    )

    inserted_ids = await persist_decision_logs(
        result=pipeline_result,
        portfolio_id=pipeline_result.portfolio_id,
        runtime_mode="paper",
    )

    assert inserted_ids == ["dec-1"]
    _, params = conn.decision_rows[0]
    assert params[3] == "close"

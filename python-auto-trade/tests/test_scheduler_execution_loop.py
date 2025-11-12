import asyncio
import json
import logging
from datetime import datetime, timezone

import pytest

from autotrade_service.config import Settings
from autotrade_service.llm.schemas import DecisionAction, DecisionPayload, DecisionResult
from autotrade_service.pipelines.decision_pipeline import DecisionPipelineResult
from autotrade_service.schedulers.decision_runner import execute_decision_cycle


class _StubPipeline:
    def __init__(self, result: DecisionPipelineResult | None):
        self._result = result

    async def run_once(self, cached_market_data=None):
        await asyncio.sleep(0)  # ensure scheduling path exercised
        return self._result


class _FakeBroker:
    def __init__(self):
        self.executions: list[tuple[list[DecisionPayload], dict[str, float]]] = []
        self.mark_calls: list[dict[str, float]] = []
        self.feedback_calls = 0

    async def execute(self, decisions, market_snapshots, **kwargs):
        self.executions.append((list(decisions), dict(market_snapshots)))
        return [f"Executed {decisions[0].symbol}"]

    async def process_pending_feedback(self):
        self.feedback_calls += 1

    async def mark_to_market(self, snapshots):
        self.mark_calls.append(dict(snapshots))

    def get_portfolio_snapshot(self):
        return {"portfolio_id": "okx-demo", "drawdown_pct": 0.042}


@pytest.mark.asyncio
async def test_execute_decision_cycle_runs_full_flow(monkeypatch):
    decision = DecisionPayload(
        symbol="BTC-USDT-SWAP",
        action=DecisionAction.BUY,
        quantity=0.1,
        confidence=0.75,
    )
    pipeline_result = DecisionPipelineResult(
        prompt="stub prompt",
        response=DecisionResult(decisions=[decision], raw_json="[]", tool_payload_json="[]"),
        generated_at=datetime.now(timezone.utc),
        portfolio_id="portfolio-okx",
        run_id="run-123",
        tool_cache_snapshot=[],
        agent_trace=[
            {
                "message_type": "ToolMessage",
                "tool_name": "live_market_data",
                "content": json.dumps({"symbol": "BTC-USDT-SWAP", "last_price": 20050.0}),
            }
        ],
    )

    fake_pipeline = _StubPipeline(pipeline_result)
    fake_broker = _FakeBroker()
    drawdown_values: list[float] = []
    test_settings = Settings()
    test_settings.feedback_loop_enabled = False
    test_settings.deepseek_api_key = "test-key"
    test_settings.symbols = ["BTC-USDT-SWAP"]
    test_settings.market_data_symbols = ["BTC-USDT-SWAP"]
    test_settings.llm_trading_symbols = ["BTC-USDT-SWAP"]
    test_settings.okx_api_key = "demo"
    test_settings.okx_secret_key = "demo"
    test_settings.okx_passphrase = "demo"

    async def fake_runtime_mode(settings):
        return "paper"

    async def fake_persist_decision_logs(**kwargs):
        fake_persist_decision_logs.called_with = kwargs  # type: ignore[attr-defined]
        return ["dec-abc"]

    monkeypatch.setattr(
        "autotrade_service.schedulers.decision_runner.persist_decision_logs",
        fake_persist_decision_logs,
    )
    monkeypatch.setattr(
        "autotrade_service.pipelines.get_decision_pipeline",
        lambda: fake_pipeline,
    )
    async def fake_build_broker(**kwargs):
        return fake_broker

    monkeypatch.setattr(
        "autotrade_service.schedulers.decision_runner.build_broker",
        fake_build_broker,
    )
    monkeypatch.setattr(
        "autotrade_service.schedulers.decision_runner.get_runtime_mode",
        fake_runtime_mode,
    )
    monkeypatch.setattr(
        "autotrade_service.schedulers.decision_runner.update_portfolio_drawdown",
        lambda value: drawdown_values.append(value),
    )
    monkeypatch.setattr(
        "autotrade_service.schedulers.decision_runner.get_settings",
        lambda: test_settings,
    )

    result = await execute_decision_cycle(logger=logging.getLogger("test"))

    assert result == {"portfolio_id": "okx-demo", "drawdown_pct": 0.042}
    assert len(fake_broker.executions) == 1
    decisions, market_snapshots = fake_broker.executions[0]
    assert decisions[0].symbol == "BTC-USDT-SWAP"
    assert market_snapshots["BTC-USDT-SWAP"] == 20050.0
    assert fake_broker.feedback_calls == 1
    assert fake_broker.mark_calls[0]["BTC-USDT-SWAP"] == 20050.0
    assert drawdown_values == [pytest.approx(0.042, rel=1e-6)]
    assert hasattr(fake_persist_decision_logs, "called_with")
    assert fake_persist_decision_logs.called_with["portfolio_id"] == "portfolio-okx"  # type: ignore[attr-defined]
    assert decision.decision_log_id == "dec-abc"

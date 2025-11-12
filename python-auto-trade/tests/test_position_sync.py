import pytest

from autotrade_service.position_sync import PositionSyncService, refresh_portfolio_snapshot
from autotrade_service.repositories import AutoTradePortfolioSnapshot


@pytest.mark.asyncio
async def test_position_sync_service_delegates_to_refresh(monkeypatch):
    service = PositionSyncService()

    called = {}

    async def fake_refresh(**kwargs):
        called.update(kwargs)

    monkeypatch.setattr(
        "autotrade_service.position_sync.refresh_portfolio_snapshot",
        fake_refresh,
    )

    await service.sync_once()
    assert called


@pytest.mark.asyncio
async def test_refresh_portfolio_snapshot_skips_simulator(monkeypatch):
    async def fake_mode(settings=None):
        return "simulator"

    async def fake_fetch():  # pragma: no cover - should not be invoked
        raise AssertionError("fetch_latest_portfolio should not run in simulator mode")

    monkeypatch.setattr("autotrade_service.position_sync.get_runtime_mode", fake_mode)
    monkeypatch.setattr("autotrade_service.position_sync.fetch_latest_portfolio", fake_fetch)

    snapshot = await refresh_portfolio_snapshot(broadcast=True)
    assert snapshot is None


@pytest.mark.asyncio
async def test_refresh_portfolio_snapshot_broadcasts_payload(monkeypatch):
    async def fake_mode(settings=None):
        return "paper"

    snapshot = AutoTradePortfolioSnapshot(
        portfolio_id="okx-demo",
        automation_enabled=True,
        mode="OKX Demo",
        available_cash=100.0,
        equity=150.0,
        total_pnl=10.0,
        pnl_pct=5.0,
        sharpe=0.0,
        drawdown_pct=0.0,
        last_run_at="2025-01-01T00:00:00Z",
        next_run_in_minutes=5,
        positions=[],
        closed_positions=[],
        decisions=[],
        events=[],
    )

    async def fake_fetch():
        return snapshot

    captured = {}

    async def fake_broadcast(payload):
        captured.update(payload)

    monkeypatch.setattr("autotrade_service.position_sync.get_runtime_mode", fake_mode)
    monkeypatch.setattr("autotrade_service.position_sync.fetch_latest_portfolio", fake_fetch)
    monkeypatch.setattr(
        "autotrade_service.position_sync.connection_manager.broadcast_portfolio",
        fake_broadcast,
    )

    result = await refresh_portfolio_snapshot(broadcast=True)

    assert result is snapshot
    assert captured["portfolioId"] == "okx-demo"


@pytest.mark.asyncio
async def test_refresh_portfolio_snapshot_can_skip_broadcast(monkeypatch):
    async def fake_mode(settings=None):
        return "paper"

    snapshot = AutoTradePortfolioSnapshot(
        portfolio_id="okx-demo",
        automation_enabled=True,
        mode="OKX Demo",
        available_cash=100.0,
        equity=150.0,
        total_pnl=10.0,
        pnl_pct=5.0,
        sharpe=0.0,
        drawdown_pct=0.0,
        last_run_at="2025-01-01T00:00:00Z",
        next_run_in_minutes=5,
        positions=[],
        closed_positions=[],
        decisions=[],
        events=[],
    )

    async def fake_fetch():
        return snapshot

    async def fake_broadcast(payload):  # pragma: no cover - should not run
        raise AssertionError("broadcast should be skipped")

    monkeypatch.setattr("autotrade_service.position_sync.get_runtime_mode", fake_mode)
    monkeypatch.setattr("autotrade_service.position_sync.fetch_latest_portfolio", fake_fetch)
    monkeypatch.setattr(
        "autotrade_service.position_sync.connection_manager.broadcast_portfolio",
        fake_broadcast,
    )

    result = await refresh_portfolio_snapshot(broadcast=False)
    assert result is snapshot

import pytest

from autotrade_service.repositories import (
    AutoTradeExitPlan,
    AutoTradePortfolioSnapshot,
    AutoTradePosition,
    persist_portfolio_snapshot,
)


class DummyConn:
    def __init__(self):
        self.executed = []

    async def execute(self, query, *args):
        self.executed.append((query.strip(), args))

    async def executemany(self, query, rows):
        self.executed.append((query.strip(), rows))


class DummyDB:
    is_connected = True

    def __init__(self):
        self.conn = DummyConn()

    def acquire(self):
        class _Ctx:
            async def __aenter__(self_inner):
                return self.conn

            async def __aexit__(self_inner, exc_type, exc, tb):
                return False

        return _Ctx()


@pytest.mark.asyncio
async def test_persist_portfolio_snapshot_inserts_positions(monkeypatch):
    dummy_db = DummyDB()
    monkeypatch.setattr("autotrade_service.repositories.get_db", lambda: dummy_db)

    snapshot = AutoTradePortfolioSnapshot(
        portfolio_id="demo",
        automation_enabled=True,
        mode="OKX Demo Trading",
        available_cash=100.0,
        equity=200.0,
        total_pnl=10.0,
        pnl_pct=5.0,
        sharpe=0.0,
        drawdown_pct=0.0,
        last_run_at="2025-11-08T00:00:00Z",
        next_run_in_minutes=5,
        positions=[
            AutoTradePosition(
                symbol="BTC-USDT-SWAP",
                quantity=1.0,
                entry_price=100.0,
                mark_price=110.0,
                pnl=10.0,
                pnl_pct=10.0,
                leverage=1.0,
                confidence=0.0,
                exit_plan=AutoTradeExitPlan(profit_target=120.0, stop_loss=90.0, invalidation=""),
            )
        ],
        closed_positions=[],
        decisions=[],
        events=[],
    )

    await persist_portfolio_snapshot(snapshot, runtime_mode="paper")
    assert dummy_db.conn.executed  # at least one query executed

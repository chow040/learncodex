import asyncio

import pytest

from autotrade_service.brokers.okx_demo import OKXDemoBroker
from autotrade_service.llm.schemas import DecisionAction, DecisionPayload


class FakeOKXClient:
    def __init__(self):
        self.orders: list[dict] = []
        self.reject = False

    async def create_order(self, symbol, order_type, side, amount, price, params):
        if self.reject:
            return {"status": "rejected"}
        entry = {
            "symbol": symbol,
            "type": order_type,
            "side": side,
            "amount": amount,
            "price": price,
            "params": params,
            "id": f"order-{len(self.orders)}",
        }
        self.orders.append(entry)
        return entry

    async def cancel_order(self, order_id, symbol=None):
        return {"id": order_id, "symbol": symbol}

    async def edit_order(self, order_id, symbol, amount=None, price=None, params=None):
        return {"id": order_id, "symbol": symbol, "amount": amount, "price": price, "params": params}

    async def fetch_order(self, order_id, symbol=None):
        return {"id": order_id, "symbol": symbol}

    async def fetch_open_orders(self, symbol=None):
        return [{"symbol": symbol or "BTC/USDT"}]

    async def fetch_balance(self):
        return {"free": {"USDT": 1000}}

    async def fetch_positions(self):
        return [{"symbol": "BTC-USDT-SWAP", "size": 1}]

    async def fetch_trades(self, symbol=None, since=None, limit=None):
        return [{"symbol": symbol, "since": since, "limit": limit, "side": "buy", "amount": 1.0, "price": 100.0}]


class StubOutcomeTracker:
    def __init__(self):
        self.entries = []
        self.exits = []

    def register_position_entry(
        self,
        decision_id,
        symbol,
        action,
        entry_price,
        quantity,
        rationale,
        rule_ids,
        portfolio_id=None,
    ):
        self.entries.append((symbol, action, entry_price, quantity))

    async def register_position_exit(self, symbol, exit_price, exit_action, exit_reason="Manual"):
        self.exits.append((symbol, exit_price, exit_action, exit_reason))


@pytest.mark.asyncio
async def test_okx_demo_broker_executes_buy_with_quantity():
    client = FakeOKXClient()
    broker = OKXDemoBroker(client, settings=None)
    decision = DecisionPayload(
        symbol="BTC-USDT-SWAP",
        action=DecisionAction.BUY,
        size_pct=None,
        quantity=0.1,
        confidence=0.8,
    )
    messages = await broker.execute([decision], {"BTC-USDT-SWAP": 20000.0})

    assert "Submitted buy order" in messages[0]
    assert client.orders[0]["symbol"] == "BTC/USDT:USDT"
    executions = broker.get_recent_executions()
    assert executions[-1]["order_id"] == client.orders[0]["id"]
    stats = broker.get_latency_stats()
    assert stats is not None
    assert stats["count"] >= 1


@pytest.mark.asyncio
async def test_okx_demo_broker_raises_on_rejection():
    client = FakeOKXClient()
    client.reject = True
    broker = OKXDemoBroker(client, settings=None)
    decision = DecisionPayload(
        symbol="BTC-USDT-SWAP",
        action=DecisionAction.BUY,
        quantity=0.1,
        confidence=0.5,
    )

    messages = await broker.execute([decision], {"BTC-USDT-SWAP": 20000})
    assert "rejected" in messages[0].lower()


@pytest.mark.asyncio
async def test_okx_demo_broker_exposes_order_helpers():
    client = FakeOKXClient()
    broker = OKXDemoBroker(client, settings=None)
    order = await broker.place_order(symbol="BTC/USDT", side="buy", amount=1)
    assert order["symbol"] == "BTC/USDT"

    edited = await broker.modify_order(order["id"], symbol="BTC/USDT", amount=2, price=21000)
    assert edited["amount"] == 2

    cancelled = await broker.cancel_order(order["id"], symbol="BTC/USDT")
    assert cancelled["id"] == order["id"]

    fetched = await broker.fetch_order(order["id"], symbol="BTC/USDT")
    assert fetched["id"] == order["id"]

    open_orders = await broker.fetch_open_orders("BTC/USDT")
    assert open_orders[0]["symbol"] == "BTC/USDT"

    balance = await broker.fetch_balance()
    assert balance["free"]["USDT"] == 1000

    positions = await broker.fetch_positions()
    assert positions[0]["symbol"] == "BTC-USDT-SWAP"

    trades = await broker.fetch_trade_history("BTC/USDT", since=123, limit=5)
    assert trades[0]["limit"] == 5


@pytest.mark.asyncio
async def test_okx_demo_broker_notifies_outcome_tracker():
    client = FakeOKXClient()
    tracker = StubOutcomeTracker()
    broker = OKXDemoBroker(client, settings=None, outcome_tracker=tracker)

    buy_decision = DecisionPayload(
        symbol="BTC-USDT-SWAP",
        action=DecisionAction.BUY,
        quantity=0.2,
        confidence=0.7,
    )
    sell_decision = DecisionPayload(
        symbol="BTC-USDT-SWAP",
        action=DecisionAction.SELL,
        quantity=0.2,
        confidence=0.6,
    )

    await broker.execute([buy_decision], {"BTC-USDT-SWAP": 20000})
    assert tracker.entries

    await broker.execute([sell_decision], {"BTC-USDT-SWAP": 21000})
    assert tracker.exits


@pytest.mark.asyncio
async def test_okx_demo_broker_persists_closed_position(monkeypatch):
    client = FakeOKXClient()

    async def fake_fetch_trades(symbol):
        return [
            {"side": "buy", "amount": 1.0, "price": 100.0},
            {"side": "sell", "amount": 1.0, "price": 110.0},
        ]

    client.fetch_trades = fake_fetch_trades  # type: ignore[assignment]

    captured = {}

    async def fake_persist(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr("autotrade_service.brokers.okx_demo.persist_closed_position", fake_persist)

    broker = OKXDemoBroker(client, settings=None)
    decision = DecisionPayload(
        symbol="BTC-USDT-SWAP",
        action=DecisionAction.SELL,
        quantity=1.0,
        confidence=0.6,
    )
    await broker.execute([decision], {"BTC-USDT-SWAP": 110.0})

    assert captured["symbol"] == "BTC-USDT-SWAP"
    assert captured["pnl"] == pytest.approx(10.0)


@pytest.mark.asyncio
async def test_okx_demo_broker_gets_portfolio_snapshot(monkeypatch):
    client = FakeOKXClient()
    broker = OKXDemoBroker(client, settings=None)

    expected_snapshot = {"portfolioId": "okx-demo"}

    async def fake_fetch():
        return expected_snapshot

    monkeypatch.setattr("autotrade_service.brokers.okx_demo.fetch_latest_portfolio", fake_fetch)

    snapshot = await broker.get_portfolio_snapshot()
    assert snapshot == expected_snapshot

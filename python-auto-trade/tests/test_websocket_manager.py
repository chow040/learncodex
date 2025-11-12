import asyncio

import pytest

from autotrade_service.websocket.market_data_ws import ConnectionManager


class DummyWebSocket:
    def __init__(self, fail: bool = False):
        self.accepted = False
        self.fail = fail
        self.messages = []
        self.closed = False

    async def accept(self):  # pragma: no cover - trivial
        self.accepted = True

    async def send_json(self, message):
        if self.fail:
            raise RuntimeError("send failed")
        self.messages.append(message)

    def close(self):
        self.closed = True


@pytest.mark.asyncio
async def test_connection_manager_broadcasts_messages():
    manager = ConnectionManager()
    ws = DummyWebSocket()
    await manager.connect(ws)

    await manager.broadcast_market_data({"BTC": {"price": 1}})

    assert ws.accepted
    assert len(ws.messages) == 1
    assert ws.messages[0]["data"]["BTC"]["price"] == 1


@pytest.mark.asyncio
async def test_connection_manager_removes_failed_connection():
    manager = ConnectionManager()
    ws_ok = DummyWebSocket()
    ws_fail = DummyWebSocket(fail=True)
    await manager.connect(ws_ok)
    await manager.connect(ws_fail)

    await manager.broadcast_market_data({"ETH": {"price": 2}})

    assert ws_ok.messages
    assert ws_fail.messages == []
    assert ws_fail not in manager.active_connections


@pytest.mark.asyncio
async def test_connection_manager_multiple_connections():
    manager = ConnectionManager()
    sockets = [DummyWebSocket() for _ in range(5)]
    for ws in sockets:
        await manager.connect(ws)

    await manager.broadcast_market_data({"SOL": {"price": 30}})

    for ws in sockets:
        assert ws.accepted
        assert ws.messages and ws.messages[0]["data"]["SOL"]["price"] == 30


@pytest.mark.asyncio
async def test_connection_manager_reconnect_flow():
    manager = ConnectionManager()
    ws = DummyWebSocket(fail=True)
    await manager.connect(ws)

    await manager.broadcast_market_data({"DOGE": {"price": 0.1}})
    assert ws not in manager.active_connections

    ws_reconnect = DummyWebSocket()
    await manager.connect(ws_reconnect)
    await manager.broadcast_market_data({"DOGE": {"price": 0.2}})

    assert ws_reconnect.messages[0]["data"]["DOGE"]["price"] == 0.2

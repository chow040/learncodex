from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Set

from fastapi import WebSocket, WebSocketDisconnect


class ConnectionManager:
    """Tracks WebSocket connections for streaming market data."""

    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()
        self.logger = logging.getLogger("autotrade.websocket.market_data")

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)
        self.logger.info("Client connected (total=%s)", len(self.active_connections))

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.discard(websocket)
            self.logger.info("Client disconnected (total=%s)", len(self.active_connections))

    async def broadcast_market_data(self, market_snapshot: Dict[str, Any]) -> None:
        if not self.active_connections:
            return
        message = {
            "type": "market_update",
            "data": market_snapshot,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        disconnected: Set[WebSocket] = set()
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as exc:  # pragma: no cover - network failure path
                self.logger.warning("Failed to send market update: %s", exc)
                disconnected.add(connection)
        for connection in disconnected:
            self.disconnect(connection)

    async def broadcast_portfolio(self, portfolio_snapshot: Dict[str, Any]) -> None:
        if not self.active_connections:
            return
        message = {
            "type": "portfolio_update",
            "data": portfolio_snapshot,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        disconnected: Set[WebSocket] = set()
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as exc:  # pragma: no cover
                self.logger.warning("Failed to send portfolio update: %s", exc)
                disconnected.add(connection)
        for connection in disconnected:
            self.disconnect(connection)

    async def send_personal_message(self, message: Dict[str, Any], websocket: WebSocket) -> None:
        try:
            await websocket.send_json(message)
        except Exception as exc:  # pragma: no cover - network failure path
            self.logger.error("Failed to send message to client: %s", exc)


connection_manager = ConnectionManager()


__all__ = ["ConnectionManager", "connection_manager"]

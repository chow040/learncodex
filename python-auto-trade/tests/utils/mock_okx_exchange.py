from __future__ import annotations

import itertools
from typing import Any, Dict, List, Optional


class MockOKXExchange:
    """
    Lightweight stand-in for ccxt.okx used in integration tests.

    Records orders, balances, and positions entirely in memory so tests can run without
    hitting the real OKX endpoints.
    """

    _id_iter = itertools.count(1)

    def __init__(self) -> None:
        self.sandbox_mode = False
        self.loaded_markets = False
        self.orders: List[Dict[str, Any]] = []
        self.positions: Dict[str, float] = {}
        self.balance: Dict[str, float] = {"USDT": 10_000.0}

    def set_sandbox_mode(self, flag: bool) -> None:  # pragma: no cover - simple setter
        self.sandbox_mode = flag

    async def load_markets(self) -> None:
        self.loaded_markets = True

    async def close(self) -> None:  # pragma: no cover - included for parity
        return None

    async def create_order(
        self,
        symbol: str,
        order_type: str,
        side: str,
        amount: float,
        price: Optional[float],
        params: Dict[str, Any],
    ) -> Dict[str, Any]:
        order_id = f"order-{next(self._id_iter)}"
        fill_price = price or 20_000.0
        if side == "buy":
            self.positions[symbol] = self.positions.get(symbol, 0.0) + amount
            self.balance["USDT"] -= fill_price * amount
        else:
            self.positions[symbol] = self.positions.get(symbol, 0.0) - amount
            self.balance["USDT"] += fill_price * amount
        payload = {
            "id": order_id,
            "symbol": symbol,
            "type": order_type,
            "side": side,
            "amount": amount,
            "price": fill_price,
            "status": "filled",
            "info": {"avgPx": fill_price, "state": "filled"},
        }
        self.orders.append(payload)
        return payload

    async def cancel_order(self, order_id: str, symbol: Optional[str] = None) -> Dict[str, Any]:
        return {"id": order_id, "symbol": symbol, "status": "canceled"}

    async def edit_order(
        self,
        order_id: str,
        symbol: str,
        *,
        amount: Optional[float] = None,
        price: Optional[float] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return {
            "id": order_id,
            "symbol": symbol,
            "amount": amount,
            "price": price,
            "params": params or {},
        }

    async def fetch_order(self, order_id: str, symbol: Optional[str] = None) -> Dict[str, Any]:
        for order in self.orders:
            if order["id"] == order_id:
                return order
        return {"id": order_id, "symbol": symbol, "status": "closed"}

    async def fetch_open_orders(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        return [order for order in self.orders if order.get("status") == "open" and (symbol is None or order["symbol"] == symbol)]

    async def fetch_balance(self) -> Dict[str, Any]:
        return {"free": self.balance.copy(), "total": self.balance.copy()}

    async def fetch_positions(self) -> List[Dict[str, Any]]:
        return [
            {"symbol": symbol, "size": size, "entryPrice": 20_000.0}
            for symbol, size in self.positions.items()
            if size
        ]

    async def fetch_my_trades(
        self,
        symbol: Optional[str],
        since: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        trades = []
        for order in self.orders:
            if symbol and order["symbol"] != symbol:
                continue
            trades.append(
                {
                    "symbol": order["symbol"],
                    "side": order["side"],
                    "amount": order["amount"],
                    "price": order["price"],
                    "timestamp": since or 0,
                }
            )
        if limit is not None:
            trades = trades[:limit]
        return trades

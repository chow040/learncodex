from __future__ import annotations

import logging
import time
from typing import Any, Mapping, Sequence

from ..llm.schemas import DecisionAction, DecisionPayload
from ..providers import OKXClient
from ..config import Settings, get_settings
from .base import BaseBroker
from ..feedback.outcome_tracker import TradeOutcomeTracker
from ..metrics import record_okx_order_latency, get_okx_order_latency_stats
from ..repositories import persist_closed_position, fetch_latest_portfolio
from ..observability import record_okx_order_metric

log = logging.getLogger("autotrade.broker.okx_demo")


class OKXDemoBroker(BaseBroker):
    """
    Broker implementation that routes trades to the OKX demo environment via OKXClient.

    The class provides high-level helpers for order placement, cancellation, balance queries,
    and exposes a BaseBroker-compatible `execute` method so it can integrate with the scheduler.
    """

    def __init__(
        self,
        client: OKXClient,
        *,
        settings: Settings | None = None,
        default_order_type: str = "market",
        outcome_tracker: TradeOutcomeTracker | None = None,
    ) -> None:
        self._client = client
        self._settings = settings or get_settings()
        self._symbol_map = (self._settings.ccxt_symbol_map or {}).copy()
        self._default_order_type = default_order_type
        self._executions: list[dict] = []
        self._outcome_tracker = outcome_tracker

    async def execute(
        self,
        decisions: Sequence[DecisionPayload],
        market_snapshots: Mapping[str, float],
        **kwargs,
    ) -> list[str]:
        messages: list[str] = []
        for decision in decisions:
            try:
                messages.append(await self._handle_decision(decision, market_snapshots))
            except Exception as exc:  # pragma: no cover - network errors handled upstream
                msg = f"Failed to execute {decision.symbol}: {exc}"
                log.error(msg, exc_info=True)
                record_okx_order_metric("failed")
                messages.append(msg)
        return messages

    async def _handle_decision(
        self,
        decision: DecisionPayload,
        market_snapshots: Mapping[str, float],
    ) -> str:
        action = decision.action
        if isinstance(action, str):
            action = DecisionAction(action.upper())

        if action not in (DecisionAction.BUY, DecisionAction.SELL):
            return f"Action {action} for {decision.symbol} not supported by OKX broker yet"

        ccxt_symbol = self._resolve_ccxt_symbol(decision.symbol)
        if not ccxt_symbol:
            return f"No CCXT mapping for symbol {decision.symbol}; skipping execution"

        price = market_snapshots.get(decision.symbol)
        quantity = self._determine_quantity(decision, price)
        if quantity is None or quantity <= 0:
            return f"No valid quantity for {decision.symbol}; skipping execution"

        side = "buy" if action == DecisionAction.BUY else "sell"
        started = time.perf_counter()
        order = await self.place_order(
            symbol=ccxt_symbol,
            side=side,
            amount=quantity,
            order_type=self._default_order_type,
        )
        duration_ms = (time.perf_counter() - started) * 1000
        record_okx_order_latency(duration_ms)
        log.debug(
            "OKX order latency %.2fms (symbol=%s, side=%s, order_id=%s)",
            duration_ms,
            decision.symbol,
            side,
            order.get("id"),
        )
        if not self._is_order_accepted(order):
            record_okx_order_metric("rejected", duration_ms)
            raise RuntimeError(f"OKX rejected order for {decision.symbol}: {order}")
        record_okx_order_metric("success", duration_ms)
        fill_price = self._extract_fill_price(order) or price or 0.0
        self._record_execution(order, decision.symbol, side, quantity)
        await self._notify_feedback(decision, action, fill_price, quantity)
        if action in (DecisionAction.SELL, DecisionAction.CLOSE):
            await self._capture_realized_pnl(decision.symbol)
        return f"Submitted {side} order on {ccxt_symbol} (order_id={order.get('id')})"

    def _resolve_ccxt_symbol(self, symbol: str) -> str | None:
        symbol = symbol.upper()
        if self._symbol_map:
            return self._symbol_map.get(symbol)
        # Fall back to simple translation for spot pairs (e.g., BTC-USDT -> BTC/USDT)
        if "-" in symbol:
            base, quote, *_ = symbol.split("-")
            return f"{base}/{quote}"
        return symbol

    def _determine_quantity(self, decision: DecisionPayload, price: float | None) -> float | None:
        if decision.quantity is not None:
            return float(decision.quantity)
        if decision.size_pct is not None and price and price > 0:
            cash = self._settings.simulation_starting_cash  # placeholder until balance integration
            notional = cash * (decision.size_pct / 100.0)
            return notional / price
        return None

    async def place_order(
        self,
        *,
        symbol: str,
        side: str,
        amount: float,
        order_type: str = "market",
        price: float | None = None,
        params: dict | None = None,
    ) -> dict:
        return await self._client.create_order(symbol, order_type, side, amount, price, params or {})

    def _is_order_accepted(self, order: dict[str, Any]) -> bool:
        if not isinstance(order, dict):
            return False
        status = (order.get("status") or order.get("info", {}).get("state") or "").lower()
        if status in {"canceled", "cancelled", "rejected", "error"}:
            return False
        return bool(order.get("id"))

    async def cancel_order(self, order_id: str, symbol: str | None = None) -> dict:
        return await self._client.cancel_order(order_id, symbol)

    async def modify_order(
        self,
        order_id: str,
        *,
        symbol: str,
        amount: float | None = None,
        price: float | None = None,
        params: dict | None = None,
    ) -> dict:
        return await self._client.edit_order(order_id, symbol, amount=amount, price=price, params=params or {})

    async def fetch_order(self, order_id: str, symbol: str | None = None) -> dict:
        return await self._client.fetch_order(order_id, symbol)

    async def fetch_open_orders(self, symbol: str | None = None) -> list[dict]:
        return await self._client.fetch_open_orders(symbol)

    async def fetch_balance(self) -> dict:
        return await self._client.fetch_balance()

    async def fetch_positions(self) -> list[dict]:
        return await self._client.fetch_positions()

    async def fetch_trade_history(self, symbol: str | None = None, *, since: int | None = None, limit: int | None = None):
        return await self._client.fetch_trades(symbol, since=since, limit=limit)

    def get_recent_executions(self) -> list[dict]:
        """Return a copy of the recorded execution payloads."""
        return list(self._executions)

    def get_latency_stats(self) -> dict[str, float] | None:
        return get_okx_order_latency_stats()

    async def get_portfolio_snapshot(self):
        return await fetch_latest_portfolio()

    def _record_execution(self, order: dict, logical_symbol: str, side: str, quantity: float) -> None:
        payload = {
            "order_id": order.get("id"),
            "symbol": logical_symbol,
            "side": side,
            "quantity": quantity,
            "price": order.get("price"),
            "raw": order,
        }
        self._executions.append(payload)
        if len(self._executions) > 1000:
            self._executions.pop(0)

    def _extract_fill_price(self, order: dict[str, Any]) -> float | None:
        candidates = [
            order.get("price"),
            order.get("average"),
            order.get("info", {}).get("avgPx"),
            order.get("info", {}).get("fillPx"),
            order.get("info", {}).get("px"),
        ]
        for value in candidates:
            if isinstance(value, (int, float)):
                return float(value)
            if isinstance(value, str):
                try:
                    return float(value)
                except ValueError:
                    continue
        return None

    async def _notify_feedback(
        self,
        decision: DecisionPayload,
        action: DecisionAction,
        fill_price: float,
        quantity: float,
    ) -> None:
        if not self._outcome_tracker:
            return
        rationale = decision.rationale or ""
        if action == DecisionAction.BUY:
            self._outcome_tracker.register_position_entry(
                decision_id=None,
                symbol=decision.symbol,
                action=action.value,
                entry_price=fill_price,
                quantity=quantity,
                rationale=rationale,
                rule_ids=[],
                portfolio_id=None,
            )
        elif action in (DecisionAction.SELL, DecisionAction.CLOSE):
            await self._outcome_tracker.register_position_exit(
                decision.symbol,
                exit_price=fill_price,
                exit_action=action.value,
                exit_reason="LLM decision",
            )

    async def _capture_realized_pnl(self, symbol: str) -> None:
        try:
            trades = await self._client.fetch_trades(symbol)
        except Exception as exc:
            log.debug("Failed to fetch trades for %s: %s", symbol, exc)
            return

        if not trades:
            return

        buys = [t for t in trades if (t.get("side") or "").lower() == "buy"]
        sells = [t for t in trades if (t.get("side") or "").lower() == "sell"]
        if not buys or not sells:
            return

        entry_price = _avg_fill_price(buys)
        exit_price = _avg_fill_price(sells)
        quantity = abs(sum(float(t.get("amount") or 0.0) for t in sells))
        pnl = (exit_price - entry_price) * quantity
        pnl_pct = ((exit_price - entry_price) / entry_price * 100.0) if entry_price else 0.0

        await persist_closed_position(
            portfolio_id="okx-demo",
            symbol=symbol,
            quantity=quantity,
            entry_price=entry_price,
            exit_price=exit_price,
            pnl=pnl,
            pnl_pct=pnl_pct,
            leverage=1.0,
            reason="okx-demo",
        )


def _avg_fill_price(trades: list[dict[str, Any]]) -> float:
    total = 0.0
    total_qty = 0.0
    for trade in trades:
        amount = trade.get("amount") or trade.get("info", {}).get("fillSz")
        price = trade.get("price") or trade.get("info", {}).get("fillPx") or trade.get("info", {}).get("avgPx")
        try:
            amount_val = abs(float(amount)) if amount is not None else 0.0
        except (TypeError, ValueError):
            amount_val = 0.0
        try:
            price_val = float(price) if price is not None else 0.0
        except (TypeError, ValueError):
            price_val = 0.0
        total += price_val * amount_val
        total_qty += amount_val
    return total / total_qty if total_qty else 0.0

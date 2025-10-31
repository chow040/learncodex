from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable, Sequence


def _fmt_series(values: Sequence[float]) -> str:
    return json.dumps([round(v, 6) for v in values])


@dataclass(slots=True)
class SymbolHigherTimeframeContext:
    ema20: float
    ema50: float
    atr3: float
    atr14: float
    volume: float
    volume_avg: float
    macd_series: Sequence[float]
    rsi14_series: Sequence[float]


@dataclass(slots=True)
class SymbolContext:
    symbol: str
    current_price: float
    ema20: float
    macd: float
    rsi7: float
    oi_latest: float
    oi_avg: float
    funding: float
    mids: Sequence[float]
    ema20_series: Sequence[float]
    macd_series: Sequence[float]
    rsi7_series: Sequence[float]
    rsi14_series: Sequence[float]
    higher_timeframe: SymbolHigherTimeframeContext | None = None


@dataclass(slots=True)
class PositionContext:
    symbol: str
    quantity: float
    entry_price: float
    current_price: float
    liquidation_price: float | None
    unrealized_pnl: float
    leverage: float
    profit_target: float | None
    stop_loss: float | None
    invalidation_condition: str | None
    confidence: float
    risk_usd: float
    notional_usd: float


@dataclass(slots=True)
class RiskSettingsContext:
    confidence_entry_threshold: float
    max_gross_exposure_pct: float
    min_cash_buffer_pct: float
    max_risk_per_trade_usd: float
    min_entry_notional_usd: float


@dataclass(slots=True)
class AccountContext:
    value: float
    cash: float
    return_pct: float
    sharpe: float
    positions: list[PositionContext] = field(default_factory=list)
    risk: RiskSettingsContext | None = None


@dataclass(slots=True)
class PromptContext:
    minutes_since_start: int
    invocation_count: int
    current_timestamp: datetime
    symbols: list[SymbolContext]
    account: AccountContext


class PromptBuilder:
    def build(self, context: PromptContext) -> str:
        lines: list[str] = []
        lines.append("SESSION CONTEXT")
        lines.append(f"- Minutes since trading started: {context.minutes_since_start}")
        lines.append(f"- Invocation count: {context.invocation_count}")
        lines.append(f"- Current time: {context.current_timestamp.isoformat()}")
        lines.append("")
        lines.append(f"It has been {context.minutes_since_start} minutes since trading began.")
        lines.append(f"You are now being invoked for the {context.invocation_count}-th time.")
        lines.append("Below is the full market, indicator, and account state you must use to reason and decide your next actions.")
        lines.append("")
        lines.append("All intraday data is sampled at 3-minute intervals, ordered OLDEST → NEWEST.")
        lines.append("If a different interval is used for a coin, it is explicitly stated in that section.")
        lines.append("")
        lines.append("=" * 62)
        lines.append("### CURRENT MARKET STATE")
        lines.append("=" * 62)
        lines.append("")
        for symbol_ctx in context.symbols:
            lines.extend(self._build_symbol_section(symbol_ctx))
        lines.append("=" * 62)
        lines.append("### ACCOUNT INFORMATION & PERFORMANCE")
        lines.append("=" * 62)
        lines.append("")
        account = context.account
        lines.append(f"Account Value = {round(account.value, 2)}")
        lines.append(f"Available Cash = {round(account.cash, 2)}")
        lines.append(f"Total Return (%) = {round(account.return_pct, 4)}")
        lines.append(f"Sharpe Ratio = {round(account.sharpe, 4)}")
        lines.append("")
        lines.append("Open Positions:")
        lines.append("[")
        for idx, position in enumerate(account.positions):
            lines.extend(self._build_position_entry(position, is_last=idx == len(account.positions) - 1))
        lines.append("]")
        lines.append("")
        if account.risk:
            risk = account.risk
            lines.append("Risk Settings (read-only):")
            lines.append(f"- confidence_entry_threshold = {risk.confidence_entry_threshold}")
            lines.append(f"- max_gross_exposure_pct = {risk.max_gross_exposure_pct}")
            lines.append(f"- min_cash_buffer_pct = {risk.min_cash_buffer_pct}")
            lines.append(f"- max_risk_per_trade_usd = {risk.max_risk_per_trade_usd}")
            lines.append(f"- min_entry_notional_usd = {risk.min_entry_notional_usd}")
            lines.append("")
        lines.append("=" * 62)
        lines.append("### TASK")
        lines.append("=" * 62)
        lines.append("")
        lines.extend(
            [
                "You must:",
                "1. Review every open position versus its exit plan (profit_target, stop_loss, invalidation_condition).",
                "2. Decide whether to HOLD or CLOSE each one based on 3-minute indicators (price vs EMA20, RSI, MACD).",
                "3. Consider new entries **only if** the coin has **no existing position**, confidence ≥ threshold, free cash ≥ buffer, and exposure ≤ limits.",
                "4. Do not pyramid, scale, or increase size on any existing symbol.",
                "5. If positions already exist in all tradable coins, skip entry evaluation and output only HOLD or CLOSE actions.",
                "6. For HOLD signals, reuse all position fields from account state (quantity, leverage, confidence, risk_usd, profit_target, stop_loss, invalidation_condition).",
                "7. Always emit a HOLD or CLOSE object for every open position each tick, even if nothing changes.",
                "8. Preserve the input order of positions in your OUTPUT.",
                "9. Use “THOUGHT:” for reasoning and “OUTPUT:” for JSON as instructed in the system prompt.",
                "10. Output must be a valid JSON array — no commentary, no extra text.",
                "",
                "End of data.",
            ]
        )
        return "\n".join(lines)

    def _build_symbol_section(self, symbol_ctx: SymbolContext) -> list[str]:
        lines: list[str] = []
        lines.append(f"## {symbol_ctx.symbol}")
        lines.append(f"current_price = {round(symbol_ctx.current_price, 6)}")
        lines.append(f"current_ema20 = {round(symbol_ctx.ema20, 6)}")
        lines.append(f"current_macd = {round(symbol_ctx.macd, 6)}")
        lines.append(f"current_rsi7 = {round(symbol_ctx.rsi7, 6)}")
        lines.append(
            f"Open Interest: Latest = {round(symbol_ctx.oi_latest, 6)}, Average = {round(symbol_ctx.oi_avg, 6)}"
        )
        lines.append(f"Funding Rate: {round(symbol_ctx.funding, 6)}")
        lines.append("")
        lines.append("Intraday (3-min) series:")
        lines.append(f"mid_prices = {_fmt_series(symbol_ctx.mids)}")
        lines.append(f"ema20_series = {_fmt_series(symbol_ctx.ema20_series)}")
        lines.append(f"macd_series = {_fmt_series(symbol_ctx.macd_series)}")
        lines.append(f"rsi7_series = {_fmt_series(symbol_ctx.rsi7_series)}")
        lines.append(f"rsi14_series = {_fmt_series(symbol_ctx.rsi14_series)}")
        lines.append("")
        if symbol_ctx.higher_timeframe:
            htf = symbol_ctx.higher_timeframe
            lines.append("4-hour context:")
            lines.append(f"ema20 = {round(htf.ema20, 6)}, ema50 = {round(htf.ema50, 6)}")
            lines.append(f"atr3 = {round(htf.atr3, 6)}, atr14 = {round(htf.atr14, 6)}")
            lines.append(f"volume = {round(htf.volume, 6)}, avg_volume = {round(htf.volume_avg, 6)}")
            lines.append(f"macd_series = {_fmt_series(htf.macd_series)}")
            lines.append(f"rsi14_series = {_fmt_series(htf.rsi14_series)}")
            lines.append("")
        else:
            lines.append("4-hour context: n/a")
            lines.append("")
        return lines

    def _build_position_entry(self, position: PositionContext, *, is_last: bool) -> list[str]:
        line = json.dumps(
            {
                "symbol": position.symbol,
                "quantity": position.quantity,
                "entry_price": position.entry_price,
                "current_price": position.current_price,
                "liquidation_price": position.liquidation_price,
                "unrealized_pnl": position.unrealized_pnl,
                "leverage": position.leverage,
                "exit_plan": {
                    "profit_target": position.profit_target,
                    "stop_loss": position.stop_loss,
                    "invalidation_condition": position.invalidation_condition,
                },
                "confidence": position.confidence,
                "risk_usd": position.risk_usd,
                "notional_usd": position.notional_usd,
            },
            default=lambda x: x,
        )
        return [f"  {line}{'' if is_last else ','}"]

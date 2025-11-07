from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Sequence

from ..config import get_settings

settings = get_settings()
short_tf = settings.ccxt_short_term_timeframe or "3m"

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
    oi_latest: float = 0.0
    oi_avg: float = 0.0
    oi_contracts: float | None = None
    oi_timestamp: datetime | None = None
    funding_rate: float = 0.0
    funding_rate_pct: float | None = None
    funding_rate_annual_pct: float | None = None
    predicted_funding_rate: float | None = None
    next_funding_time: datetime | None = None
    funding_history: Sequence[float] = field(default_factory=list)
    mids: Sequence[float] = field(default_factory=list)
    ema20_series: Sequence[float] = field(default_factory=list)
    macd_series: Sequence[float] = field(default_factory=list)
    rsi7_series: Sequence[float] = field(default_factory=list)
    rsi14_series: Sequence[float] = field(default_factory=list)
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

"""contruct for user prompt"""
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
        lines.append(f"All intraday data is sampled at {short_tf} intervals, ordered OLDEST → NEWEST.")
        lines.append("If a different interval is used for a coin, it is explicitly stated in that section.")
        lines.append("")
        lines.append("### CURRENT MARKET STATE")
        lines.append("")
        for symbol_ctx in context.symbols:
            lines.extend(self._build_symbol_section(symbol_ctx))
        lines.append("### ACCOUNT INFORMATION & PERFORMANCE ###")
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
        lines.append("### TASK ###")
        lines.append("")
        lines.extend(
            [
                "Act on **every tick** and follow **all rules** below **exactly**.",
                "",
                "--- 1. EXIT EVALUATION (per open position) ---",
                "For each position in input order:",
                "- If **current_price ≥ profit_target** → **CLOSE** (take profit)",
                "- If **current_price ≤ stop_loss** → **CLOSE**",
                "- If **invalidation_condition** is met (e.g., 3-minute candle close below threshold) → **CLOSE**",
                "- Else → **HOLD**",
                "",
                f"Use **{short_tf} chart** for:",
                "  • Price vs EMA20",
                "  • RSI (14)",
                "  • MACD histogram",
                "  • Current risk: unrealized PnL %, stop distance %, ATR%",
                "",
                "--- 2. NEW ENTRY CONDITIONS (LONG only) ---",
                "Consider a new entry **only if ALL** are true:",
                "  - No existing position in the symbol",
                "  - Confidence ≥ 0.60",
                "  - Free cash ≥ 15 % of total account value",
                "  - Portfolio exposure ≤ 80 % of account value",
                "  - Volatility (14-period ATR% **or** 3-candle range%) ≤ 4.0 %",
                "  - Planned risk-reward ≥ 3 : 1",
                "  - Stop distance ≤ 8 % of entry price",
                "",
                "**If entry conditions are NOT met** (e.g., signal too weak, low confidence, high volatility):",
                "  → Output **NO_ENTRY** with rationale explaining why entry was rejected",
                "",
                "--- 3. LEVERAGE & SIZING (new entries only) ---",
                "Signal strength score (0–1):",
                "  • MACD histogram > 0 and rising         → +0.35",
                "  • Price > EMA20 and EMA20 rising       → +0.30",
                "  • RSI 45–65 (neutral zone)            → +0.20",
                "  • Higher-timeframe (1h/4h) trend up   → +0.15",
                "",
                "Volatility penalty:",
                "  • ATR% ≤ 2.0 %   → 0",
                "  • 2.0–4.0 %      → -0.1 per % above 2",
                "  • >4.0 %         → **NO ENTRY**",
                "",
                "Leverage table:",
                "  Strong (score ≥ 0.75, vol ≤ 2 %) → 8–10×",
                "  Moderate (score 0.50–0.74)       → 4–7×",
                "  Weak (score < 0.50 or vol > 4 %) → 2–3×",
                "  Conflicting / high vol           → **NO ENTRY**",
                "",
                "Cap at **configured leverage_cap** (default 10×).",
                "",
                "Position size:",
                "  margin_used = (quantity × entry_price / leverage) ≤ **25 %** of available capital **per symbol**",
                "",
                "--- 4. SAFETY RULES ---",
                "- Never pyramid, scale in, or increase size on existing symbol",
                "- Never open opposite side without first closing",
                "- Never open multiple positions per symbol",
                "- If any indicator is NaN or data missing → default to **HOLD**",
                "- If API error → output **HOLD** for all positions",
                "",
                "--- 5. OUTPUT FORMAT ---",
                "- **THOUGHT:** One block of step-by-step reasoning",
                "- **OUTPUT:** Valid JSON array **only**",
                "- **CRITICAL:** Include a decision for **EVERY symbol** being evaluated (from AUTOTRADE_SYMBOLS config)",
                "- One object per open position **in input order**",
                "- Include **every open position** every tick",
                "- For **HOLD**: reuse all fields from account state",
                '- For **CLOSE**: add `"reason": "profit_target" | "stop_loss" | "invalidation"`',
                '- For **NO_ENTRY**: include rationale explaining why entry was rejected (weak signal, low confidence, etc.)',
                "",
                "Response format:",
                "```json",
                "{",
                '  "decisions": [',
                '    {"symbol":"BTC-USD","action":"NO_ENTRY","confidence":0.25,"rationale":"Signal too weak (MACD negative, price below EMA20)"},',
                '    {"symbol":"ETH-USD","action":"HOLD","quantity":4.87,"leverage":15,...},',
                '    {"symbol":"SOL-USD","action":"CLOSE","reason":"stop_loss","quantity":81.81,...}',
                "  ],",
                '  "model_name": "<exact-model-name-returned-by-you>"',
                "}",
                "```",
                "",
                "Ensure the JSON object always includes both `decisions` and `model_name` keys, and set `model_name` to the deepseek model you are using.",
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
        lines.append(f"Open Interest (USD): Latest = {round(symbol_ctx.oi_latest, 6)}, Average = {round(symbol_ctx.oi_avg, 6)}")
        if symbol_ctx.oi_contracts is not None:
            lines.append(f"Open Interest (contracts): {round(symbol_ctx.oi_contracts, 6)}")
        if symbol_ctx.oi_timestamp is not None:
            lines.append(f"Open Interest Timestamp: {symbol_ctx.oi_timestamp.isoformat()}")
        funding_line = f"Funding Rate (decimal): {round(symbol_ctx.funding_rate, 6)}"
        if symbol_ctx.funding_rate_pct is not None:
            funding_line = f"Funding Rate: {round(symbol_ctx.funding_rate_pct, 6)}% ({round(symbol_ctx.funding_rate, 6)})"
        lines.append(funding_line)
        if symbol_ctx.funding_rate_annual_pct is not None:
            lines.append(f"Funding Rate Annualized: {round(symbol_ctx.funding_rate_annual_pct, 6)}%")
        if symbol_ctx.predicted_funding_rate is not None:
            lines.append(f"Predicted Next Funding Rate: {round(symbol_ctx.predicted_funding_rate, 6)}")
        if symbol_ctx.next_funding_time is not None:
            lines.append(f"Next Funding Time: {symbol_ctx.next_funding_time.isoformat()}")
        if symbol_ctx.funding_history:
            lines.append(f"Funding Rate History (recent): {_fmt_series(symbol_ctx.funding_history)}")
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

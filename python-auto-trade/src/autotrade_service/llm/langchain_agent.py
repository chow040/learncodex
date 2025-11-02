from __future__ import annotations

import json
import logging
from typing import Sequence

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.tools import tool

try:
    from langchain_deepseek import ChatDeepSeek
except ModuleNotFoundError as exc:  # pragma: no cover
    raise ImportError(
        "langchain-deepseek is required. Install it with `pip install langchain-deepseek`."
    ) from exc

from ..config import get_settings
from ..tools import IndicatorCalculatorTool, LiveMarketDataTool, ToolCache
from .client import AsyncDeepSeekClient  # retained for interface compatibility
from .schemas import DecisionRequest

logger = logging.getLogger("autotrade.llm.langchain")

SYSTEM_PROMPT = (
    "You are AutoTrader, an LLM portfolio manager. Use the available tools to gather the latest "
    "market data and technical indicators for each symbol before making any decisions. "
    "ALWAYS call `live_market_data` and `indicator_calculator` for every symbol you evaluate. "
    "After you finish reasoning, respond with ONLY a JSON array of decisions matching the schema:\n"
    '  [{"symbol": "BTC-USD", "action": "HOLD|CLOSE|BUY|SELL|NO_ENTRY", "quantity": 0.0, '
    '"size_pct": 0.0, "leverage": 1.0, "confidence": 0.65, "stop_loss": 0.0, "take_profit": 0.0, '
    '"max_slippage_bps": 25, "invalidation_condition": "string", "rationale": "string"}]\n'
    "IMPORTANT: confidence must be a decimal between 0.0 and 1.0 (e.g., 0.65 for 65% confidence, NOT 65.0)\n"
    "IMPORTANT: leverage should be between 1.0 and 10.0 based on confidence (higher confidence = higher leverage)\n"
    "IMPORTANT: You MUST return a decision for EVERY symbol in the portfolio (both from AUTOTRADE_SYMBOLS config).\n"
    "  - Use 'BUY' when opening a new position (no existing position + strong signal)\n"
    "  - Use 'SELL' when opening a short position (if supported)\n"
    "  - Use 'HOLD' when maintaining an existing position\n"
    "  - Use 'CLOSE' when closing an existing position\n"
    "  - Use 'NO_ENTRY' when no position exists AND entry conditions are not met (weak signal, insufficient confidence, etc.)\n"
    "Always include the latest invalidation_condition for every symbol (for HOLD actions, reuse it from the input data).\n"
    "Do not include any extra keys. If a field is not applicable, omit it."
)


def _build_chat_model():
    settings = get_settings()
    if not settings.deepseek_api_key:
        raise RuntimeError("DeepSeek API key is required to initialize ChatDeepSeek.")
    return ChatDeepSeek(
        model=settings.deepseek_model,
        api_key=settings.deepseek_api_key,
        temperature=0.2,
        base_url=settings.deepseek_base_url or None,
    )


def create_langchain_agent(
    *,
    client: AsyncDeepSeekClient | None,
    tool_cache: ToolCache,
    market_tool: LiveMarketDataTool,
    indicator_tool: IndicatorCalculatorTool,
):
    _ = (client, tool_cache)  # maintained for interface compatibility
    settings = get_settings()

    @tool("live_market_data")
    async def live_market_data(symbol: str) -> str:
        """Fetch recent OHLC candles for a symbol. Input should be a symbol like `BTC-USD`."""
        data = await market_tool.fetch([symbol.upper()])
        payload = data.get(symbol.upper())
        if not payload:
            raise ValueError(f"No market data returned for {symbol}")
        return json.dumps(
            {
                "symbol": payload.symbol,
                "last_price": payload.last_price,
                "fetched_at": payload.fetched_at.isoformat(),
                "short_term_timeframe": payload.metadata.get("short_term_timeframe"),
                "long_term_timeframe": payload.metadata.get("long_term_timeframe"),
                "short_term_candle_count": payload.metadata.get("short_term_limit"),
                "long_term_candle_count": payload.metadata.get("long_term_limit"),
                "intraday_candles": [
                    {
                        "timestamp": candle.timestamp.isoformat(),
                        "open": candle.open,
                        "high": candle.high,
                        "low": candle.low,
                        "close": candle.close,
                        "volume": candle.volume,
                    }
                    for candle in payload.ohlcv_intraday
                ],
                "high_timeframe_candles": [
                    {
                        "timestamp": candle.timestamp.isoformat(),
                        "open": candle.open,
                        "high": candle.high,
                        "low": candle.low,
                        "close": candle.close,
                        "volume": candle.volume,
                    }
                    for candle in payload.ohlcv_high_timeframe
                ],
            }
        )

    @tool("indicator_calculator")
    async def indicator_calculator(symbol: str) -> str:
        """Compute EMA/MACD/RSI/ATR and volume metrics for a symbol using cached market data."""
        symbol_upper = symbol.upper()
        market_data = await market_tool.fetch([symbol_upper])
        indicators = await indicator_tool.compute(market_data)
        result = indicators.get(symbol_upper)
        if result is None or result.snapshot is None:
            raise ValueError(f"No indicator snapshot available for {symbol}")
        snapshot = result.snapshot

        def _trim(series: Sequence[float] | None, limit: int = 10) -> list[float]:
            if series is None:
                return []
            # Convert to list in case we receive tuples/arrays
            seq = list(series)
            if limit <= 0 or len(seq) <= limit:
                return seq
            return seq[-limit:]

        payload: dict[str, object] = {
            "symbol": snapshot.symbol,
            "price": snapshot.price,
            "ema20": snapshot.ema20,
            "macd": snapshot.macd,
            "macd_signal": snapshot.macd_signal,
            "macd_histogram": snapshot.macd_histogram,
            "rsi7": snapshot.rsi7,
            "rsi14": snapshot.rsi14,
            "atr3": snapshot.atr3,
            "atr14": snapshot.atr14,
            "volume": snapshot.volume,
            "volume_ratio": snapshot.volume_ratio,
            "generated_at": snapshot.generated_at.isoformat(),
            "mid_prices": _trim(snapshot.mid_prices),
            "ema20_series": _trim(snapshot.ema20_series),
            "macd_series": _trim(snapshot.macd_series),
            "macd_histogram_series": _trim(snapshot.macd_histogram_series),
            "rsi7_series": _trim(snapshot.rsi7_series),
            "rsi14_series": _trim(snapshot.rsi14_series),
        }
        if snapshot.higher_timeframe:
            htf = snapshot.higher_timeframe
            payload["higher_timeframe"] = {
                "ema20": htf.ema20,
                "ema50": htf.ema50,
                "atr3": htf.atr3,
                "atr14": htf.atr14,
                "macd": htf.macd,
                "macd_signal": htf.macd_signal,
                "macd_histogram": htf.macd_histogram,
                "macd_histogram_series": _trim(htf.macd_histogram_series),
                "rsi14": htf.rsi14,
                "volume": htf.volume,
                "volume_avg": htf.volume_avg,
                "volume_ratio": htf.volume_ratio,
                "macd_series": _trim(htf.macd_series),
                "rsi14_series": _trim(htf.rsi14_series),
                "generated_at": htf.generated_at.isoformat(),
            }
        return json.dumps(payload)

    model = _build_chat_model()
    return create_agent(
        model=model,
        tools=[live_market_data, indicator_calculator],
        system_prompt=SYSTEM_PROMPT,
        debug=settings.log_level == "debug",
    )


def parse_agent_output(messages: Sequence[BaseMessage]) -> DecisionRequest:
    # With ainvoke(), the last AIMessage is guaranteed to be the final conclusion
    for message in reversed(messages):
        if isinstance(message, AIMessage):
            content = _extract_text_from_message(message)
            
            if not content or not content.strip():
                raise ValueError("Final AI message was empty; check upstream tool/model logs.")
            
            json_payload = _extract_json_block(content)
            logger.debug("Extracted JSON payload: %s", json_payload)
            return DecisionRequest.parse_payload(json_payload)
    
    raise ValueError("Agent run did not produce an AI message with decisions.")


def _extract_text_from_message(message: BaseMessage) -> str:
    content = message.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
        return "\n".join(parts)
    return str(content)


def _extract_json_block(text: str) -> str:
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        logger.debug("Unable to locate JSON array in text: %s", text)
        return text
    return text[start : end + 1]


__all__ = ["create_langchain_agent", "parse_agent_output", "SYSTEM_PROMPT"]

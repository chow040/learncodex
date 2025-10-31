from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence
from uuid import uuid4

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage

from ..config import get_settings
from ..llm import AsyncDeepSeekClient, DecisionResult
from ..llm.prompt_builder import (
    AccountContext,
    PositionContext,
    PromptBuilder,
    PromptContext,
    SymbolContext,
    SymbolHigherTimeframeContext,
)
from ..llm.langchain_agent import create_langchain_agent, parse_agent_output
from ..repositories import AutoTradePortfolioSnapshot, fetch_latest_portfolio
from ..tools import IndicatorCalculatorTool, LiveMarketDataTool, ToolCache, ToolCacheSnapshot


@dataclass(slots=True)
class DecisionPipelineResult:
    prompt: str
    response: DecisionResult
    generated_at: datetime
    run_id: str
    tool_cache_snapshot: list[ToolCacheSnapshot]
    agent_trace: list[dict[str, str]]


class DecisionPipeline:
    def __init__(
        self,
        *,
        llm_client: AsyncDeepSeekClient,
        tool_cache: ToolCache,
        market_tool: LiveMarketDataTool,
        indicator_tool: IndicatorCalculatorTool,
        trace_log_path: str | None = None,
    ) -> None:
        self._tool_cache = tool_cache
        self._llm_client = llm_client
        self._market_tool = market_tool
        self._indicator_tool = indicator_tool
        self._logger = logging.getLogger("autotrade.pipeline.decision")
        self._settings = get_settings()
        self._agent_graph = create_langchain_agent(
            client=self._llm_client,
            tool_cache=self._tool_cache,
            market_tool=self._market_tool,
            indicator_tool=self._indicator_tool,
        )
        if trace_log_path:
            trace_path = Path(trace_log_path)
            trace_path.parent.mkdir(parents=True, exist_ok=True)
            self._trace_log_path: Path | None = trace_path
        else:
            self._trace_log_path = None

    async def run_once(self) -> DecisionPipelineResult | None:
        if not self._settings.deepseek_api_key:
            self._logger.info("DeepSeek API key not configured; skipping decision evaluation")
            return None

        portfolio = await fetch_latest_portfolio()
        if portfolio is None:
            self._logger.warning("Skipping decision evaluation; portfolio snapshot unavailable")
            return None

        symbols = self._resolve_symbols()
        if not symbols:
            self._logger.warning("No symbols configured for decision pipeline")
            return None

        run_id = str(uuid4())
        prompt = self._build_portfolio_prompt(portfolio, symbols)

        try:
            async with self._tool_cache.scope(run_id):
                inputs = {"messages": [HumanMessage(content=prompt)]}
                
                # Use ainvoke to get complete, non-fragmented messages
                final_state = await self._agent_graph.ainvoke(inputs)  # type: ignore
                messages: list[BaseMessage] = final_state["messages"]
                
                # Build trace from complete messages
                trace: list[dict[str, str]] = [
                    self._format_trace_step(msg, {}) for msg in messages
                ]

                serialized_messages = [self._serialize_message(msg) for msg in messages]
                self._logger.debug("LangChain messages: %s", serialized_messages)

                final_ai_message = next((msg for msg in reversed(messages) if isinstance(msg, AIMessage)), None)
                if final_ai_message is None:
                    raise ValueError("Agent run did not produce a final AI message.")
                final_text = self._extract_text_from_message(final_ai_message)

                # Extract chain of thought from all AI messages (reasoning before final decision)
                chain_of_thought = self._extract_chain_of_thought(messages)

                decisions_payload = parse_agent_output(messages)
                
                # Attach chain of thought to each decision
                for decision in decisions_payload.decisions:
                    if not decision.chain_of_thought:
                        decision.chain_of_thought = chain_of_thought
                
                decision_result = DecisionResult(
                    decisions=decisions_payload.decisions,
                    raw_json=final_text,
                )
                snapshot = self._tool_cache.snapshot()
                if trace:
                    self._logger.debug("Agent trace: %s", trace)
                self._write_trace(run_id, prompt, decision_result, trace, snapshot, messages)
                return DecisionPipelineResult(
                    prompt=prompt,
                    response=decision_result,
                    generated_at=datetime.now(timezone.utc),
                    run_id=run_id,
                    tool_cache_snapshot=snapshot,
                    agent_trace=trace,
                )
        except Exception as exc:
            self._logger.exception("Decision pipeline failed: %s", exc)
            return None

    def _resolve_symbols(self) -> Sequence[str]:
        configured = self._settings.symbols or []
        if isinstance(configured, list):
            return [symbol.upper() for symbol in configured]
        return []

    def _write_trace(
        self,
        run_id: str,
        prompt: str,
        decision_result: DecisionResult,
        trace: list[dict[str, str]],
        snapshot: list[ToolCacheSnapshot],
        messages: Sequence[BaseMessage],
    ) -> None:
        if not self._trace_log_path:
            return
        payload = {
            "run_id": run_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "prompt": prompt,
            "decisions": [decision.model_dump() for decision in decision_result.decisions],
            "trace": trace,
            "tool_cache_snapshot": [
                {
                    "key": entry.key,
                    "stored_at": entry.stored_at,
                    "age_seconds": entry.age_seconds,
                    "value_type": entry.value_type,
                }
                for entry in snapshot
            ],
            "messages": [self._serialize_message(msg) for msg in messages],
        }
        try:
            with self._trace_log_path.open("a", encoding="utf-8") as trace_file:
                trace_file.write(json.dumps(payload))
                trace_file.write("\n")
        except Exception as exc:  # pragma: no cover - file system failure path
            self._logger.warning("Failed to write decision trace: %s", exc)

    def _format_trace_step(self, message: BaseMessage, metadata: dict[str, Any]) -> dict[str, str]:
        entry: dict[str, str] = {
            "message_type": message.__class__.__name__,
            "content": self._extract_text_from_message(message),
        }
        if isinstance(message, AIMessage):
            entry["tool_calls"] = json.dumps(getattr(message, "tool_calls", []))
        if isinstance(message, ToolMessage):
            if message.name:
                entry["tool_name"] = message.name
        for key in ("langgraph_step", "langgraph_node", "langgraph_path"):
            if key in metadata:
                entry[key] = str(metadata[key])
        return entry

    def _serialize_message(self, message: BaseMessage) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "type": message.__class__.__name__,
            "content": self._extract_text_from_message(message),
        }
        if isinstance(message, AIMessage):
            payload["tool_calls"] = getattr(message, "tool_calls", [])
        if isinstance(message, ToolMessage):
            payload["tool_name"] = message.name
        return payload

    def _extract_text_from_message(self, message: BaseMessage) -> str:
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
    
    def _extract_chain_of_thought(self, messages: Sequence[BaseMessage]) -> str:
        """
        Extract chain of thought from AI messages.
        
        Collects all AI message content that appears before the final JSON decision.
        This captures the LLM's reasoning, analysis, and thinking process.
        """
        cot_parts: list[str] = []
        
        for msg in messages:
            if isinstance(msg, AIMessage):
                content = self._extract_text_from_message(msg)
                if content and content.strip():
                    # Check if this is the final JSON response
                    if content.strip().startswith("[") and content.strip().endswith("]"):
                        # This is the final decision JSON, don't include it in CoT
                        continue
                    # Include any reasoning/thinking text
                    cot_parts.append(content.strip())
        
        # Join all reasoning parts with newlines
        full_cot = "\n\n".join(cot_parts)
        return full_cot if full_cot else "No explicit chain of thought recorded"

    def _build_portfolio_prompt(
        self,
        portfolio: AutoTradePortfolioSnapshot,
        symbols: Sequence[str],
    ) -> str:
        positions_payload = [
            {
                "symbol": pos.symbol,
                "quantity": pos.quantity,
                "entry_price": pos.entry_price,
                "current_price": pos.mark_price,
                "unrealized_pnl": pos.pnl,
                "leverage": pos.leverage,
                "profit_target": pos.exit_plan.profit_target,
                "stop_loss": pos.exit_plan.stop_loss,
                "invalidation_condition": pos.exit_plan.invalidation,
                "confidence": pos.confidence,
            }
            for pos in portfolio.positions
        ]
        account_payload = {
            "total_equity": portfolio.equity,
            "available_cash": portfolio.available_cash,
            "return_pct": portfolio.pnl_pct,
            "sharpe": portfolio.sharpe,
            "last_run_at": portfolio.last_run_at,
            "positions": positions_payload,
        }
        prompt = (
            "PORTFOLIO SNAPSHOT\n"
            f"{json.dumps(account_payload, indent=2)}\n\n"
            f"TARGET SYMBOLS: {', '.join(symbols)}\n"
            "Use the tools to fetch current market data and indicators for each symbol before deciding."
        )
        return prompt


_decision_pipeline: DecisionPipeline | None = None
_decision_client: AsyncDeepSeekClient | None = None
_tool_cache: ToolCache | None = None
_live_market_tool: LiveMarketDataTool | None = None
_indicator_tool: IndicatorCalculatorTool | None = None


def get_decision_pipeline() -> DecisionPipeline:
    global _decision_pipeline, _decision_client, _tool_cache, _live_market_tool, _indicator_tool
    if _decision_pipeline is None:
        settings = get_settings()
        _tool_cache = ToolCache(ttl_seconds=settings.tool_cache_ttl_seconds)
        _live_market_tool = LiveMarketDataTool(cache=_tool_cache, settings=settings)
        _indicator_tool = IndicatorCalculatorTool(cache=_tool_cache, settings=settings)
        _decision_client = AsyncDeepSeekClient()
        _decision_pipeline = DecisionPipeline(
            llm_client=_decision_client,
            tool_cache=_tool_cache,
            market_tool=_live_market_tool,
            indicator_tool=_indicator_tool,
            trace_log_path=settings.decision_trace_log_path,
        )
    return _decision_pipeline


async def shutdown_decision_pipeline() -> None:
    global _decision_pipeline, _decision_client, _tool_cache, _live_market_tool, _indicator_tool
    if _decision_client is not None:
        await _decision_client.close()
    _decision_pipeline = None
    _decision_client = None
    _tool_cache = None
    _live_market_tool = None
    _indicator_tool = None


__all__ = ["DecisionPipeline", "DecisionPipelineResult", "get_decision_pipeline", "shutdown_decision_pipeline"]

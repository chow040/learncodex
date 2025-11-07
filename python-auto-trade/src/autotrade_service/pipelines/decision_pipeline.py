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
from ..providers import DerivativesProviderError, DerivativesSnapshot, OKXDerivativesFetcher
from ..tools import (
    DerivativesDataTool,
    IndicatorCalculatorTool,
    LiveMarketDataTool,
    ToolCache,
    ToolCacheSnapshot,
)


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
        derivatives_tool: DerivativesDataTool,
        trace_log_path: str | None = None,
    ) -> None:
        self._tool_cache = tool_cache
        self._llm_client = llm_client
        self._market_tool = market_tool
        self._indicator_tool = indicator_tool
        self._derivatives_tool = derivatives_tool
        self._logger = logging.getLogger("autotrade.pipeline.decision")
        self._settings = get_settings()
        self._start_time = datetime.now(timezone.utc)
        self._invocation_counter = 0
        self._agent_graph = create_langchain_agent(
            client=self._llm_client,
            tool_cache=self._tool_cache,
            market_tool=self._market_tool,
            indicator_tool=self._indicator_tool,
            derivatives_tool=self._derivatives_tool,
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
        self._invocation_counter += 1
        minutes_since_start = max(
            0, int((datetime.now(timezone.utc) - self._start_time).total_seconds() // 60)
        )
        symbol_contexts = await self._gather_symbol_contexts(portfolio, symbols)

        # Load learned rules and recent trade history for feedback loop
        learned_rules = await self._load_active_rules(limit=8)
        recent_trades = await self._load_recent_trades(limit=5)

        prompt = self._build_portfolio_prompt(
            portfolio,
            symbols,
            symbol_contexts=symbol_contexts,
            invocation_count=self._invocation_counter,
            minutes_since_start=minutes_since_start,
        )

        # Enhance prompt with learned rules and history
        if learned_rules or recent_trades:
            prompt = self._inject_feedback_context(prompt, learned_rules, recent_trades)

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

                # Extract tool messages for payload
                tool_payload_json = self._extract_tool_payloads(messages)

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
                    tool_payload_json=tool_payload_json,
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

    async def _load_active_rules(self, limit: int = 8) -> list[dict[str, Any]]:
        """
        Load active learned rules from database.
        
        Note: Rules are ALWAYS loaded from database (PostgreSQL), regardless
        of trading mode (paper/live). This ensures learned rules are shared
        across all modes and persist across sessions.
        
        Args:
            limit: Maximum number of rules to load
            
        Returns:
            List of rule dictionaries (empty list if DB unavailable)
        """
        try:
            from ..repositories import fetch_active_rules
            rules = await fetch_active_rules(limit=limit)
            return [
                {
                    "id": str(rule.id),
                    "text": rule.rule_text,
                    "type": rule.rule_type,
                    "effectiveness": rule.effectiveness_score,
                }
                for rule in rules
            ]
        except Exception as exc:
            self._logger.warning(f"Failed to load active rules: {exc}")
            return []

    async def _load_recent_trades(self, limit: int = 5) -> list[dict[str, Any]]:
        """
        Load recent trade outcomes from database or simulation.
        
        Supports both:
        - Live trading: Queries trade_outcomes database table
        - Paper trading: Loads from simulation state JSON file
        
        Args:
            limit: Maximum number of trades to load
            
        Returns:
            List of trade outcome dictionaries
        """
        trades = []
        
        # Try loading from simulation first (paper trading)
        try:
            from ..repositories import fetch_latest_portfolio
            portfolio = await fetch_latest_portfolio()
            
            # Check if we're in simulation mode by looking for closed_positions
            if portfolio and portfolio.closed_positions:
                # Convert closed positions to trade outcome format
                for closed_pos in portfolio.closed_positions[-limit:]:  # Get last N
                    trades.append({
                        "symbol": closed_pos.symbol,
                        "action": "CLOSE",  # Closed positions don't track original action
                        "pnl_pct": closed_pos.realized_pnl_pct,
                        "rationale": closed_pos.reason[:80] if closed_pos.reason else "No rationale",
                    })
                
                if trades:
                    self._logger.debug(f"Loaded {len(trades)} trades from simulation state")
                    return trades
        except Exception as exc:
            self._logger.debug(f"Could not load from simulation: {exc}")
        
        # Fallback: Try loading from database (live trading)
        try:
            from ..repositories import fetch_trade_outcomes
            outcomes = await fetch_trade_outcomes(limit=limit)
            
            for outcome in outcomes:
                if outcome.get("exit_timestamp"):  # Only closed trades
                    trades.append({
                        "symbol": outcome.get("symbol"),
                        "action": outcome.get("action"),
                        "pnl_pct": float(outcome.get("pnl_pct", 0)),
                        "rationale": outcome.get("rationale", "")[:80],
                    })
            
            if trades:
                self._logger.debug(f"Loaded {len(trades)} trades from database")
        except Exception as exc:
            self._logger.debug(f"Could not load from database: {exc}")
        
        return trades

    def _format_rules_section(self, rules: list[dict[str, Any]]) -> str:
        """
        Format learned rules for prompt injection.
        
        Args:
            rules: List of rule dictionaries
            
        Returns:
            Formatted rules section
        """
        if not rules:
            return "No learned rules yet. Generate decisions based on market analysis."
        
        formatted = []
        for i, rule in enumerate(rules[:8], 1):  # Max 8 rules
            effectiveness = rule.get("effectiveness", 0.5)
            rule_type = rule.get("type", "entry")
            emoji = {
                "risk_management": "🛡️",
                "entry": "📈",
                "exit": "📉",
                "position_sizing": "⚖️",
            }.get(rule_type, "📋")
            
            formatted.append(
                f"{i}. {emoji} [{rule_type.upper()}] {rule['text']} "
                f"(effectiveness: {effectiveness:.0%})"
            )
        
        return "\n".join(formatted)

    def _format_history_section(self, trades: list[dict[str, Any]]) -> str:
        """
        Format recent trade history for context.
        
        Args:
            trades: List of trade outcome dictionaries
            
        Returns:
            Formatted history section
        """
        if not trades:
            return "No recent trade history."
        
        formatted = []
        for trade in trades[:5]:  # Max 5 trades
            pnl_pct = trade.get("pnl_pct", 0)
            outcome = "✓ WIN" if pnl_pct > 0 else "✗ LOSS"
            symbol = trade.get("symbol", "???")
            action = trade.get("action", "???")
            rationale = trade.get("rationale", "No rationale")
            
            formatted.append(
                f"• {symbol} {action}: {outcome} ({pnl_pct:+.2f}%) - {rationale}"
            )
        
        return "\n".join(formatted)

    def _inject_feedback_context(
        self,
        base_prompt: str,
        learned_rules: list[dict[str, Any]],
        recent_trades: list[dict[str, Any]],
    ) -> str:
        """
        Inject learned rules and recent trade history into the prompt.
        
        Args:
            base_prompt: Original prompt from PromptBuilder
            learned_rules: List of active learned rules
            recent_trades: List of recent trade outcomes
            
        Returns:
            Enhanced prompt with feedback context
        """
        # Find insertion point (before "### TASK ###" or similar)
        insertion_markers = [
            "### TASK ###",
            "Generate trading decisions",
            "Your task:",
            "Generate decisions",
            "## DECISION FRAMEWORK",
        ]
        
        insertion_point = -1
        for marker in insertion_markers:
            idx = base_prompt.find(marker)
            if idx != -1:
                insertion_point = idx
                break
        
        if insertion_point == -1:
            # Fallback: append to end
            insertion_point = len(base_prompt)
        
        # Build feedback sections
        rules_section = self._format_rules_section(learned_rules)
        history_section = self._format_history_section(recent_trades)
        
        feedback_block = f"""

## LEARNED RULES (Apply These Constraints)
{rules_section}

## RECENT TRADE HISTORY (Learn from These)
{history_section}

"""
        
        # Insert feedback block before the decision generation section
        enhanced_prompt = (
            base_prompt[:insertion_point] + 
            feedback_block + 
            base_prompt[insertion_point:]
        )
        
        return enhanced_prompt

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
    
    def _extract_tool_payloads(self, messages: Sequence[BaseMessage]) -> str | None:
        """
        Extract tool invocations from messages and serialize to JSON.
        
        Collects all ToolMessage entries with their inputs and outputs,
        providing a complete audit trail of LangChain tool usage.
        
        Returns:
            JSON string with array of tool invocations, or None if no tools were called
        """
        tool_invocations: list[dict[str, Any]] = []
        
        # Track tool calls from AIMessage to match with ToolMessage responses
        pending_tool_calls: dict[str, dict[str, Any]] = {}
        
        for msg in messages:
            if isinstance(msg, AIMessage) and hasattr(msg, 'tool_calls'):
                # AIMessage with tool_calls: record the invocation
                for tool_call in msg.tool_calls:
                    call_id = tool_call.get('id') or str(len(pending_tool_calls))
                    pending_tool_calls[call_id] = {
                        'tool': tool_call.get('name', 'unknown'),
                        'input': tool_call.get('args', {}),
                        'call_id': call_id,
                    }
            
            elif isinstance(msg, ToolMessage):
                # ToolMessage: contains the tool response
                tool_call_id = getattr(msg, 'tool_call_id', None)
                tool_name = msg.name or 'unknown'
                tool_output = self._extract_text_from_message(msg)
                
                # Try to find matching input from pending calls
                if tool_call_id and tool_call_id in pending_tool_calls:
                    invocation = pending_tool_calls.pop(tool_call_id)
                    invocation['output'] = tool_output
                    invocation['timestamp'] = datetime.now(timezone.utc).isoformat()
                    tool_invocations.append(invocation)
                else:
                    # Orphaned ToolMessage (no matching AIMessage tool_call)
                    tool_invocations.append({
                        'tool': tool_name,
                        'input': {},
                        'output': tool_output,
                        'timestamp': datetime.now(timezone.utc).isoformat(),
                    })
        
        if not tool_invocations:
            return None
        
        # Serialize to JSON
        try:
            return json.dumps(tool_invocations, indent=2)
        except (TypeError, ValueError) as exc:
            self._logger.warning("Failed to serialize tool payloads: %s", exc)
            return None

    def _build_portfolio_prompt(
        self,
        portfolio: AutoTradePortfolioSnapshot,
        symbols: Sequence[str],
        *,
        symbol_contexts: Sequence[SymbolContext] | None,
        invocation_count: int,
        minutes_since_start: int,
    ) -> str:
        if not symbol_contexts:
            symbol_contexts = [self._default_symbol_context(symbol, portfolio) for symbol in symbols]

        position_contexts: list[PositionContext] = []
        for pos in portfolio.positions:
            notional = pos.quantity * pos.mark_price
            position_contexts.append(
                PositionContext(
                    symbol=pos.symbol,
                    quantity=pos.quantity,
                    entry_price=pos.entry_price,
                    current_price=pos.mark_price,
                    liquidation_price=None,
                    unrealized_pnl=pos.pnl,
                    leverage=pos.leverage,
                    profit_target=pos.exit_plan.profit_target,
                    stop_loss=pos.exit_plan.stop_loss,
                    invalidation_condition=pos.exit_plan.invalidation,
                    confidence=pos.confidence,
                    risk_usd=0.0,
                    notional_usd=notional,
                )
            )

        account_context = AccountContext(
            value=portfolio.equity,
            cash=portfolio.available_cash,
            return_pct=portfolio.pnl_pct,
            sharpe=portfolio.sharpe,
            positions=position_contexts,
            risk=None,
        )

        prompt_context = PromptContext(
            minutes_since_start=minutes_since_start,
            invocation_count=invocation_count,
            current_timestamp=datetime.now(timezone.utc),
            symbols=symbol_contexts,
            account=account_context,
        )

        builder = PromptBuilder()
        return builder.build(prompt_context)

    async def _gather_symbol_contexts(
        self,
        portfolio: AutoTradePortfolioSnapshot,
        symbols: Sequence[str],
    ) -> list[SymbolContext]:
        upper_symbols = [symbol.upper() for symbol in symbols]

        market_data: dict[str, Any] = {}
        try:
            market_data = await self._market_tool.fetch(upper_symbols)
        except Exception as exc:  # pragma: no cover - network failure path
            self._logger.warning("Failed to fetch live market data: %s", exc)

        indicator_results: dict[str, Any] = {}
        if market_data:
            try:
                indicator_results = await self._indicator_tool.compute(market_data)
            except Exception as exc:  # pragma: no cover - indicator failure path
                self._logger.warning("Failed to compute indicators: %s", exc)

        derivatives_data: dict[str, DerivativesSnapshot] = {}
        if self._settings.okx_derivatives_enabled:
            try:
                requested: list[str] = []
                for symbol in symbols:
                    try:
                        requested.append(self._derivatives_tool.normalize_symbol(symbol))
                    except ValueError:  # pragma: no cover - unsupported symbol mapping
                        self._logger.debug("No OKX mapping for symbol %s; skipping derivatives fetch", symbol)
                if requested:
                    deduped = list(dict.fromkeys(requested))
                    derivatives_data = await self._derivatives_tool.fetch(deduped)
            except DerivativesProviderError as exc:
                self._logger.warning("Failed to fetch derivatives data: %s", exc)
            except ValueError as exc:  # pragma: no cover - normalization failure
                self._logger.warning("Invalid symbol for derivatives data: %s", exc)

        position_lookup = {pos.symbol.upper(): pos for pos in portfolio.positions}

        contexts: list[SymbolContext] = []
        for symbol in symbols:
            context = self._build_symbol_context(
                symbol=symbol,
                portfolio_position=position_lookup.get(symbol.upper()),
                market_payload=market_data.get(symbol.upper()) if market_data else None,
                indicator_result=indicator_results.get(symbol.upper()) if indicator_results else None,
                derivatives_snapshot=self._resolve_derivatives_snapshot(symbol, derivatives_data),
            )
            contexts.append(context)
        return contexts

    def _build_symbol_context(
        self,
        *,
        symbol: str,
        portfolio_position: Any,
        market_payload: Any,
        indicator_result: Any,
        derivatives_snapshot: DerivativesSnapshot | None,
    ) -> SymbolContext:
        snapshot = indicator_result.snapshot if indicator_result else None
        higher_tf = snapshot.higher_timeframe if snapshot else None

        higher_context: SymbolHigherTimeframeContext | None = None
        if higher_tf is not None:
            higher_context = SymbolHigherTimeframeContext(
                ema20=higher_tf.ema20,
                ema50=higher_tf.ema50,
                atr3=higher_tf.atr3,
                atr14=higher_tf.atr14,
                volume=higher_tf.volume,
                volume_avg=higher_tf.volume_avg,
                macd_series=higher_tf.macd_series,
                rsi14_series=higher_tf.rsi14_series,
            )

        current_price = 0.0
        if snapshot and snapshot.price:
            current_price = snapshot.price
        elif market_payload is not None:
            current_price = getattr(market_payload, "last_price", 0.0)
        elif portfolio_position is not None:
            current_price = portfolio_position.mark_price

        funding_history: list[float] = []
        if derivatives_snapshot:
            funding_history.append(derivatives_snapshot.funding_rate)
            if derivatives_snapshot.predicted_funding_rate is not None:
                funding_history.append(derivatives_snapshot.predicted_funding_rate)

        return SymbolContext(
            symbol=symbol.upper(),
            current_price=current_price,
            ema20=snapshot.ema20 if snapshot else 0.0,
            macd=snapshot.macd if snapshot else 0.0,
            rsi7=snapshot.rsi7 if snapshot else 0.0,
            oi_latest=derivatives_snapshot.open_interest_usd if derivatives_snapshot else 0.0,
            oi_avg=derivatives_snapshot.open_interest_usd if derivatives_snapshot else 0.0,
            oi_contracts=derivatives_snapshot.open_interest_contracts if derivatives_snapshot else None,
            oi_timestamp=derivatives_snapshot.open_interest_timestamp if derivatives_snapshot else None,
            funding_rate=derivatives_snapshot.funding_rate if derivatives_snapshot else 0.0,
            funding_rate_pct=derivatives_snapshot.funding_rate_pct if derivatives_snapshot else None,
            funding_rate_annual_pct=derivatives_snapshot.funding_rate_annual_pct if derivatives_snapshot else None,
            predicted_funding_rate=derivatives_snapshot.predicted_funding_rate if derivatives_snapshot else None,
            next_funding_time=derivatives_snapshot.next_funding_time if derivatives_snapshot else None,
            funding_history=funding_history,
            mids=snapshot.mid_prices if snapshot else [],
            ema20_series=snapshot.ema20_series if snapshot else [],
            macd_series=snapshot.macd_series if snapshot else [],
            rsi7_series=snapshot.rsi7_series if snapshot else [],
            rsi14_series=snapshot.rsi14_series if snapshot else [],
            higher_timeframe=higher_context,
        )

    def _resolve_derivatives_snapshot(
        self,
        symbol: str,
        derivatives_data: dict[str, DerivativesSnapshot],
    ) -> DerivativesSnapshot | None:
        if not derivatives_data:
            return None
        try:
            normalized = self._derivatives_tool.normalize_symbol(symbol)
        except ValueError:
            return None
        return derivatives_data.get(normalized)

    def _default_symbol_context(
        self,
        symbol: str,
        portfolio: AutoTradePortfolioSnapshot,
    ) -> SymbolContext:
        position = next((pos for pos in portfolio.positions if pos.symbol.upper() == symbol.upper()), None)
        current_price = position.mark_price if position else 0.0
        return SymbolContext(
            symbol=symbol.upper(),
            current_price=current_price,
            ema20=0.0,
            macd=0.0,
            rsi7=0.0,
            oi_latest=0.0,
            oi_avg=0.0,
            funding_rate=0.0,
            mids=[],
            ema20_series=[],
            macd_series=[],
            rsi7_series=[],
            rsi14_series=[],
            higher_timeframe=None,
        )


_decision_pipeline: DecisionPipeline | None = None
_decision_client: AsyncDeepSeekClient | None = None
_tool_cache: ToolCache | None = None
_live_market_tool: LiveMarketDataTool | None = None
_indicator_tool: IndicatorCalculatorTool | None = None
_derivatives_fetcher: OKXDerivativesFetcher | None = None
_derivatives_tool: DerivativesDataTool | None = None


def get_decision_pipeline() -> DecisionPipeline:
    global _decision_pipeline, _decision_client, _tool_cache, _live_market_tool, _indicator_tool, _derivatives_fetcher, _derivatives_tool
    if _decision_pipeline is None:
        settings = get_settings()
        _tool_cache = ToolCache(ttl_seconds=settings.tool_cache_ttl_seconds)
        _live_market_tool = LiveMarketDataTool(cache=_tool_cache, settings=settings)
        _indicator_tool = IndicatorCalculatorTool(cache=_tool_cache, settings=settings)
        _derivatives_fetcher = OKXDerivativesFetcher(settings=settings)
        _derivatives_tool = DerivativesDataTool(fetcher=_derivatives_fetcher, cache=_tool_cache, settings=settings)
        _decision_client = AsyncDeepSeekClient()
        _decision_pipeline = DecisionPipeline(
            llm_client=_decision_client,
            tool_cache=_tool_cache,
            market_tool=_live_market_tool,
            indicator_tool=_indicator_tool,
            derivatives_tool=_derivatives_tool,
            trace_log_path=settings.decision_trace_log_path,
        )
    return _decision_pipeline


async def shutdown_decision_pipeline() -> None:
    global _decision_pipeline, _decision_client, _tool_cache, _live_market_tool, _indicator_tool, _derivatives_fetcher, _derivatives_tool
    if _decision_client is not None:
        await _decision_client.close()
    if _derivatives_fetcher is not None:
        await _derivatives_fetcher.close()
    _decision_pipeline = None
    _decision_client = None
    _tool_cache = None
    _live_market_tool = None
    _indicator_tool = None
    _derivatives_fetcher = None
    _derivatives_tool = None


__all__ = ["DecisionPipeline", "DecisionPipelineResult", "get_decision_pipeline", "shutdown_decision_pipeline"]

#!/usr/bin/env python3
"""TradingAgents runner for Equity Insight backend."""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict


def load_payload(source: str | None) -> Dict[str, Any]:
    if source:
        with open(source, "r", encoding="utf-8") as handle:
            return json.load(handle)
    return json.load(sys.stdin)


def dump_output(payload: Dict[str, Any], destination: str | None) -> None:
    serialized = json.dumps(payload, ensure_ascii=False)
    if destination:
        with open(destination, "w", encoding="utf-8") as handle:
            handle.write(serialized)
    else:
        sys.stdout.write(serialized)
        sys.stdout.flush()


def resolve_tradingagents_path(default_relative: str = "../../TradingAgents-main/TradingAgents-main") -> str:
    env_path = os.environ.get("TRADING_AGENTS_PATH")
    if env_path:
        return env_path
    base_dir = Path(__file__).resolve().parent
    candidate = (base_dir / default_relative).resolve()
    return str(candidate)


def override_interface(context: Dict[str, Any]) -> None:
    """Monkey patch tradingagents.dataflows.interface functions to return provided context."""
    import tradingagents.dataflows.interface as interface  # type: ignore

    def value_for(key: str, default: str = "") -> str:
        value = context.get(key)
        if value is None:
            return default
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return str(value)

    overrides = {
        "get_YFin_data_online": "market_price_history",
        "get_YFin_data": "market_price_history",
        "get_stockstats_indicators_report_online": "market_technical_report",
        "get_stockstats_indicators_report": "market_technical_report",
        "get_stock_news_openai": "social_stock_news",
        "get_reddit_stock_info": "social_reddit_summary",
        "get_global_news_openai": "news_global",
        "get_finnhub_news": "news_company",
        "get_reddit_news": "news_reddit",
        "get_fundamentals_openai": "fundamentals_summary",
        "get_simfin_balance_sheet": "fundamentals_balance_sheet",
        "get_simfin_cashflow": "fundamentals_cashflow",
        "get_simfin_income_statements": "fundamentals_income_stmt",
    }

    for func_name, context_key in overrides.items():
        if hasattr(interface, func_name):
            def factory(key: str):
                def _impl(*_args: Any, **_kwargs: Any) -> str:
                    return value_for(key, default=f"No data provided for {key}")
                return _impl
            setattr(interface, func_name, factory(context_key))


def build_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    from tradingagents.default_config import DEFAULT_CONFIG  # type: ignore

    config = DEFAULT_CONFIG.copy()
    overrides = payload.get("configOverrides", {})
    if isinstance(overrides, dict):
        config.update(overrides)

    backend_url = os.environ.get("OPENAI_BASE_URL") or os.environ.get("TRADING_AGENTS_BACKEND_URL")
    if backend_url:
        config["backend_url"] = backend_url

    deep_model = os.environ.get("TRADING_AGENTS_DEEP_LLM")
    quick_model = os.environ.get("TRADING_AGENTS_QUICK_LLM")
    if deep_model:
        config["deep_think_llm"] = deep_model
    if quick_model:
        config["quick_think_llm"] = quick_model

    results_dir = os.environ.get("TRADING_AGENTS_RESULTS_DIR")
    if results_dir:
        config["results_dir"] = results_dir

    config["online_tools"] = False
    return config


def main() -> None:
    parser = argparse.ArgumentParser(description="Run TradingAgents propagate with provided context")
    parser.add_argument("--input", help="Path to JSON payload file. If omitted, reads stdin.")
    parser.add_argument("--output", help="Path to write decision JSON. If omitted, prints to stdout.")
    args = parser.parse_args()

    payload = load_payload(args.input)

    project_path = resolve_tradingagents_path()
    if project_path not in sys.path:
        sys.path.insert(0, project_path)

    try:
        from tradingagents.graph.trading_graph import TradingAgentsGraph  # type: ignore
    except ModuleNotFoundError as err:
        raise SystemExit(f"Unable to import tradingagents from {project_path}: {err}")

    symbol = payload.get("symbol")
    if not symbol or not isinstance(symbol, str):
        raise SystemExit("Payload must include string field 'symbol'")

    trade_date = payload.get("tradeDate") or datetime.utcnow().strftime("%Y-%m-%d")

    context = payload.get("context", {})
    if not isinstance(context, dict):
        context = {}

    override_interface(context)

    config = build_config(payload)
    debug = bool(payload.get("debug", False))

    graph = TradingAgentsGraph(debug=debug, config=config)

    final_state, processed_signal = graph.propagate(symbol, trade_date)

    investment_state = final_state.get("investment_debate_state", {})
    risk_state = final_state.get("risk_debate_state", {})

    output = {
        "symbol": symbol,
        "tradeDate": trade_date,
        "decision": processed_signal,
        "finalTradeDecision": final_state.get("final_trade_decision"),
        "investmentPlan": final_state.get("investment_plan"),
        "traderPlan": final_state.get("trader_investment_plan"),
        "investmentJudge": investment_state.get("judge_decision"),
        "riskJudge": risk_state.get("judge_decision"),
        "marketReport": final_state.get("market_report"),
        "sentimentReport": final_state.get("sentiment_report"),
        "newsReport": final_state.get("news_report"),
        "fundamentalsReport": final_state.get("fundamentals_report"),
    }

    dump_output(output, args.output)


if __name__ == "__main__":
    main()

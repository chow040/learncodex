#!/usr/bin/env python3
"""Minimal FastAPI wrapper around TradingAgents for backend integration.

This file exposes a POST /propagate endpoint that accepts the same payload
shape the existing runner used (`{ symbol, tradeDate?, context?, configOverrides? }`).

It reuses the helper functions in `tradingagents_runner.py` where appropriate to
keep behaviour consistent.

Run with:
  python ta_server.py          # uses uvicorn programmatically
  # or
  python -m uvicorn ta_server:app --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


class PayloadModel(BaseModel):
    symbol: str
    tradeDate: str | None = None
    context: Dict[str, Any] | None = None
    configOverrides: Dict[str, Any] | None = None
    debug: bool | None = False


app = FastAPI(title="TradingAgents bridge")
logger = logging.getLogger("ta_server")
logger.setLevel(logging.INFO)
# Ensure a console handler is present so logs appear in the uvicorn output
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    formatter = logging.Formatter("[%(asctime)s] %(levelname)s %(name)s: %(message)s")
    ch.setFormatter(formatter)
    logger.addHandler(ch)


def ensure_tradingagents_on_path() -> None:
    # Try multiple ways to locate the TradingAgents package and only add a path
    # to sys.path if it actually contains the `tradingagents` package directory.
    from pathlib import Path
    candidates = []

    # 1) allow explicit override
    env_path = os.environ.get("TRADING_AGENTS_PATH")
    if env_path:
        candidates.append(Path(env_path))

    # 2) try the helper from the old runner if present
    try:
        import tradingagents_runner as runner  # type: ignore

        try:
            project_path = Path(runner.resolve_tradingagents_path())
            candidates.append(project_path)
        except Exception:
            logger.debug("tradingagents_runner.resolve_tradingagents_path failed")
    except Exception:
        logger.debug("tradingagents_runner helper not available; continuing to fallback candidates")

    # 3) repository-relative guesses
    base_dir = Path(__file__).resolve().parent
    candidates.extend([
        (base_dir / "../../TradingAgents-main").resolve(),
        (base_dir / "../../../TradingAgents-main").resolve(),
        (base_dir / "../../.." / "TradingAgents-main").resolve(),
    ])

    # 4) finally, try searching upwards for a folder that contains `tradingagents`
    repo_root = base_dir
    for _ in range(5):
        repo_root = repo_root.parent
        possible = repo_root / "TradingAgents-main"
        candidates.append(possible.resolve())

    # try each candidate; add the first that actually contains the package
    for cand in candidates:
        try:
            cand = cand.resolve()
        except Exception:
            continue
        package_dir = cand / "tradingagents"
        if package_dir.is_dir():
            cand_str = str(cand)
            if cand_str not in sys.path:
                logger.info(f"Adding TradingAgents to sys.path: {cand_str}")
                sys.path.insert(0, cand_str)
            return

    # If we reach here, no candidate contained the package; log for debugging
    logger.warning("Could not locate a TradingAgents package in candidate paths; current sys.path shown")


@app.on_event("startup")
def _startup():
    ensure_tradingagents_on_path()
    # Diagnostic: log whether the tradingagents package is importable at startup
    try:
        import importlib

        spec = importlib.util.find_spec("tradingagents")
        if spec is None:
            logger.warning("tradingagents package not found on sys.path at startup")
            logger.info("sys.path entries:\n" + "\n".join(sys.path))
        else:
            logger.info(f"tradingagents spec found: {spec.origin}")
    except Exception:
        logger.exception("Error while checking tradingagents importability at startup")


executor = ThreadPoolExecutor(max_workers=1)

# In-memory observability for active and last runs
RUNS: Dict[str, Dict[str, Any]] = {}
LAST_RESULT: Optional[Dict[str, Any]] = None
LAST_ERROR: Optional[Dict[str, Any]] = None

async def _heartbeat(run_id: str, interval: float = 5.0) -> None:
    """Periodic heartbeat updater while a run is active."""
    try:
        while True:
            await asyncio.sleep(interval)
            state = RUNS.get(run_id)
            if not state:
                return
            if state.get("status") != "running":
                return
            state["heartbeat_ts"] = datetime.utcnow().isoformat()
    except asyncio.CancelledError:
        return


def _run_propagate_sync(payload: dict) -> dict:
    """Synchronous propagate call executed in a threadpool."""
    # Import locally to ensure sys.path has the TradingAgents package
    try:
        from tradingagents.graph.trading_graph import TradingAgentsGraph  # type: ignore
    except Exception as exc:  # pragma: no cover - runtime dependency
        raise RuntimeError(f"Unable to import TradingAgentsGraph: {exc}")

    # Optionally reuse some helpers from tradingagents_runner if available
    try:
        import tradingagents_runner as runner  # type: ignore
    except Exception:
        runner = None

    symbol = payload.get("symbol")
    if not symbol:
        raise ValueError("payload must include 'symbol'")

    trade_date = payload.get("tradeDate") or datetime.utcnow().strftime("%Y-%m-%d")
    context = payload.get("context") or {}

    # If runner exposes override_interface and build_config, reuse them
    if runner and hasattr(runner, "override_interface"):
        try:
            runner.override_interface(context)
        except Exception:
            logger.exception("override_interface failed; continuing without overrides")

    config = {}
    if runner and hasattr(runner, "build_config"):
        try:
            config = runner.build_config(payload)
        except Exception:
            logger.exception("build_config failed; falling back to empty config")

    debug = bool(payload.get("debug", False))

    # Construct graph; if ChromaDB collections already exist, clean up and retry once
    try:
        graph = TradingAgentsGraph(debug=debug, config=config)
    except Exception as init_exc:
        msg = str(init_exc).lower()
        if "already exists" in msg and ("bull_memory" in msg or "bear_memory" in msg):
            logger.warning("ChromaDB collection exists; attempting cleanup and retry")
            try:
                import chromadb  # type: ignore
                from chromadb.config import Settings  # type: ignore

                client = chromadb.Client(Settings(allow_reset=True))
                # Try deleting specific collections if present
                for name in ("bull_memory", "bear_memory"):
                    try:
                        # delete_collection signature may vary by version; try both styles
                        try:
                            client.delete_collection(name)
                        except TypeError:
                            client.delete_collection(name=name)  # type: ignore
                    except Exception:
                        pass
                # As a last resort, reset the client storage (dangerous if shared)
                try:
                    client.reset()
                except Exception:
                    pass
            except Exception:
                logger.exception("Failed during ChromaDB cleanup after collection exists error")
            # Retry graph construction once
            graph = TradingAgentsGraph(debug=debug, config=config)
        else:
            raise

    final_state, processed_signal = graph.propagate(symbol, trade_date)

    investment_state = final_state.get("investment_debate_state", {}) or {}
    risk_state = final_state.get("risk_debate_state", {}) or {}

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

    return output


@app.post("/propagate")
async def propagate(payload: PayloadModel):
    body = payload.dict()
    loop = asyncio.get_event_loop()
    symbol = body.get("symbol")
    trade_date = body.get("tradeDate")
    run_id = f"{datetime.utcnow().strftime('%Y%m%dT%H%M%S%f')}_{symbol}"
    logger.info(f"/propagate start run_id={run_id} symbol={symbol} tradeDate={trade_date}")
    start_ts = datetime.utcnow()
    RUNS[run_id] = {
        "run_id": run_id,
        "symbol": symbol,
        "trade_date": trade_date,
        "start_ts": start_ts.isoformat(),
        "status": "running",
        "heartbeat_ts": start_ts.isoformat(),
    }
    hb_task: Optional[asyncio.Task] = asyncio.create_task(_heartbeat(run_id))
    try:
        result = await loop.run_in_executor(executor, _run_propagate_sync, body)
        duration = (datetime.utcnow() - start_ts).total_seconds()
        logger.info(f"/propagate finished run_id={run_id} symbol={symbol} duration_s={duration:.1f}")

        # Persist input and output for auditing/inspection
        try:
            from pathlib import Path

            results_dir = os.environ.get("TRADING_AGENTS_RESULTS_DIR") or "./trading-results"
            results_path = Path(results_dir)
            (results_path / "decisions").mkdir(parents=True, exist_ok=True)
            ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
            safe_symbol = str(symbol).replace('/', '_') if symbol else 'unknown'
            out_file = results_path / "decisions" / f"{ts}_{safe_symbol}.json"
            with out_file.open('w', encoding='utf-8') as fh:
                json.dump({"input": body, "output": result, "duration_s": duration}, fh, ensure_ascii=False, indent=2)
            logger.info(f"Persisted propagate result to {out_file}")
            RUNS[run_id].update({
                "status": "finished",
                "end_ts": datetime.utcnow().isoformat(),
                "duration_s": duration,
                "output_path": str(out_file),
            })
            global LAST_RESULT
            LAST_RESULT = {
                "run_id": run_id,
                "symbol": symbol,
                "trade_date": trade_date,
                "duration_s": duration,
                "output_path": str(out_file),
                "completed_ts": datetime.utcnow().isoformat(),
            }
        except Exception:
            logger.exception("Failed to persist propagate result")
        finally:
            if hb_task:
                hb_task.cancel()
        return result
    except ValueError as exc:
        RUNS[run_id].update({"status": "error", "end_ts": datetime.utcnow().isoformat(), "error": str(exc)})
        global LAST_ERROR
        LAST_ERROR = {
            "run_id": run_id,
            "symbol": symbol,
            "error": str(exc),
            "ts": datetime.utcnow().isoformat(),
        }
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        logger.exception("Runtime error in propagate")
        RUNS[run_id].update({"status": "error", "end_ts": datetime.utcnow().isoformat(), "error": str(exc)})
        LAST_ERROR = {
            "run_id": run_id,
            "symbol": symbol,
            "error": str(exc),
            "ts": datetime.utcnow().isoformat(),
        }
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        logger.exception("Unhandled error in propagate")
        RUNS[run_id].update({"status": "error", "end_ts": datetime.utcnow().isoformat(), "error": str(exc)})
        LAST_ERROR = {
            "run_id": run_id,
            "symbol": symbol,
            "error": str(exc),
            "ts": datetime.utcnow().isoformat(),
        }
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if hb_task:
            try:
                hb_task.cancel()
            except Exception:
                pass


@app.get("/health")
def health():
    """Health endpoint that checks whether the tradingagents package is importable."""
    try:
        import importlib

        spec = importlib.util.find_spec("tradingagents")
        if spec is None:
            return {"ok": False, "error": "tradingagents not importable", "sys_path": sys.path}
        return {"ok": True, "tradingagents_origin": spec.origin}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.get("/status")
def status():
    """Return active runs, last result and last error for observability."""
    # Only include non-finished runs in active list
    active = [v for v in RUNS.values() if v.get("status") == "running"]
    return {
        "active": active,
        "last_result": LAST_RESULT,
        "last_error": LAST_ERROR,
    }


if __name__ == "__main__":
    # Run via uvicorn programmatically for convenience in development
    import uvicorn

    uvicorn.run("ta_server:app", host="127.0.0.1", port=8000, reload=False)

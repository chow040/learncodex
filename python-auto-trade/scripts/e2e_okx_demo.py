#!/usr/bin/env python3

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from typing import Any, Dict, Optional

import httpx

DEFAULT_BASE_URL = os.environ.get("AUTOTRADE_BASE_URL", "http://localhost:8085/internal/autotrade/v1")


class WorkflowError(RuntimeError):
    pass


async def run_workflow(
    *,
    base_url: str = DEFAULT_BASE_URL,
    runtime_mode: str = "paper",
    poll_timeout: float = 15.0,
    poll_interval: float = 1.0,
    transport: httpx.BaseTransport | None = None,
) -> Dict[str, Any]:
    """
    Trigger a full evaluation cycle via the HTTP API and return the resulting portfolio snapshot.
    """
    async with httpx.AsyncClient(base_url=base_url, timeout=10.0, transport=transport) as client:
        await _set_runtime_mode(client, runtime_mode)
        trigger_response = await _trigger_scheduler(client)
        portfolio = await _wait_for_portfolio(client, timeout=poll_timeout, interval=poll_interval)
        metrics = await _fetch_latency_metrics(client)
        return {
            "runtime_mode": runtime_mode,
            "trigger": trigger_response,
            "portfolio": portfolio,
            "latency_metrics": metrics,
        }


async def _set_runtime_mode(client: httpx.AsyncClient, mode: str) -> None:
    response = await client.patch("/runtime-mode", json={"mode": mode})
    if response.status_code != 200:
        raise WorkflowError(f"Failed to set runtime mode ({response.status_code}): {response.text}")


async def _trigger_scheduler(client: httpx.AsyncClient) -> Dict[str, Any]:
    response = await client.post("/scheduler/trigger")
    if response.status_code != 200:
        raise WorkflowError(f"Failed to trigger scheduler ({response.status_code}): {response.text}")
    payload = response.json()
    return {
        "triggered_at": payload.get("triggered_at"),
        "job_status": (payload.get("scheduler") or {}).get("jobs", [{}])[0],
    }


async def _wait_for_portfolio(
    client: httpx.AsyncClient,
    *,
    timeout: float,
    interval: float,
) -> Dict[str, Any]:
    deadline = time.time() + timeout
    last_error: Optional[str] = None
    while time.time() < deadline:
        response = await client.get("/portfolio")
        if response.status_code == 200:
            payload = response.json()
            portfolio = payload.get("portfolio")
            if portfolio:
                return portfolio
        else:
            last_error = response.text
        await asyncio.sleep(interval)
    raise WorkflowError(f"Timed out waiting for portfolio snapshot. Last error: {last_error}")


async def _fetch_latency_metrics(client: httpx.AsyncClient) -> Dict[str, Any] | None:
    response = await client.get("/metrics/latency/okx-order")
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json().get("stats")


def _format_summary(result: Dict[str, Any]) -> str:
    portfolio = result.get("portfolio") or {}
    positions = portfolio.get("positions") or []
    summary = {
        "runtime_mode": result.get("runtime_mode"),
        "triggered_at": result.get("trigger", {}).get("triggered_at"),
        "position_count": len(positions),
        "equity": portfolio.get("equity"),
        "pnl": portfolio.get("totalPnl") or portfolio.get("total_pnl"),
        "latency_stats": result.get("latency_metrics"),
    }
    return json.dumps(summary, indent=2, sort_keys=True)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Headless OKX demo workflow runner.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL for autotrade API")
    parser.add_argument("--runtime-mode", default="paper", help="Runtime mode to enforce before triggering the scheduler")
    parser.add_argument("--timeout", type=float, default=15.0, help="Seconds to wait for portfolio update")
    parser.add_argument("--interval", type=float, default=1.0, help="Polling interval for portfolio endpoint")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        result = asyncio.run(
            run_workflow(
                base_url=args.base_url,
                runtime_mode=args.runtime_mode,
                poll_timeout=args.timeout,
                poll_interval=args.interval,
            )
        )
    except WorkflowError as exc:
        print(f"[E2E] Workflow failed: {exc}", file=sys.stderr)
        return 1
    except httpx.HTTPError as exc:
        print(f"[E2E] HTTP error: {exc}", file=sys.stderr)
        return 2

    print("[E2E] Workflow completed successfully.")
    print(_format_summary(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

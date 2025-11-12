#!/usr/bin/env python3

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from typing import Any, Dict

import httpx

from scripts.e2e_okx_demo import DEFAULT_BASE_URL, WorkflowError, run_workflow


async def run_failover_drill(
    *,
    scenario: str,
    base_url: str = DEFAULT_BASE_URL,
    transport: httpx.BaseTransport | None = None,
) -> Dict[str, Any]:
    """
    Execute a failover drill by running the standard workflow and, upon failure,
    forcing runtime mode back to 'simulator'.
    """
    async with httpx.AsyncClient(base_url=base_url, timeout=10.0, transport=transport) as client:
        await client.patch("/runtime-mode", json={"mode": "paper"})

    try:
        result = await run_workflow(base_url=base_url, runtime_mode="paper", transport=transport)
        return {
            "scenario": scenario,
            "status": "healthy",
            "details": "No failure detected; failover not triggered.",
            "result": result,
        }
    except (WorkflowError, httpx.HTTPError) as exc:
        async with httpx.AsyncClient(base_url=base_url, timeout=10.0, transport=transport) as client:
            await client.patch("/runtime-mode", json={"mode": "simulator"})
        return {
            "scenario": scenario,
            "status": "failover_engaged",
            "details": f"Failure detected ({exc}); switched runtime mode to simulator.",
        }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulate failover scenarios for OKX demo trading.")
    parser.add_argument("--scenario", default="okx_outage", help="Scenario name for the drill.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL for the autotrade API.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    result = asyncio.run(run_failover_drill(scenario=args.scenario, base_url=args.base_url))
    print(f"[DRILL] Scenario: {result['scenario']}")
    print(f"[DRILL] Status: {result['status']}")
    print(f"[DRILL] Details: {result['details']}")
    return 0 if result["status"] == "healthy" else 1


if __name__ == "__main__":
    raise SystemExit(main())

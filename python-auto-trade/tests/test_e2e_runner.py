import asyncio
import json
from typing import Any, Dict

import httpx
import pytest

from scripts.e2e_okx_demo import run_workflow


class _MockServer:
    def __init__(self):
        self.mode = None
        self.triggered = False
        self.portfolio_ready = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/runtime-mode" and request.method == "PATCH":
            payload = json.loads(request.content.decode())
            self.mode = payload.get("mode")
            return httpx.Response(200, json={"mode": self.mode})
        if path == "/scheduler/trigger" and request.method == "POST":
            self.triggered = True
            self.portfolio_ready = True
            scheduler = {
                "jobs": [
                    {
                        "job_id": "portfolio-evaluator",
                        "status": "idle",
                        "last_run_at": "2024-01-01T00:00:00Z",
                    }
                ]
            }
            return httpx.Response(200, json={"triggered_at": "2024-01-01T00:00:00Z", "scheduler": scheduler})
        if path == "/portfolio" and request.method == "GET":
            if self.portfolio_ready:
                portfolio = {
                    "portfolio": {
                        "portfolioId": "okx-demo",
                        "equity": 10_500.0,
                        "totalPnl": 500.0,
                        "positions": [{"symbol": "BTC-USDT-SWAP", "size": 0.1}],
                    }
                }
                return httpx.Response(200, json=portfolio)
            return httpx.Response(503, json={"detail": "Portfolio not ready"})
        if path == "/metrics/latency/okx-order" and request.method == "GET":
            return httpx.Response(200, json={"stats": {"count": 1.0, "avg_ms": 20.0}})
        return httpx.Response(404, json={"detail": "Unknown route"})


@pytest.mark.asyncio
async def test_run_workflow_with_mock_transport():
    server = _MockServer()
    transport = httpx.MockTransport(server.handler)

    result = await run_workflow(
        base_url="http://mockserver",
        runtime_mode="paper",
        poll_timeout=2.0,
        poll_interval=0.1,
        transport=transport,
    )

    assert result["runtime_mode"] == "paper"
    assert result["portfolio"]["portfolioId"] == "okx-demo"
    assert result["latency_metrics"]["avg_ms"] == 20.0

import json

import httpx
import pytest

from scripts.failover_drill import run_failover_drill


class _HealthyServer:
    def __init__(self):
        self.mode = None

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/runtime-mode" and request.method == "PATCH":
            payload = json.loads(request.content.decode())
            self.mode = payload.get("mode")
            return httpx.Response(200, json={"mode": self.mode})
        if path == "/scheduler/trigger" and request.method == "POST":
            scheduler = {"jobs": [{"job_id": "portfolio-evaluator", "status": "idle"}]}
            return httpx.Response(200, json={"triggered_at": "2024-01-01T00:00:00Z", "scheduler": scheduler})
        if path == "/portfolio" and request.method == "GET":
            portfolio = {
                "portfolio": {
                    "portfolioId": "okx-demo",
                    "equity": 10_000.0,
                    "positions": [],
                }
            }
            return httpx.Response(200, json=portfolio)
        if path == "/metrics/latency/okx-order" and request.method == "GET":
            return httpx.Response(404, json={"detail": "No latency samples yet"})
        return httpx.Response(404)


class _FailingServer:
    def __init__(self):
        self.mode_changes = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/runtime-mode" and request.method == "PATCH":
            payload = json.loads(request.content.decode())
            self.mode_changes.append(payload.get("mode"))
            return httpx.Response(200, json={"mode": payload.get("mode")})
        if path == "/scheduler/trigger" and request.method == "POST":
            return httpx.Response(503, json={"detail": "OKX outage"})
        if path == "/portfolio":
            return httpx.Response(503, json={"detail": "Unavailable"})
        return httpx.Response(404)


@pytest.mark.asyncio
async def test_failover_drill_healthy_path():
    server = _HealthyServer()
    transport = httpx.MockTransport(server)

    result = await run_failover_drill(scenario="okx_outage", base_url="http://mock", transport=transport)

    assert result["status"] == "healthy"
    assert server.mode == "paper"


@pytest.mark.asyncio
async def test_failover_drill_triggers_failover():
    server = _FailingServer()
    transport = httpx.MockTransport(server)

    result = await run_failover_drill(scenario="okx_outage", base_url="http://mock", transport=transport)

    assert result["status"] == "failover_engaged"
    assert server.mode_changes[-1] == "simulator"

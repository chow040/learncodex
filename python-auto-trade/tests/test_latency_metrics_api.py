from fastapi.testclient import TestClient

from autotrade_service.main import app

client = TestClient(app)


def test_latency_metrics_endpoint(monkeypatch):
    async def fake_stats():  # not used, we patch sync function
        return {"count": 1.0, "min_ms": 10.0, "max_ms": 10.0, "avg_ms": 10.0, "latest_ms": 10.0}

    monkeypatch.setattr(
        "autotrade_service.api.routes.get_okx_order_latency_stats",
        lambda: {"count": 1.0, "min_ms": 10.0, "max_ms": 10.0, "avg_ms": 10.0, "latest_ms": 10.0},
    )

    response = client.get("/internal/autotrade/v1/metrics/latency/okx-order")
    assert response.status_code == 200
    payload = response.json()
    assert payload["stats"]["count"] == 1.0


def test_latency_metrics_endpoint_empty(monkeypatch):
    monkeypatch.setattr("autotrade_service.api.routes.get_okx_order_latency_stats", lambda: None)
    response = client.get("/internal/autotrade/v1/metrics/latency/okx-order")
    assert response.status_code == 404

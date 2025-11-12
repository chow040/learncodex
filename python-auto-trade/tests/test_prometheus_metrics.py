from fastapi.testclient import TestClient

from autotrade_service.main import app
from autotrade_service.observability import (
    PROMETHEUS_CONTENT_TYPE,
    generate_prometheus_metrics,
    record_okx_order_metric,
    record_scheduler_evaluation,
    reset_prometheus_metrics,
    update_portfolio_drawdown,
)


def test_prometheus_recorders_emit_metrics():
    reset_prometheus_metrics()
    record_okx_order_metric("success", latency_ms=120.0)
    record_okx_order_metric("rejected", latency_ms=50.0)
    record_scheduler_evaluation("success")
    record_scheduler_evaluation("failure")
    update_portfolio_drawdown(0.05)

    payload = generate_prometheus_metrics().decode()
    assert "okx_orders_total" in payload
    assert 'status="success"' in payload
    assert "scheduler_evaluations_total" in payload
    assert "portfolio_drawdown_pct" in payload


def test_prometheus_metrics_endpoint_exposes_registry():
    reset_prometheus_metrics()
    record_okx_order_metric("success", latency_ms=10.0)

    client = TestClient(app)
    response = client.get("/metrics")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith(PROMETHEUS_CONTENT_TYPE)
    assert "okx_orders_total" in response.text

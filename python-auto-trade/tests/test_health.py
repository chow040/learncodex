from fastapi.testclient import TestClient

from autotrade_service.main import app


def test_healthz():
    client = TestClient(app)
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_internal_health():
    client = TestClient(app)
    response = client.get("/internal/autotrade/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"

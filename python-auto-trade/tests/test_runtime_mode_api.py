from fastapi.testclient import TestClient

from autotrade_service.main import app

client = TestClient(app)


def test_get_runtime_mode_endpoint(monkeypatch):
    async def fake_get_mode(settings=None):
        return "paper"

    monkeypatch.setattr("autotrade_service.api.routes.get_runtime_mode_from_db", fake_get_mode)

    response = client.get("/internal/autotrade/v1/runtime-mode")
    assert response.status_code == 200
    assert response.json()["mode"] == "paper"


def test_patch_runtime_mode_endpoint(monkeypatch):
    async def fake_set_mode(mode, settings=None):
        return mode

    monkeypatch.setattr("autotrade_service.api.routes.set_runtime_mode_in_db", fake_set_mode)

    response = client.patch("/internal/autotrade/v1/runtime-mode", json={"mode": "simulator"})
    assert response.status_code == 200
    assert response.json()["mode"] == "simulator"

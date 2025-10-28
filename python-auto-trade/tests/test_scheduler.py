from __future__ import annotations

from fastapi.testclient import TestClient

from autotrade_service.main import app
from autotrade_service.scheduler import reset_scheduler


def test_scheduler_status_endpoint() -> None:
    reset_scheduler()
    with TestClient(app) as client:
        response = client.get("/internal/autotrade/v1/scheduler/status")
        assert response.status_code == 200
        payload = response.json()
        scheduler = payload["scheduler"]
        assert scheduler["implementation"] == "apscheduler"
        assert isinstance(scheduler["jobs"], list)
        assert scheduler["jobs"][0]["job_id"] == "portfolio-evaluator"


def test_scheduler_pause_and_resume() -> None:
    reset_scheduler()
    with TestClient(app) as client:
        pause = client.post("/internal/autotrade/v1/scheduler/pause")
        assert pause.status_code == 200
        assert pause.json()["status"] == "paused"

        resume = client.post("/internal/autotrade/v1/scheduler/resume")
        assert resume.status_code == 200
        assert resume.json()["status"] == "running"


def test_scheduler_trigger() -> None:
    reset_scheduler()
    with TestClient(app) as client:
        response = client.post("/internal/autotrade/v1/scheduler/trigger")
        assert response.status_code == 200
        payload = response.json()
        assert "triggered_at" in payload
        assert "scheduler" in payload
        scheduler = payload["scheduler"]
        assert scheduler["jobs"][0]["last_run_at"] is not None

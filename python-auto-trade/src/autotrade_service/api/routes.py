from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from ..config import Settings, get_settings
from ..repositories import fetch_decision_by_id, fetch_decisions, fetch_latest_portfolio
from ..scheduler import get_scheduler

router = APIRouter()


@router.get("/health", summary="Service health check")
def health(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    return {
        "service": settings.service_name,
        "status": "ok",
        "time": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/portfolio", summary="Fetch latest auto-trading portfolio")
async def get_portfolio(settings: Settings = Depends(get_settings)) -> dict:
    snapshot = await fetch_latest_portfolio()
    if snapshot is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Portfolio data unavailable")
    payload = asdict(snapshot)
    payload["service"] = settings.service_name
    payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    return {"portfolio": payload}


@router.get("/decisions", summary="List auto-trading decisions")
async def list_decisions(symbol: str | None = None) -> dict:
    decisions = await fetch_decisions(symbol)
    return {"items": [asdict(decision) for decision in decisions], "next_cursor": None}


@router.get("/decisions/{decision_id}", summary="Retrieve decision by id")
async def get_decision(decision_id: UUID) -> dict:
    decision = await fetch_decision_by_id(str(decision_id))
    if decision is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision not found")
    return {"decision": asdict(decision)}


@router.get("/scheduler/status", summary="Retrieve scheduler status")
async def scheduler_status() -> dict:
    scheduler = get_scheduler()
    status_payload = scheduler.status().as_dict()
    return {"scheduler": status_payload}


@router.post("/scheduler/pause", summary="Pause scheduler")
async def pause_scheduler() -> dict:
    scheduler = get_scheduler()
    await scheduler.pause()
    return {"status": "paused", "scheduler": scheduler.status().as_dict()}


@router.post("/scheduler/resume", summary="Resume scheduler")
async def resume_scheduler() -> dict:
    scheduler = get_scheduler()
    await scheduler.resume()
    return {"status": "running", "scheduler": scheduler.status().as_dict()}


@router.post("/scheduler/trigger", summary="Trigger immediate evaluation")
async def trigger_scheduler() -> dict:
    scheduler = get_scheduler()
    triggered_at = await scheduler.trigger_run()
    return {
        "triggered_at": triggered_at.isoformat(),
        "scheduler": scheduler.status().as_dict(),
    }

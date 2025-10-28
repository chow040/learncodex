from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api import api_router
from .config import get_settings
from .db import get_db
from .redis_client import get_redis
from .scheduler import get_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):  # pragma: no cover - placeholder for startup/shutdown
    settings = get_settings()
    logger = logging.getLogger(settings.service_name)
    logger.info("Starting %s", settings.service_name)
    db = get_db()
    try:
        await db.connect()
        logger.info("Database pool initialized")
    except Exception as exc:  # pragma: no cover - log and continue with mock mode
        logger.exception("Failed to initialize database pool: %s", exc)
    redis_client = get_redis()
    try:
        await redis_client.connect()
        logger.info("Redis client initialized")
    except Exception as exc:  # pragma: no cover
        logger.exception("Failed to initialize Redis client: %s", exc)
    scheduler = get_scheduler(settings.scheduler_impl)
    try:
        await scheduler.start()
        logger.info("Scheduler initialized with implementation %s", settings.scheduler_impl)
    except Exception as exc:  # pragma: no cover
        logger.exception("Failed to initialize scheduler: %s", exc)
    yield
    await get_db().disconnect()
    await get_redis().disconnect()
    await get_scheduler().stop()
    logger.info("Stopping %s", settings.service_name)


app = FastAPI(title="Auto Trading Service", lifespan=lifespan)
app.include_router(api_router, prefix="/internal/autotrade")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
def readyz() -> dict[str, str]:
    return {"status": "ok"}

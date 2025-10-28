"""API router definitions for the auto-trading service."""

from fastapi import APIRouter

from .routes import router as core_router

api_router = APIRouter()
api_router.include_router(core_router, prefix="/v1", tags=["core"])

__all__ = ["api_router"]

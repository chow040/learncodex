from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AUTOTRADE_", env_file=".env", env_file_encoding="utf-8")

    service_name: str = "autotrade-service"
    service_port: int = 8085
    scheduler_impl: Literal["apscheduler", "asyncio"] = "apscheduler"

    db_url: str | None = None
    redis_url: str | None = None

    deepseek_api_key: str | None = None
    service_key: str | None = None

    coinbase_key: str | None = None
    coinbase_secret: str | None = None
    coinbase_passphrase: str | None = None
    coinbase_base_url: str = "https://api.coinbase.com"

    metrics_port: int | None = None
    log_level: Literal["debug", "info", "warning", "error", "critical"] = "info"


@lru_cache
def get_settings() -> Settings:
    return Settings()


__all__ = ["Settings", "get_settings"]

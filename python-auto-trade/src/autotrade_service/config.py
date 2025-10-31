from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AUTOTRADE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="allow",
    )

    service_name: str = "autotrade-service"
    service_port: int = 8085
    scheduler_impl: Literal["apscheduler", "asyncio"] = "apscheduler"
    decision_interval_minutes: float = 3.0
    tool_cache_ttl_seconds: float | None = 30.0
    decision_trace_log_path: str | None = "logs/decision-traces.log"

    db_url: str | None = None
    redis_url: str | None = None

    deepseek_api_key: str | None = None
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"
    deepseek_timeout_seconds: float = 30.0
    deepseek_max_retries: int = 3
    deepseek_backoff_seconds: float = 1.0
    deepseek_backoff_max_seconds: float = 10.0
    deepseek_system_prompt: str = "You are AutoTrader, an LLM decision engine that manages a crypto derivatives portfolio."
    service_key: str | None = None

    symbols: list[str] | None = None
    ccxt_enabled: bool = False
    ccxt_exchange_id: str = "binance"
    ccxt_symbols: list[str] | None = None
    ccxt_symbol_map: dict[str, str] | None = None
    ccxt_poll_interval_seconds: float = 210.0
    ccxt_poll_jitter_seconds: float = 15.0
    ccxt_trades_limit: int = 200
    ccxt_ohlcv_limit: int = 150
    ccxt_timeframe: str = "1m"
    ccxt_enable_trades: bool = True
    ccxt_enable_ohlcv: bool = True
    ccxt_timeout_seconds: float = 10.0
    ccxt_max_retries: int = 3
    ccxt_backoff_seconds: float = 5.0
    ccxt_backoff_max_seconds: float = 120.0
    ccxt_api_key: str | None = None
    ccxt_secret: str | None = None
    ccxt_password: str | None = None
    tick_backpressure_max_stream_size: int | None = None
    tick_compaction_enabled: bool = False
    tick_compaction_interval_minutes: float = 5.0
    tick_compaction_timeframe_seconds: int = 60
    tick_compaction_max_bars: int = 120
    tick_compaction_max_ticks: int = 7200
    indicator_timeframe_seconds: int = 180
    indicator_volume_ratio_period: int = 20
    indicator_high_timeframe_seconds: int = 14_400
    indicator_high_volume_ratio_period: int = 6
    indicator_high_macd_series_points: int = 5

    metrics_port: int | None = None
    log_level: Literal["debug", "info", "warning", "error", "critical"] = "info"

    funding_provider_base_url: str | None = None
    funding_provider_api_key: str | None = None
    funding_provider_timeout_seconds: float = 5.0

    # Simulation settings
    simulation_enabled: bool = False
    simulation_state_path: str = "logs/simulation_state.json"
    simulation_starting_cash: float = 10000.0
    simulation_max_slippage_bps: int = 5
    simulation_position_size_limit_pct: float = 50.0


@lru_cache
def get_settings() -> Settings:
    return Settings()


__all__ = ["Settings", "get_settings"]

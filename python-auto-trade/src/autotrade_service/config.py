from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field

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
    dual_scheduler_enabled: bool = False
    trading_broker: Literal["simulated", "okx_demo"] = "simulated"
    llm_scheduler_interval_minutes: float = 5.0
    llm_data_stale_threshold_seconds: float = 30.0
    market_data_symbols: list[str] = Field(
        default_factory=lambda: [
            "BTC-USDT-SWAP",
            "ETH-USDT-SWAP",
            "SOL-USDT-SWAP",
            "BNB-USDT-SWAP",
            "DOGE-USDT-SWAP",
            "XRP-USDT-SWAP",
        ]
    )
    llm_trading_symbols: list[str] | None = None
    market_data_refresh_interval_seconds: float = 5.0
    market_data_ticker_ttl_seconds: int = 10
    market_data_orderbook_ttl_seconds: int = 10
    market_data_funding_ttl_seconds: int = 300
    market_data_short_timeframe: str = "15m"
    market_data_long_timeframe: str = "1h"
    market_data_short_ttl_seconds: int = 60
    market_data_long_ttl_seconds: int = 300
    market_data_indicator_ttl_seconds: int = 60
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
    ccxt_ohlcv_short_term_candles_no: int = 50 # Number of short term candles to fetch
    ccxt_ohlcv_long_term_candles_no: int = 100  # Number of long term candles to fetch (~5 days for 6h)
    ccxt_short_term_timeframe: str = "15m"  # Short-term timeframe for OHLCV data
    ccxt_long_term_timeframe: str = "1h"  # Long-term timeframe for trend context
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
    indicator_timeframe_seconds: int = 300
    indicator_volume_ratio_period: int = 20
    indicator_high_timeframe_seconds: int = 21_600
    indicator_high_volume_ratio_period: int = 6
    indicator_high_macd_series_points: int = 5

    metrics_port: int | None = None
    log_level: Literal["debug", "info", "warning", "error", "critical"] = "info"

    funding_provider_base_url: str | None = None
    funding_provider_api_key: str | None = None
    funding_provider_timeout_seconds: float = 5.0

    cors_allow_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://localhost:4000",
        ]
    )

    # OKX derivatives configuration
    okx_derivatives_enabled: bool = True
    okx_exchange_id: str = "okx"
    okx_funding_cache_ttl_seconds: float = 300.0
    okx_oi_cache_ttl_seconds: float = 60.0
    okx_rate_limit: int = 20
    okx_timeout_seconds: float = 10.0
    okx_max_retries: int = 3
    okx_backoff_seconds: float = 1.0
    okx_backoff_max_seconds: float = 10.0
    okx_demo_mode: bool = True
    okx_api_key: str | None = None
    okx_secret_key: str | None = None
    okx_passphrase: str | None = None
    okx_base_url: str = "https://my.okx.com"  # Use my.okx.com for regions where www.okx.com is blocked
    okx_symbol_mapping: dict[str, str] = {
        "BTC": "BTC-USDT-SWAP",
        "BTC-USD": "BTC-USDT-SWAP",
        "ETH": "ETH-USDT-SWAP",
        "ETH-USD": "ETH-USDT-SWAP",
        "SOL": "SOL-USDT-SWAP",
        "SOL-USD": "SOL-USDT-SWAP",
        "BNB": "BNB-USDT-SWAP",
        "BNB-USD": "BNB-USDT-SWAP",
        "XRP": "XRP-USDT-SWAP",
        "XRP-USD": "XRP-USDT-SWAP",
        "DOGE": "DOGE-USDT-SWAP",
        "DOGE-USD": "DOGE-USDT-SWAP",
    }

    # Simulation settings
    simulation_enabled: bool = False
    simulation_state_path: str = "logs/simulation_state.json"
    simulation_starting_cash: float = 10000.0
    simulation_max_slippage_bps: int = 5
    simulation_position_size_limit_pct: float = 50.0

    # Portfolio persistence
    auto_portfolio_user_id: str | None = None
    log_dir: str | None = "logs"

    # Feedback loop settings
    feedback_loop_enabled: bool = True
    feedback_max_rules_in_prompt: int = 8
    feedback_max_history_trades: int = 5
    feedback_rule_min_length: int = 10
    feedback_rule_max_length: int = 200
    feedback_similarity_threshold: float = 0.7
    position_sync_interval_seconds: float = 15.0

    def resolved_llm_symbols(self) -> list[str]:
        """
        Return the list of symbols the LLM should evaluate/trade.
        Falls back to market_data_symbols when a custom list is not provided.
        """
        return self.llm_trading_symbols or self.market_data_symbols


@lru_cache
def get_settings() -> Settings:
    return Settings()


__all__ = ["Settings", "get_settings"]

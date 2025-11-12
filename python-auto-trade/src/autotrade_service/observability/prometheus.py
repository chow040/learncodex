from __future__ import annotations

from typing import Literal

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

PROMETHEUS_CONTENT_TYPE = CONTENT_TYPE_LATEST

MetricsResult = Literal["success", "failure", "skipped"]
OrderStatus = Literal["success", "rejected", "failed"]


def _build_registry() -> tuple[CollectorRegistry, Counter, Histogram, Counter, Gauge]:
    registry = CollectorRegistry()
    okx_counter = Counter(
        "okx_orders_total",
        "Count of OKX demo broker orders by status",
        labelnames=("status",),
        registry=registry,
    )
    okx_latency = Histogram(
        "okx_order_latency_seconds",
        "Latency of OKX order submissions",
        buckets=(
            0.05,
            0.1,
            0.25,
            0.5,
            1.0,
            2.5,
            5.0,
            10.0,
        ),
        registry=registry,
    )
    scheduler_counter = Counter(
        "scheduler_evaluations_total",
        "Decision scheduler evaluations grouped by outcome",
        labelnames=("result",),
        registry=registry,
    )
    drawdown_gauge = Gauge(
        "portfolio_drawdown_pct",
        "Latest recorded drawdown percentage for the active portfolio",
        registry=registry,
    )
    return registry, okx_counter, okx_latency, scheduler_counter, drawdown_gauge


_registry, _okx_counter, _okx_latency, _scheduler_counter, _drawdown_gauge = _build_registry()


def record_okx_order_metric(status: OrderStatus, latency_ms: float | None = None) -> None:
    _okx_counter.labels(status=status).inc()
    if latency_ms is not None and latency_ms >= 0:
        _okx_latency.observe(latency_ms / 1000.0)


def record_scheduler_evaluation(result: MetricsResult) -> None:
    _scheduler_counter.labels(result=result).inc()


def update_portfolio_drawdown(drawdown_pct: float) -> None:
    try:
        value = float(drawdown_pct)
    except (TypeError, ValueError):
        return
    _drawdown_gauge.set(value)


def generate_prometheus_metrics() -> bytes:
    return generate_latest(_registry)


def reset_prometheus_metrics() -> None:
    global _registry, _okx_counter, _okx_latency, _scheduler_counter, _drawdown_gauge
    _registry, _okx_counter, _okx_latency, _scheduler_counter, _drawdown_gauge = _build_registry()

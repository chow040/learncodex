from __future__ import annotations

from typing import Literal

RuntimeMode = Literal["simulator", "paper", "live"]

MODE_TO_BROKER: dict[RuntimeMode, str] = {
    "simulator": "simulated",
    "paper": "okx_demo",
    "live": "okx_live",
}

BROKER_TO_MODE: dict[str, RuntimeMode] = {
    value: key for key, value in MODE_TO_BROKER.items()
}

DEFAULT_RUNTIME_MODE: RuntimeMode = "simulator"


def mode_to_broker(mode: str | None) -> str:
    if mode in MODE_TO_BROKER:
        return MODE_TO_BROKER[mode]  # type: ignore[index]
    return MODE_TO_BROKER[DEFAULT_RUNTIME_MODE]


def broker_to_mode(broker: str | None) -> RuntimeMode:
    if broker and broker in BROKER_TO_MODE:
        return BROKER_TO_MODE[broker]
    return DEFAULT_RUNTIME_MODE

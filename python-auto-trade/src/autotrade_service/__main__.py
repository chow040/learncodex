from __future__ import annotations

import uvicorn

from .config import get_settings


def main() -> None:  # pragma: no cover - thin wrapper
    settings = get_settings()
    uvicorn.run(
        "autotrade_service.main:app",
        host="0.0.0.0",
        port=settings.service_port,
        reload=False,
        factory=False,
        log_level=settings.log_level,
    )


if __name__ == "__main__":
    main()

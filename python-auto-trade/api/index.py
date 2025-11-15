"""Vercel serverless entrypoint that exposes the FastAPI app."""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure src/ (where autotrade_service lives) is on the import path.
SRC_DIR = Path(__file__).resolve().parents[1] / "src"
if str(SRC_DIR) not in sys.path:
  sys.path.append(str(SRC_DIR))

from autotrade_service.main import app as fastapi_app  # type: ignore  # noqa: E402

app = fastapi_app

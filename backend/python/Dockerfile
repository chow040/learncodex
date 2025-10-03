FROM python:3.11-slim

# Non-root, small image for running the TA FastAPI server
ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Copy requirements and install. Build context should be the repository root so
# backend/python/requirements.txt exists at this path during docker build.
COPY backend/python/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the repository into the image. Build from repo root:
#   docker build -f backend/python/Dockerfile -t ta-server .
COPY . /app

# Ensure the TradingAgents path points to the included repo copy
ENV TRADING_AGENTS_PATH=/app/TradingAgents-main

# Port used by the FastAPI server
EXPOSE 8000

# Run with Uvicorn
CMD ["uvicorn", "backend.python.ta_server:app", "--host", "0.0.0.0", "--port", "8000"]

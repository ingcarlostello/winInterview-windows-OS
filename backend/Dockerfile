# Backend image for Railway. Python 3.14 is required by pyproject.toml and is
# NOT guaranteed by Nixpacks/Railpack, so we pin the official slim image.
#
# Railway: set the service "Root Directory" to `backend` so this Dockerfile is
# found, and bind to $PORT (injected by Railway). After moving audio capture to
# the client, the backend has NO native audio deps — slim is enough.
FROM python:3.14-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    POETRY_VERSION=2.4.1 \
    POETRY_VIRTUALENVS_CREATE=false

# Uncomment if a wheel needs to compile from source (e.g. cryptography on a
# platform without a prebuilt cp314 wheel):
# RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
#     && rm -rf /var/lib/apt/lists/*

RUN pip install "poetry==${POETRY_VERSION}"

WORKDIR /app

# Install dependencies first for better layer caching. --no-root: don't install
# the project package itself (we run it from src/ via the package path below).
COPY pyproject.toml poetry.lock ./
RUN poetry install --no-root --only main

COPY . .

# The package lives under src/ (tool.poetry packages = [{include="backend", from="src"}]).
# poetry install --no-root skipped installing it, so expose it on PYTHONPATH.
ENV PYTHONPATH=/app/src

EXPOSE 8000

# Shell form so ${PORT} expands. Bind 0.0.0.0 (Railway requirement). Explicit WS
# keepalive pings (default 20s) keep the connection alive through Railway's idle
# proxy; --no-server-header is cosmetic hardening.
CMD poetry run uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port ${PORT:-8000} \
    --ws-ping-interval 20 \
    --ws-ping-timeout 20 \
    --proxy-headers \
    --forwarded-allow-ips '*'

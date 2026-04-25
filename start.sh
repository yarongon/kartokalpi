#!/bin/bash
set -e

echo "Starting Karto-Kalpi backend..."
PORT_VALUE="${PORT:-8000}"
uv run uvicorn src.backend.main:app --host 0.0.0.0 --port "${PORT_VALUE}"
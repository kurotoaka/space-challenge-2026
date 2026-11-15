#!/usr/bin/env bash
set -u

cd "$(dirname "$0")"

# Stop any previous instances cleanly
pkill -f "uvicorn main:app" >/dev/null 2>&1 || true
pkill -f "vite --port=3000" >/dev/null 2>&1 || true
sleep 1

if [ -f "venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  . venv/bin/activate
fi

# Start FastAPI backend on port 8000
uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000 --workers 1 > uvicorn.log 2>&1 &
UVICORN_PID=$!

trap 'kill "$UVICORN_PID" >/dev/null 2>&1 || true' EXIT

sleep 2
if curl -fsS http://localhost:8000/api/health >/dev/null 2>&1; then
  echo "FastAPI healthy on http://localhost:8000"
else
  echo "Warning: FastAPI failed health check; see uvicorn.log"
fi

# Start React Vite dev server on port 3000
VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:8000}" npm run dev

#!/bin/bash
set -u

cd "$(dirname "$0")" || exit 1

# Load optional .env (e.g. EARTHDATA_TOKEN) into environment
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# Stop any previous instances cleanly after Ctrl+C or crashes
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

cleanup() {
  kill "$UVICORN_PID" >/dev/null 2>&1 || true
}
trap cleanup INT TERM EXIT

HEALTHY=0
for _ in $(seq 1 10); do
  if curl -fsS http://localhost:8000/api/health >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 1
done

if [ "$HEALTHY" -eq 1 ]; then
  echo "FastAPI healthy on http://localhost:8000"
else
  echo "Warning: FastAPI failed health check; last lines of uvicorn.log:"
  tail -n 20 uvicorn.log || true
fi

# Start React Vite dev server on port 3000
VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:8000}" npm run dev

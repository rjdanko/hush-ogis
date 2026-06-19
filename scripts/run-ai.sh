#!/usr/bin/env bash
set -euo pipefail
SVC="apps/ai-service"
PY="$SVC/.venv/Scripts/python.exe"
[ -f "$PY" ] || PY="$SVC/.venv/bin/python"   # cross-platform venv path

if [ "${1:-}" = "--setup" ]; then
  python -m venv "$SVC/.venv"
  "$PY" -m pip install --upgrade pip
  "$PY" -m pip install -e "$SVC[dev]"
  exit 0
fi

PORT="${AI_SERVICE_PORT:-8000}"
exec "$PY" -m uvicorn app.main:app --app-dir "$SVC" --port "$PORT" --reload

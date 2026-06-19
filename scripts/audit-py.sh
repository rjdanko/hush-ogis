#!/usr/bin/env bash
set -euo pipefail
SVC="apps/ai-service"
PY="$SVC/.venv/Scripts/python.exe"
[ -f "$PY" ] || PY="$SVC/.venv/bin/python"
"$PY" -m pip_audit

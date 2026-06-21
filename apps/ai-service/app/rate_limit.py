"""In-memory fixed-window limiter (SR-1).

A Python port of the dashboard limiter (``apps/dashboard/lib/rate-limit.ts``)
so behavior matches across services. Scoped to a single process -- correct for
local dev / single-instance deployment; a multi-instance production deployment
would need a shared store (e.g. Redis). That's a real gap, out of scope here.
"""

import time

from fastapi import HTTPException

# Buckets keyed by f"{identity}:{action}" -> {"count", "window_start"}.
_buckets: dict[str, dict[str, float]] = {}


def _now() -> float:
    """Monotonic clock seam (monkeypatched in tests)."""
    return time.monotonic()


def check_rate_limit(
    identity: str, action: str, limit: int, window_seconds: float
) -> bool:
    """Return True if the call is allowed, False if over limit.

    New or expired window resets the bucket to count 1 (allowed). Within the
    window with ``count >= limit`` is not allowed; otherwise increment (allowed).
    """
    key = f"{identity}:{action}"
    now = _now()
    existing = _buckets.get(key)

    if existing is None or now - existing["window_start"] >= window_seconds:
        _buckets[key] = {"count": 1, "window_start": now}
        return True

    if existing["count"] >= limit:
        return False

    existing["count"] += 1
    return True


def enforce_rate_limit(
    identity: str, action: str, limit: int, window_seconds: float
) -> None:
    """Raise HTTPException(429) when the call is over limit; otherwise pass."""
    if not check_rate_limit(identity, action, limit, window_seconds):
        raise HTTPException(status_code=429, detail="rate_limited")


def _reset() -> None:
    """Clear all buckets (test hook)."""
    _buckets.clear()

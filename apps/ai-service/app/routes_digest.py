"""Operator weekly digest endpoint (B5).

Order of work per request (SR-1 / SR-3): verify the operator JWT first (cheap,
no DB), then enforce the per-operator rate limit, then validate the path param
shape, and only then touch the DB (RPC) and the LLM. Every expensive call is
gated behind auth + rate-limit.

``fetch_zone_weekly_metrics`` and ``generate_digest`` are imported into this
module (rather than referenced via their home modules) so tests can monkeypatch
them here without hitting the real DB or Claude.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_operator
from app.digest import generate_digest
from app.models import DigestResponse
from app.rate_limit import enforce_rate_limit
from app.supabase_client import ZoneNotAuthorizedError, fetch_zone_weekly_metrics

router = APIRouter()

_DIGEST_RATE_LIMIT = 5
_DIGEST_RATE_WINDOW_SECONDS = 60


@router.post("/zones/{zone_id}/digest", response_model=DigestResponse)
def create_zone_digest(
    zone_id: uuid.UUID,
    operator_id: str = Depends(require_operator),
) -> DigestResponse:
    # Auth has already run (Depends). Gate expensive work behind the limiter.
    enforce_rate_limit(
        operator_id,
        "digest",
        limit=_DIGEST_RATE_LIMIT,
        window_seconds=_DIGEST_RATE_WINDOW_SECONDS,
    )

    try:
        metrics = fetch_zone_weekly_metrics(str(zone_id), operator_id)
    except ZoneNotAuthorizedError:
        # Generic 404: never disclose whether the zone exists but is unowned
        # vs. does not exist at all.
        raise HTTPException(status_code=404, detail="not_found") from None

    # Any failure here propagates to the global handler -> generic 500.
    return generate_digest(metrics)

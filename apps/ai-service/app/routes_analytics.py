"""Operator analytics endpoint (O3): the raw zone_weekly_metrics aggregate,
for the dashboard's trend chart. The digest endpoint (routes_digest.py)
already calls the same RPC but only returns Claude's text summary -- this
exposes the underlying numbers directly so the chart doesn't need an LLM call
just to render.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_operator
from app.models import ZoneAnalyticsResponse
from app.rate_limit import enforce_rate_limit
from app.supabase_client import ZoneNotAuthorizedError, fetch_zone_weekly_metrics

router = APIRouter()

_ANALYTICS_RATE_LIMIT = 30
_ANALYTICS_RATE_WINDOW_SECONDS = 60


@router.get("/zones/{zone_id}/analytics", response_model=ZoneAnalyticsResponse)
def get_zone_analytics(
    zone_id: uuid.UUID,
    operator_id: str = Depends(require_operator),
) -> ZoneAnalyticsResponse:
    enforce_rate_limit(
        operator_id,
        "analytics",
        limit=_ANALYTICS_RATE_LIMIT,
        window_seconds=_ANALYTICS_RATE_WINDOW_SECONDS,
    )

    try:
        metrics = fetch_zone_weekly_metrics(str(zone_id), operator_id)
    except ZoneNotAuthorizedError:
        raise HTTPException(status_code=404, detail="not_found") from None

    return ZoneAnalyticsResponse(**metrics)

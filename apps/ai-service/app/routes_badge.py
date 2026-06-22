"""Certification badge endpoints (O4, SR-11).

Two halves with very different trust boundaries:
  * POST /zones/{zone_id}/badge-token -- operator-authenticated (SR-3/SR-7);
    computes the zone's current average Quiet Index and mints a short-TTL
    signed token carrying that value.
  * GET /badge/{token} -- public (this is the URL embedded on an external
    page, so it cannot require a bearer header); trusts ONLY the token's
    signature + expiry, never touches the DB.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.auth import require_operator
from app.badge import BadgeTokenError, sign_badge_token, verify_badge_token
from app.badge_svg import render_badge_svg, render_unverified_badge_svg
from app.models import BadgeTokenResponse
from app.rate_limit import enforce_rate_limit
from app.settings import get_settings
from app.supabase_client import ZoneNotAuthorizedError, fetch_zone_badge_average

router = APIRouter()

_BADGE_TOKEN_RATE_LIMIT = 10
_BADGE_TOKEN_RATE_WINDOW_SECONDS = 60


@router.post("/zones/{zone_id}/badge-token", response_model=BadgeTokenResponse)
def create_badge_token(
    zone_id: uuid.UUID,
    operator_id: str = Depends(require_operator),
) -> BadgeTokenResponse:
    enforce_rate_limit(
        operator_id,
        "badge-token",
        limit=_BADGE_TOKEN_RATE_LIMIT,
        window_seconds=_BADGE_TOKEN_RATE_WINDOW_SECONDS,
    )

    try:
        avg_value = fetch_zone_badge_average(str(zone_id), operator_id)
    except ZoneNotAuthorizedError:
        raise HTTPException(status_code=404, detail="not_found") from None

    if avg_value is None:
        raise HTTPException(status_code=422, detail="insufficient_data")

    ttl_seconds = get_settings().BADGE_TOKEN_TTL_SECONDS
    token = sign_badge_token(str(zone_id), avg_value, ttl_seconds)
    return BadgeTokenResponse(token=token, expires_in=ttl_seconds)


@router.get("/badge/{token}")
def render_badge(token: str) -> Response:
    try:
        claims = verify_badge_token(token)
    except BadgeTokenError:
        return Response(
            content=render_unverified_badge_svg(),
            media_type="image/svg+xml",
            status_code=403,
        )

    return Response(
        content=render_badge_svg(claims["avg_value"]),
        media_type="image/svg+xml",
    )

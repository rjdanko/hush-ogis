"""Signed, short-TTL certification badge tokens (O4, SR-11).

The badge token is a self-contained, signed JWT carrying the zone id and the
average Quiet Index value as of mint time. The public render endpoint
(app/routes_badge.py) trusts ONLY this signature + expiry -- it never
re-touches the DB -- so a forged or stale (expired) token must be rejected
here before the value it carries is ever drawn into an SVG.
"""

import time

import jwt

from app.settings import get_settings


class BadgeTokenError(Exception):
    """Raised when a badge token fails signature or expiry verification."""


def sign_badge_token(zone_id: str, avg_value: float, ttl_seconds: int) -> str:
    """Mint a signed JWT carrying the zone id and average Quiet Index value."""
    now = int(time.time())
    payload = {
        "zone_id": zone_id,
        "avg_value": avg_value,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return jwt.encode(payload, get_settings().BADGE_SIGNING_SECRET, algorithm="HS256")


def verify_badge_token(token: str) -> dict:
    """Verify signature + expiry and return the token's claims.

    Raises ``BadgeTokenError`` on any forged signature or expired token -- the
    underlying PyJWT error reason is never surfaced (SR-15).
    """
    try:
        return jwt.decode(
            token,
            get_settings().BADGE_SIGNING_SECRET,
            algorithms=["HS256"],
        )
    except jwt.PyJWTError as exc:
        raise BadgeTokenError("invalid_or_expired_token") from exc

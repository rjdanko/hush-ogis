"""Unit tests for signed badge token mint/verify (O4, SR-11).

These two properties are the entire security contract of the public badge
endpoint, so they're tested directly here, independent of the HTTP layer:
forged signatures and expired tokens must both be rejected.
"""

import time

import jwt
import pytest

from app.badge import BadgeTokenError, sign_badge_token, verify_badge_token
from app.settings import get_settings

TEST_BADGE_SECRET = "test-badge-secret"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "jwt-secret")
    monkeypatch.setenv("BADGE_SIGNING_SECRET", TEST_BADGE_SECRET)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_sign_then_verify_round_trips_claims():
    token = sign_badge_token("zone-1", 82.5, ttl_seconds=60)
    claims = verify_badge_token(token)
    assert claims["zone_id"] == "zone-1"
    assert claims["avg_value"] == 82.5


def test_forged_signature_is_rejected():
    payload = {
        "zone_id": "zone-1",
        "avg_value": 82.5,
        "iat": int(time.time()),
        "exp": int(time.time()) + 60,
    }
    forged = jwt.encode(payload, "wrong-secret", algorithm="HS256")
    with pytest.raises(BadgeTokenError):
        verify_badge_token(forged)


def test_expired_token_is_rejected():
    expired_payload = {
        "zone_id": "zone-1",
        "avg_value": 82.5,
        "iat": int(time.time()) - 1000,
        "exp": int(time.time()) - 1,
    }
    expired = jwt.encode(expired_payload, TEST_BADGE_SECRET, algorithm="HS256")
    with pytest.raises(BadgeTokenError):
        verify_badge_token(expired)

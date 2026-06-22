"""Integration tests for the badge endpoints (O4, SR-11).

Hermetic: ``fetch_zone_badge_average`` is monkeypatched on app.routes_badge so
no real DB is hit. The forged/stale rejection tests exercise the real
sign/verify path end to end through the HTTP layer.
"""

import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app import rate_limit
from app.main import app
from app.settings import get_settings
from app.supabase_client import ZoneNotAuthorizedError

TEST_JWT_SECRET = "test-jwt-secret"
TEST_BADGE_SECRET = "test-badge-secret"
OPERATOR_ID = "11111111-1111-1111-1111-111111111111"
ZONE_ID = "22222222-2222-2222-2222-222222222222"

REQUIRED_ENV = {
    "ANTHROPIC_API_KEY": "sk-ant-test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role-key",
    "SUPABASE_JWT_SECRET": TEST_JWT_SECRET,
    "BADGE_SIGNING_SECRET": TEST_BADGE_SECRET,
}


@pytest.fixture(autouse=True)
def _env_and_state(monkeypatch):
    for key, val in REQUIRED_ENV.items():
        monkeypatch.setenv(key, val)
    get_settings.cache_clear()
    rate_limit._reset()
    try:
        yield
    finally:
        get_settings.cache_clear()
        rate_limit._reset()


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def _mint_operator_token(secret: str = TEST_JWT_SECRET, **overrides) -> str:
    payload = {"sub": OPERATOR_ID, "aud": "authenticated", "exp": int(time.time()) + 3600}
    payload.update(overrides)
    return jwt.encode(payload, secret, algorithm="HS256")


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_mint_returns_signed_token(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_badge.fetch_zone_badge_average", lambda zone_id, operator_id: 87.0
    )
    resp = client.post(f"/zones/{ZONE_ID}/badge-token", headers=_auth_header(_mint_operator_token()))
    assert resp.status_code == 200
    body = resp.json()
    assert "token" in body
    assert body["expires_in"] == 300


def test_mint_requires_operator_auth(client):
    resp = client.post(f"/zones/{ZONE_ID}/badge-token")
    assert resp.status_code == 401


def test_mint_zone_not_owned_returns_generic_404(client, monkeypatch):
    def _raise(zone_id, operator_id):
        raise ZoneNotAuthorizedError("zone not owned")

    monkeypatch.setattr("app.routes_badge.fetch_zone_badge_average", _raise)
    resp = client.post(f"/zones/{ZONE_ID}/badge-token", headers=_auth_header(_mint_operator_token()))
    assert resp.status_code == 404
    assert resp.json() == {"detail": "not_found"}


def test_mint_insufficient_data_returns_422(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_badge.fetch_zone_badge_average", lambda zone_id, operator_id: None
    )
    resp = client.post(f"/zones/{ZONE_ID}/badge-token", headers=_auth_header(_mint_operator_token()))
    assert resp.status_code == 422


def test_mint_rate_limit_returns_429(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_badge.fetch_zone_badge_average", lambda zone_id, operator_id: 50.0
    )
    last = None
    for _ in range(11):  # limit is 10 within the window
        last = client.post(f"/zones/{ZONE_ID}/badge-token", headers=_auth_header(_mint_operator_token()))
    assert last.status_code == 429


def test_render_valid_token_returns_svg(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_badge.fetch_zone_badge_average", lambda zone_id, operator_id: 73.4
    )
    mint = client.post(f"/zones/{ZONE_ID}/badge-token", headers=_auth_header(_mint_operator_token()))
    token = mint.json()["token"]

    resp = client.get(f"/badge/{token}")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/svg+xml")
    assert "73" in resp.text


def test_render_forged_token_is_rejected(client):
    forged = jwt.encode(
        {"zone_id": ZONE_ID, "avg_value": 99.0, "exp": int(time.time()) + 60},
        "wrong-secret",
        algorithm="HS256",
    )
    resp = client.get(f"/badge/{forged}")
    assert resp.status_code == 403
    assert resp.headers["content-type"].startswith("image/svg+xml")


def test_render_stale_token_is_rejected(client):
    expired = jwt.encode(
        {"zone_id": ZONE_ID, "avg_value": 99.0, "exp": int(time.time()) - 1},
        TEST_BADGE_SECRET,
        algorithm="HS256",
    )
    resp = client.get(f"/badge/{expired}")
    assert resp.status_code == 403

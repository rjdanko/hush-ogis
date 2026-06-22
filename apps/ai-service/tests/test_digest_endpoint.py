"""Integration tests for the POST /zones/{zone_id}/digest endpoint (B5).

Hermetic: the JWT secret is monkeypatched and tokens are minted in-test; the DB
RPC and the Claude call are both monkeypatched on ``app.routes_digest`` so no
real network/DB/LLM is hit. Rate-limit + settings-cache state is reset per test.
"""

import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app import rate_limit
from app.main import app
from app.models import DigestResponse, Suggestion
from app.settings import get_settings
from app.supabase_client import ZoneNotAuthorizedError

TEST_SECRET = "test-jwt-secret"
OPERATOR_ID = "11111111-1111-1111-1111-111111111111"
ZONE_ID = "22222222-2222-2222-2222-222222222222"

REQUIRED_ENV = {
    "ANTHROPIC_API_KEY": "sk-ant-test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role-key",
    "SUPABASE_JWT_SECRET": TEST_SECRET,
    "BADGE_SIGNING_SECRET": "badge-signing-secret",
}

_FAKE_METRICS = {"zone_name": "Demo Cafe", "check_in_count": 12}
_FAKE_DIGEST = DigestResponse(
    summary="A calm week.",
    suggestions=[Suggestion(title="Keep going", body="Steady and quiet.")],
)


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


def _mint(secret: str = TEST_SECRET, **overrides) -> str:
    payload = {"sub": OPERATOR_ID, "aud": "authenticated", "exp": int(time.time()) + 3600}
    payload.update(overrides)
    return jwt.encode(payload, secret, algorithm="HS256")


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _patch_happy(monkeypatch):
    monkeypatch.setattr(
        "app.routes_digest.fetch_zone_weekly_metrics",
        lambda zone_id, operator_id: _FAKE_METRICS,
    )
    monkeypatch.setattr(
        "app.routes_digest.generate_digest",
        lambda metrics: _FAKE_DIGEST,
    )


def test_happy_path_returns_digest(client, monkeypatch):
    _patch_happy(monkeypatch)
    resp = client.post(f"/zones/{ZONE_ID}/digest", headers=_auth_header(_mint()))
    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"] == "A calm week."
    assert body["suggestions"][0]["title"] == "Keep going"
    assert body["suggestions"][0]["body"] == "Steady and quiet."


def test_no_token_returns_401(client):
    resp = client.post(f"/zones/{ZONE_ID}/digest")
    assert resp.status_code == 401


def test_garbage_token_returns_401(client):
    resp = client.post(
        f"/zones/{ZONE_ID}/digest", headers={"Authorization": "Bearer not-a-jwt"}
    )
    assert resp.status_code == 401


def test_non_uuid_zone_id_returns_422(client, monkeypatch):
    _patch_happy(monkeypatch)
    resp = client.post("/zones/not-a-uuid/digest", headers=_auth_header(_mint()))
    assert resp.status_code == 422


def test_rate_limit_returns_429(client, monkeypatch):
    _patch_happy(monkeypatch)
    last = None
    for _ in range(6):  # limit is 5 within the window
        last = client.post(f"/zones/{ZONE_ID}/digest", headers=_auth_header(_mint()))
    assert last.status_code == 429


def test_zone_not_authorized_returns_generic_404(client, monkeypatch):
    def _raise(zone_id, operator_id):
        raise ZoneNotAuthorizedError("zone 22222222 is not owned by operator 11111111")

    monkeypatch.setattr("app.routes_digest.fetch_zone_weekly_metrics", _raise)
    resp = client.post(f"/zones/{ZONE_ID}/digest", headers=_auth_header(_mint()))
    assert resp.status_code == 404
    assert resp.json() == {"detail": "not_found"}
    # Must not disclose existence/ownership details.
    body = resp.text.lower()
    assert "not owned" not in body
    assert "operator" not in body
    assert ZONE_ID not in resp.text


def test_downstream_error_returns_generic_500(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_digest.fetch_zone_weekly_metrics",
        lambda zone_id, operator_id: _FAKE_METRICS,
    )

    def _boom(metrics):
        raise RuntimeError("boom secret")

    monkeypatch.setattr("app.routes_digest.generate_digest", _boom)
    resp = client.post(f"/zones/{ZONE_ID}/digest", headers=_auth_header(_mint()))
    assert resp.status_code == 500
    assert resp.json() == {"error": "internal_error"}
    assert "boom secret" not in resp.text

"""Integration tests for GET /zones/{zone_id}/analytics (O3).

Reuses fetch_zone_weekly_metrics (same RPC the digest endpoint calls) but
returns the raw aggregate numbers as JSON for the dashboard's trend chart,
instead of Claude's text summary.
"""

import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app import rate_limit
from app.main import app
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
    "BADGE_SIGNING_SECRET": "test-badge-secret",
}

_FAKE_METRICS = {
    "zone_name": "Demo Cafe",
    "window_days": 7,
    "quiet_index_trend": [
        {"day": "2026-06-15T00:00:00+00:00", "avg_value": 81.2, "avg_active_count": 4.0}
    ],
    "check_in_count": 12,
    "total_quiet_minutes": 240.5,
    "total_points_accrued": 480,
    "redemption_count": 3,
    "peak_window": {"hour_of_day": 18, "max_active_count": 9},
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


def _mint(secret: str = TEST_SECRET, **overrides) -> str:
    payload = {"sub": OPERATOR_ID, "aud": "authenticated", "exp": int(time.time()) + 3600}
    payload.update(overrides)
    return jwt.encode(payload, secret, algorithm="HS256")


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_happy_path_returns_metrics(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_analytics.fetch_zone_weekly_metrics",
        lambda zone_id, operator_id: _FAKE_METRICS,
    )
    resp = client.get(f"/zones/{ZONE_ID}/analytics", headers=_auth_header(_mint()))
    assert resp.status_code == 200
    body = resp.json()
    assert body["zone_name"] == "Demo Cafe"
    assert body["quiet_index_trend"][0]["avg_value"] == 81.2
    assert body["peak_window"]["hour_of_day"] == 18


def test_no_token_returns_401(client):
    resp = client.get(f"/zones/{ZONE_ID}/analytics")
    assert resp.status_code == 401


def test_zone_not_authorized_returns_generic_404(client, monkeypatch):
    def _raise(zone_id, operator_id):
        raise ZoneNotAuthorizedError("zone not owned")

    monkeypatch.setattr("app.routes_analytics.fetch_zone_weekly_metrics", _raise)
    resp = client.get(f"/zones/{ZONE_ID}/analytics", headers=_auth_header(_mint()))
    assert resp.status_code == 404
    assert resp.json() == {"detail": "not_found"}


def test_rate_limit_returns_429(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_analytics.fetch_zone_weekly_metrics",
        lambda zone_id, operator_id: _FAKE_METRICS,
    )
    last = None
    for _ in range(31):  # limit is 30 within the window
        last = client.get(f"/zones/{ZONE_ID}/analytics", headers=_auth_header(_mint()))
    assert last.status_code == 429

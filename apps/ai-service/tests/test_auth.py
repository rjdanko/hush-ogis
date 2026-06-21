import time

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth import require_operator
from app.settings import get_settings

TEST_SECRET = "test-jwt-secret"
OPERATOR_ID = "11111111-1111-1111-1111-111111111111"

REQUIRED_ENV = {
    "ANTHROPIC_API_KEY": "sk-ant-test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role-key",
    "SUPABASE_JWT_SECRET": TEST_SECRET,
}


@pytest.fixture
def client(monkeypatch):
    for key, val in REQUIRED_ENV.items():
        monkeypatch.setenv(key, val)
    get_settings.cache_clear()

    app = FastAPI()

    @app.get("/whoami")
    def whoami(operator_id: str = Depends(require_operator)) -> dict[str, str]:
        return {"operator_id": operator_id}

    try:
        yield TestClient(app)
    finally:
        get_settings.cache_clear()


def _mint(payload: dict, secret: str = TEST_SECRET) -> str:
    return jwt.encode(payload, secret, algorithm="HS256")


def _valid_payload(**overrides) -> dict:
    payload = {
        "sub": OPERATOR_ID,
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
    }
    payload.update(overrides)
    return payload


def _assert_generic_401(resp):
    assert resp.status_code == 401
    assert resp.json() == {"detail": "unauthorized"}
    body = resp.text.lower()
    # No library internals leaked.
    assert "signature" not in body
    assert "audience" not in body
    assert "expired" not in body


def test_valid_token_returns_operator_id(client):
    token = _mint(_valid_payload())
    resp = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {"operator_id": OPERATOR_ID}


def test_missing_authorization_header(client):
    _assert_generic_401(client.get("/whoami"))


def test_header_without_bearer_prefix(client):
    token = _mint(_valid_payload())
    _assert_generic_401(client.get("/whoami", headers={"Authorization": token}))


def test_wrong_secret(client):
    token = _mint(_valid_payload(), secret="wrong-secret")
    _assert_generic_401(
        client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    )


def test_expired_token(client):
    token = _mint(_valid_payload(exp=int(time.time()) - 10))
    _assert_generic_401(
        client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    )


def test_wrong_audience(client):
    token = _mint(_valid_payload(aud="anon"))
    _assert_generic_401(
        client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    )


def test_missing_sub(client):
    payload = _valid_payload()
    del payload["sub"]
    token = _mint(payload)
    _assert_generic_401(
        client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    )

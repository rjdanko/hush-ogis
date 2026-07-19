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
    "GROQ_API_KEY": "gsk-test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role-key",
    "SUPABASE_JWT_SECRET": TEST_SECRET,
    "BADGE_SIGNING_SECRET": "badge-signing-secret",
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


from jwt import PyJWK

EC_PRIVATE_KEY_PEM = """-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIHMcktupLHvtjVMqttWgoauPnD5KkwY6/G58H4cfHVrdoAoGCCqGSM49
AwEHoUQDQgAEwk+AYea2ujUMcMm42Q620VSaSwc/UXXVm2jI7Q02F1TlN/5FWfjF
1gKSJRyRNz587QvdUANHp69sKC4SdM5rfg==
-----END EC PRIVATE KEY-----"""

EC_PUBLIC_JWK = {
    "kty": "EC",
    "crv": "P-256",
    "kid": "test-es256-kid",
    "x": "wk-AYea2ujUMcMm42Q620VSaSwc_UXXVm2jI7Q02F1Q",
    "y": "5Tf-RVn4xdYCkiUckTc-fO0L3VADR6evbCguEnTOa34",
    "use": "sig",
    "alg": "ES256",
}


def _mint_es256(payload: dict) -> str:
    return jwt.encode(
        payload, EC_PRIVATE_KEY_PEM, algorithm="ES256", headers={"kid": "test-es256-kid"}
    )


@pytest.fixture
def jwks_client(monkeypatch):
    """Stub PyJWKClient.get_signing_key_from_jwt to return our test EC key,
    so the test never makes a real network call to Supabase's JWKS endpoint."""
    from app import auth as auth_module

    signing_key = PyJWK.from_dict(EC_PUBLIC_JWK)

    class _FakeJWKClient:
        def __init__(self, *_args, **_kwargs):
            pass

        def get_signing_key_from_jwt(self, _token):
            return signing_key

    monkeypatch.setattr(auth_module, "_jwks_client", None)
    monkeypatch.setattr(auth_module.jwt, "PyJWKClient", _FakeJWKClient)
    yield
    monkeypatch.setattr(auth_module, "_jwks_client", None)


def test_es256_token_returns_operator_id(client, jwks_client):
    token = _mint_es256(_valid_payload())
    resp = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {"operator_id": OPERATOR_ID}


def test_es256_wrong_key_is_rejected(client, jwks_client):
    other_key_payload = _valid_payload()
    # Sign with a DIFFERENT EC key than the one the fake JWKS client returns.
    from cryptography.hazmat.primitives.asymmetric import ec

    wrong_key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(other_key_payload, wrong_key, algorithm="ES256", headers={"kid": "test-es256-kid"})
    _assert_generic_401(client.get("/whoami", headers={"Authorization": f"Bearer {token}"}))


def test_es256_expired_token_is_rejected(client, jwks_client):
    token = _mint_es256(_valid_payload(exp=int(time.time()) - 10))
    _assert_generic_401(client.get("/whoami", headers={"Authorization": f"Bearer {token}"}))


def test_unsupported_alg_is_rejected(client):
    # alg "none" must never be accepted regardless of header claims.
    token = jwt.encode(_valid_payload(), key="", algorithm="none")
    _assert_generic_401(client.get("/whoami", headers={"Authorization": f"Bearer {token}"}))

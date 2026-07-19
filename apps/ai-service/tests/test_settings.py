import pytest
from pydantic import ValidationError

from app.settings import Settings, get_settings

REQUIRED = {
    "GROQ_API_KEY": "gsk-test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role-key",
    "SUPABASE_JWT_SECRET": "jwt-secret",
    "BADGE_SIGNING_SECRET": "badge-signing-secret",
}


def _clear_env(monkeypatch):
    for key in (*REQUIRED, "DIGEST_MODEL"):
        monkeypatch.delenv(key, raising=False)


def test_missing_required_var_raises(monkeypatch):
    _clear_env(monkeypatch)
    # _env_file=None makes this hermetic: do not read any stray real .env.
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_all_required_present_and_digest_model_defaults(monkeypatch):
    _clear_env(monkeypatch)
    settings = Settings(_env_file=None, **REQUIRED)
    assert settings.GROQ_API_KEY == "gsk-test"
    assert settings.SUPABASE_URL == "https://example.supabase.co"
    assert settings.SUPABASE_SERVICE_ROLE_KEY == "service-role-key"
    assert settings.SUPABASE_JWT_SECRET == "jwt-secret"
    assert settings.DIGEST_MODEL == "openai/gpt-oss-120b"
    assert settings.BADGE_SIGNING_SECRET == "badge-signing-secret"
    assert settings.BADGE_TOKEN_TTL_SECONDS == 300


def test_digest_model_override(monkeypatch):
    _clear_env(monkeypatch)
    settings = Settings(_env_file=None, DIGEST_MODEL="openai/gpt-oss-20b", **REQUIRED)
    assert settings.DIGEST_MODEL == "openai/gpt-oss-20b"


def test_get_settings_is_cached(monkeypatch):
    get_settings.cache_clear()
    for key, val in REQUIRED.items():
        monkeypatch.setenv(key, val)
    try:
        first = get_settings()
        second = get_settings()
        assert first is second
    finally:
        get_settings.cache_clear()

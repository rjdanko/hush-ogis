"""Service configuration loaded lazily from the environment.

Settings are constructed on first use via ``get_settings()`` so that missing
required vars fail fast at call time, not at import time -- this keeps ``/health``
and the test suite importable without a fully populated env.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ANTHROPIC_API_KEY: str
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_JWT_SECRET: str
    DIGEST_MODEL: str = "claude-haiku-4-5"


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance, constructed on first call."""
    return Settings()

"""Service configuration loaded lazily from the environment.

Settings are constructed on first use via ``get_settings()`` so that missing
required vars fail fast at call time, not at import time -- this keeps ``/health``
and the test suite importable without a fully populated env.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve relative to this file's location (apps/ai-service/app/settings.py ->
# apps/ai-service/.env), not the process's current working directory. This
# keeps `.env` loading correct whether the service is launched from the repo
# root (e.g. `bash scripts/run-ai.sh`, which passes `--app-dir apps/ai-service`
# to uvicorn) or from inside `apps/ai-service/` directly.
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    ANTHROPIC_API_KEY: str
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_JWT_SECRET: str
    DIGEST_MODEL: str = "claude-haiku-4-5"
    BADGE_SIGNING_SECRET: str
    BADGE_TOKEN_TTL_SECONDS: int = 300


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance, constructed on first call."""
    return Settings()

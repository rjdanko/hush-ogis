"""Supabase client built with the service-role key (server-only, SR-2).

The service-role key must live ONLY here in the service -- never spread to
other modules or any client bundle. This module exposes a single RPC call to
the anonymized ``zone_weekly_metrics`` Postgres function.
"""

from functools import lru_cache

from supabase import Client, create_client

from app.settings import get_settings


class ZoneNotAuthorizedError(Exception):
    """Raised when the DB function reports ``not_authorized`` for the operator/zone."""


@lru_cache
def _client() -> Client:
    """Return a cached Supabase client using the service-role key (server-only)."""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def fetch_zone_weekly_metrics(zone_id: str, operator_id: str) -> dict:
    """Call the ``zone_weekly_metrics`` RPC and return its jsonb result as a dict.

    Translates the DB function's ``not_authorized`` error into
    ``ZoneNotAuthorizedError``; other errors propagate unchanged.
    """
    try:
        response = (
            _client()
            .rpc(
                "zone_weekly_metrics",
                {"p_zone_id": zone_id, "p_operator_id": operator_id},
            )
            .execute()
        )
    except Exception as exc:  # noqa: BLE001 -- inspect, then re-raise or translate
        if "not_authorized" in _error_text(exc):
            raise ZoneNotAuthorizedError(str(exc)) from exc
        raise

    return response.data


def _error_text(exc: Exception) -> str:
    """Gather searchable text from an exception (message + any PostgREST details)."""
    parts = [str(exc)]
    for attr in ("message", "details", "hint", "code"):
        value = getattr(exc, attr, None)
        if value:
            parts.append(str(value))
    return " ".join(parts)

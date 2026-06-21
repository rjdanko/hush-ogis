"""Tests for the Claude weekly-digest generation (B5).

The Anthropic client is fully mocked -- NO network happens. We verify:
- the rendered prompt carries the aggregated numbers,
- no user-identifier-like content leaks into the prompt (privacy / PRD 7.3),
- a mocked structured response maps cleanly onto ``DigestResponse``.
"""

from types import SimpleNamespace

import pytest

from app import digest
from app.models import DigestResponse, Suggestion


SENTINEL_UUID = "11111111-2222-3333-4444-555555555555"


def sample_metrics() -> dict:
    return {
        "zone_name": "The Quiet Corner",
        "window_days": 7,
        "quiet_index_trend": [
            {"day": "2026-06-15", "avg_value": 80.0, "avg_active_count": 5.0},
            {"day": "2026-06-16", "avg_value": 72.5, "avg_active_count": 4.0},
        ],
        "check_in_count": 37,
        "total_quiet_minutes": 1840.0,
        "total_points_accrued": 920,
        "redemption_count": 6,
        "peak_window": {"hour_of_day": 14, "max_active_count": 8},
    }


def test_build_user_content_contains_aggregated_numbers():
    metrics = sample_metrics()
    content = digest.build_user_content(metrics)

    assert "The Quiet Corner" in content
    assert "37" in content  # check_in_count
    assert "920" in content  # total_points_accrued


def test_build_messages_is_user_role_with_aggregated_numbers():
    metrics = sample_metrics()
    messages = digest.build_messages(metrics)

    assert isinstance(messages, list)
    assert len(messages) == 1
    assert messages[0]["role"] == "user"

    text = str(messages[0]["content"])
    assert "The Quiet Corner" in text
    assert "37" in text
    assert "920" in text


def test_prompt_has_no_user_identifiers():
    """Privacy guard (SR / PRD 7.3): only aggregated keys are rendered.

    The metrics dict has no per-user fields. Assert a sentinel UUID injected
    *outside* the known keys never reaches the prompt, and that no
    ``user_id``-like token appears.
    """
    metrics = sample_metrics()
    # Someone later stuffing a raw row in must not silently leak it.
    metrics_with_stray = {**metrics, "user_id": SENTINEL_UUID, "device_token": SENTINEL_UUID}

    content = digest.build_user_content(metrics_with_stray)

    assert SENTINEL_UUID not in content
    assert "user_id" not in content
    assert "device_token" not in content
    assert "auth.uid" not in content


def test_system_prompt_is_calm_anti_engagement():
    system = digest.SYSTEM_PROMPT.lower()
    # Calm, factual, non-hype framing.
    assert "calm" in system or "plain" in system
    # 2-4 gentle suggestions.
    assert "suggestion" in system


def test_generate_digest_maps_structured_response(monkeypatch):
    expected = DigestResponse(
        summary="A calm, steady week in the zone.",
        suggestions=[
            Suggestion(title="Keep the afternoon rhythm", body="The 2pm window is your busiest."),
            Suggestion(title="Gently invite a few more", body="A small nudge could help."),
        ],
    )

    captured = {}

    class FakeMessages:
        def parse(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(parsed_output=expected)

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr(digest, "_client", lambda: FakeClient())
    monkeypatch.setattr(
        digest,
        "get_settings",
        lambda: SimpleNamespace(ANTHROPIC_API_KEY="test-key", DIGEST_MODEL="claude-haiku-4-5"),
    )

    result = digest.generate_digest(sample_metrics())

    assert isinstance(result, DigestResponse)
    assert result.summary == "A calm, steady week in the zone."
    assert len(result.suggestions) == 2
    assert result.suggestions[0].title == "Keep the afternoon rhythm"

    # Bound to the structured-output surface with the right model + DTO.
    assert captured["output_format"] is DigestResponse
    assert captured["model"]  # model id from settings
    assert captured["max_tokens"] == 2048
    # No effort/thinking params -- identical call across both model ids.
    assert "effort" not in captured
    assert "thinking" not in captured


def test_generate_digest_coerces_dict_parsed_output(monkeypatch):
    """If parsed_output arrives as a dict, generate_digest validates it."""
    payload = {
        "summary": "Quiet and low-key.",
        "suggestions": [{"title": "Rest", "body": "Low activity is fine."}],
    }

    class FakeMessages:
        def parse(self, **kwargs):
            return SimpleNamespace(parsed_output=payload)

    class FakeClient:
        messages = FakeMessages()

    monkeypatch.setattr(digest, "_client", lambda: FakeClient())
    monkeypatch.setattr(
        digest,
        "get_settings",
        lambda: SimpleNamespace(ANTHROPIC_API_KEY="test-key", DIGEST_MODEL="claude-haiku-4-5"),
    )

    result = digest.generate_digest(sample_metrics())
    assert isinstance(result, DigestResponse)
    assert result.summary == "Quiet and low-key."
    assert result.suggestions[0].title == "Rest"


def test_client_built_lazily(monkeypatch):
    """The Anthropic client is constructed on demand, not at import time."""
    digest._client.cache_clear()

    constructed = {}

    class FakeAnthropic:
        def __init__(self, *, api_key):
            constructed["api_key"] = api_key

    monkeypatch.setattr(digest, "Anthropic", FakeAnthropic)
    monkeypatch.setattr(
        digest,
        "get_settings",
        lambda: SimpleNamespace(ANTHROPIC_API_KEY="test-key", DIGEST_MODEL="claude-haiku-4-5"),
    )

    client = digest._client()
    assert isinstance(client, FakeAnthropic)
    assert constructed["api_key"] == "test-key"
    digest._client.cache_clear()
